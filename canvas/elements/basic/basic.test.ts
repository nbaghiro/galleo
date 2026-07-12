import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement } from "@elements/spec";
import type { DrawCall } from "@canvas/testkit";
import { layoutCtx, recordingDrawContext, tokens } from "@canvas/testkit";

const ctx = layoutCtx();
const spec = (type: string): ElementSpec => getElement(type)!;
const nodeOf = (type: string, over: Record<string, unknown> = {}): EngineNode =>
    spec(type).layout({ ...(spec(type).create() as Record<string, unknown>), ...over }, ctx);
const kids = (n: EngineNode): EngineNode[] => n.children ?? [];

describe("shape (surface renderer)", () => {
    const paintOf = (data: Record<string, unknown>): DrawCall[] => {
        const { ctx: rec, calls } = recordingDrawContext();
        spec("shape").layout(data, ctx).surface!.paint(rec, { x: 0, y: 0, w: 100, h: 100 });
        return calls;
    };
    it("defaults to a 160px-tall surface node", () => {
        expect(nodeOf("shape").h).toEqual({ mode: "fixed", value: 160 });
        expect(nodeOf("shape").surface).toBeDefined();
    });
    it("a rectangle draws one rect", () => {
        expect(
            paintOf({ kind: "rectangle", height: 100 }).filter((c) => c.op === "rect"),
        ).toHaveLength(1);
    });
    it("an ellipse draws a 4-curve bezier path", () => {
        const calls = paintOf({ kind: "ellipse", height: 100 });
        expect(calls.some((c) => c.op === "path")).toBe(true);
        expect(calls.filter((c) => c.op === "bezierCurveTo")).toHaveLength(4);
    });
    it("a star draws a 10-vertex path (1 moveTo + 9 lineTo)", () => {
        const calls = paintOf({ kind: "star", height: 100 });
        expect(calls.filter((c) => c.op === "moveTo")).toHaveLength(1);
        expect(calls.filter((c) => c.op === "lineTo")).toHaveLength(9);
    });
    it("a line draws a single stroked line", () => {
        expect(paintOf({ kind: "line", height: 44 }).filter((c) => c.op === "line")).toHaveLength(
            1,
        );
    });
});

describe("button", () => {
    it("filled / md / rounded default", () => {
        const n = nodeOf("button");
        expect(n.h).toEqual({ mode: "fixed", value: 42 });
        expect(n.fill?.color).toBe(tokens.accent);
        expect(n.fill?.radius).toBe(14); // min(14, round(theme.radius 18))
        expect(n.fill?.border).toBeUndefined();
        expect(kids(n).find((c) => c.text)?.text?.color).toBe(tokens.onAccent);
    });
    it("outline is transparent with an accent border", () => {
        const n = nodeOf("button", { variant: "outline" });
        expect(n.fill?.color).toBe("transparent");
        expect(n.fill?.border).toEqual({ color: tokens.accent, width: 1.5 });
    });
    it("shape drives the radius: pill = h/2, sharp = 2", () => {
        expect(nodeOf("button", { shape: "pill" }).fill?.radius).toBe(21); // round(42/2)
        expect(nodeOf("button", { shape: "sharp" }).fill?.radius).toBe(2);
    });
});

describe("divider / spacer / gradient / badge / embed", () => {
    it("divider is a thin line in the theme line color", () => {
        const n = nodeOf("divider");
        expect(n.h).toEqual({ mode: "fixed", value: 2 });
        expect(n.fill?.color).toBe(tokens.line);
        expect(n.fill?.radius).toBe(1);
    });
    it("spacer is a fixed-height gap with no fill", () => {
        const n = nodeOf("spacer");
        expect(n.h).toEqual({ mode: "fixed", value: 32 });
        expect(n.fill).toBeUndefined();
    });
    it("gradient paints a gradient fill", () => {
        const n = nodeOf("gradient");
        expect(n.fill?.gradient).toEqual({ from: "#9a4f24", to: "#f4f0e8", angle: 135 });
        expect(n.fill?.radius).toBe(12); // round(18 / 1.5)
    });
    it("badge is a rounded pill with an accent border + mono accent text", () => {
        const n = nodeOf("badge");
        expect(n.fill?.radius).toBe(99);
        expect(n.fill?.border).toEqual({ color: tokens.accent, width: 1.3 });
        expect(kids(n)[0]!.text?.color).toBe(tokens.accent);
    });
    it("embed is a bordered row card", () => {
        const n = nodeOf("embed");
        expect(n.direction).toBe("row");
        expect(n.fill?.radius).toBe(9); // round(18 / 2)
    });
});
