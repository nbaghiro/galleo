import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode, TextLeaf } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement } from "@elements/spec";
import { layoutCtx, tokens } from "@canvas/testkit";

const ctx = layoutCtx();
const spec = (type: string): ElementSpec => getElement(type)!;
const nodeOf = (type: string, over: Record<string, unknown> = {}): EngineNode =>
    spec(type).layout({ ...(spec(type).create() as Record<string, unknown>), ...over }, ctx);

const walk = (n: EngineNode, visit: (n: EngineNode) => void): void => {
    visit(n);
    for (const c of n.children ?? []) walk(c, visit);
};
const allText = (n: EngineNode): TextLeaf[] => {
    const out: TextLeaf[] = [];
    walk(n, (x) => {
        if (x.text) out.push(x.text);
    });
    return out;
};
const percentWidths = (n: EngineNode): number[] => {
    const out: number[] = [];
    walk(n, (x) => {
        if (x.w.mode === "percent") out.push(x.w.value);
    });
    return out;
};
const cell = (t: string): { type: string; data: unknown } => ({
    type: "text",
    data: { text: t, style: "caption" },
});

describe("table", () => {
    it("default grid: surface panel, bold-ink header cells, soft body cells", () => {
        const n = nodeOf("table");
        expect(n.fill?.color).toBe(tokens.surface);
        expect(n.fill?.radius).toBe(9); // round(18 / 2)
        const texts = allText(n);
        expect(texts.some((t) => t.weight === 700 && t.color === tokens.ink)).toBe(true);
        expect(texts.some((t) => t.weight === 400 && t.color === tokens.soft)).toBe(true);
    });
    it("cell width is 1 / cols", () => {
        expect(percentWidths(nodeOf("table"))).toContain(1 / 3);
    });
    it("grid() clamps columns to MAX_COLS (8)", () => {
        const cells = Array.from({ length: 40 }, (_, i) => cell(String(i)));
        const n = spec("table").layout({ cols: 20, rows: 2, cells }, ctx);
        expect(percentWidths(n)).toContain(1 / 8);
    });
});

describe("stat", () => {
    it("stacks its children in a tight column", () => {
        const n = nodeOf("stat");
        expect(n.direction).toBe("col");
        expect(n.gap).toBe(6);
    });
});
