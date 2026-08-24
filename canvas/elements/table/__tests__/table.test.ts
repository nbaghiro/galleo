import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode, Rect, TextLeaf } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement } from "@elements/spec";
import { hexA } from "@themes";
import { layoutCtx, near, runLayout, tokens } from "@canvas/testkit";

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
const cell = (t: string): { type: string; data: unknown } => ({
    type: "text",
    data: { text: t, style: "caption" },
});

// Zebra paints one rect per cell of the odd rows, so the banded boxes ARE the resolved columns.
const columnBoxes = (texts: string[], cols: number, width = 800): Rect[] => {
    const n = spec("table").layout(
        {
            cols,
            rows: texts.length / cols,
            cells: texts.map(cell),
            zebra: true,
            header: false,
            lines: "none",
        },
        layoutCtx(width),
    );
    return runLayout(n, width, 400)
        .commands.filter((c) => c.kind === "rect" && c.fill?.color === hexA(tokens.ink, 0.05))
        .map((c) => c.box);
};

describe("table", () => {
    it("default grid: surface panel, bold-ink header cells, soft body cells", () => {
        const n = nodeOf("table");
        expect(n.fill?.color).toBe(tokens.surface);
        expect(n.fill?.radius).toBe(9); // round(18 / 2)
        const texts = allText(n);
        expect(texts.some((t) => t.weight === 700 && t.color === tokens.ink)).toBe(true);
        expect(texts.some((t) => t.weight === 400 && t.color === tokens.soft)).toBe(true);
    });
    it("is one grid of cells, one track per column", () => {
        const n = nodeOf("table");
        expect(n.direction).toBe("grid");
        expect(n.columns).toBe(3);
        expect(n.children).toHaveLength(12); // 4 rows x 3 columns, no row wrappers
    });
    it("grid() clamps columns to MAX_COLS (8)", () => {
        const cells = Array.from({ length: 40 }, (_, i) => cell(String(i)));
        expect(spec("table").layout({ cols: 20, rows: 2, cells }, ctx).columns).toBe(8);
    });
    it("a long column takes the room a short one does not need", () => {
        const [short, long] = columnBoxes(["ID", "What this row is actually about", "7", "x"], 2);
        // each track starts at its content width, then shares what is left: 291 / 509, not 400 / 400
        expect(short!.w).toBeLessThan(400);
        expect(long!.w - short!.w).toBeGreaterThan(150);
        near(short!.x, 0);
        near(long!.x, short!.w);
    });
    it("equal content still splits evenly", () => {
        const [a, b] = columnBoxes(["ID", "ID", "7", "7"], 2);
        near(a!.w, b!.w);
    });
    it("a wide table squeezes into a narrow column instead of overflowing it", () => {
        const boxes = columnBoxes(
            Array.from({ length: 16 }, (_, i) => `c${i}`),
            8,
            320,
        );
        expect(boxes).toHaveLength(8);
        near(
            boxes.reduce((sum, b) => sum + b.w, 0),
            320,
        );
    });
    it("the columns fill the table's width whatever their content", () => {
        for (const texts of [
            ["ID", "What this row is actually about", "7", "x"],
            ["a", "b", "c", "d"],
        ]) {
            const boxes = columnBoxes(texts, 2);
            near(
                boxes.reduce((sum, b) => sum + b.w, 0),
                800,
            );
        }
    });
});

describe("stat", () => {
    it("stacks its children in a tight column", () => {
        const n = nodeOf("stat");
        expect(n.direction).toBe("col");
        expect(n.gap).toBe(6);
    });
});
