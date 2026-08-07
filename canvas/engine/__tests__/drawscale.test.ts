import "@elements/register";
import { describe, expect, it } from "vitest";
import type { FormatDescriptor } from "@model/geometry";
import { scaleDrawContext } from "@engine/drawscale";
import { composeSection } from "@elements/compose";
import { resolveProfile } from "@engine/profile";
import { inst, layoutCtx, recordingDrawContext, sectionOf, tokens } from "@canvas/testkit";
import type { DrawCall } from "@canvas/testkit";
import type { EngineNode } from "@engine/node";

const deck = resolveProfile("deck");
const scaled = (k: number): FormatDescriptor => ({ ...deck, id: "scaled", tokenScale: k });

describe("scaleDrawContext", () => {
    const draw = (k: number): DrawCall[] => {
        const { ctx, calls } = recordingDrawContext();
        const g = scaleDrawContext(ctx, k);
        g.rect(10, 20, 100, 50, { fill: "#abc", width: 2, radius: 4, dash: [3, 6] });
        g.circle(30, 40, 8, { stroke: "#000" });
        g.line(0, 0, 10, 10, {});
        g.polyline(
            [
                [1, 2],
                [3, 4],
            ],
            {},
        );
        g.wedge(50, 50, 20, 0.5, 1.5, {});
        g.text("hi", 5, 6, { size: 11, fill: "#111" });
        g.path((s) => {
            s.moveTo(1, 1);
            s.lineTo(2, 2);
            s.arc(4, 4, 2, 0.25, 0.75);
            s.closePath();
        }, {});
        return calls;
    };

    it("returns the same context at 1, so an unscaled format is untouched", () => {
        const { ctx } = recordingDrawContext();
        expect(scaleDrawContext(ctx, 1)).toBe(ctx);
    });

    it("doubles every coordinate and length", () => {
        const [a, b] = [draw(1), draw(2)];
        const rectA = a.find((c) => c.op === "rect")!;
        const rectB = b.find((c) => c.op === "rect")!;
        expect(rectB.x).toBe((rectA.x as number) * 2);
        expect(rectB.w).toBe((rectA.w as number) * 2);
        const circleB = b.find((c) => c.op === "circle")!;
        expect(circleB.r).toBe(16);
        const lineB = b.find((c) => c.op === "line")!;
        expect(lineB.x2).toBe(20);
    });

    it("doubles stroke width, corner radius, dash, and font size", () => {
        const b = draw(2);
        const rect = b.find((c) => c.op === "rect")!;
        const style = rect.style as { width: number; radius: number; dash: number[]; fill: string };
        expect(style.width).toBe(4);
        expect(style.radius).toBe(8);
        expect(style.dash).toEqual([6, 12]);
        expect(style.fill).toBe("#abc"); // a colour is not a length
        const text = b.find((c) => c.op === "text")!;
        expect((text.style as { size: number }).size).toBe(22);
    });

    it("leaves angles alone — they are not lengths", () => {
        const b = draw(2);
        const wedge = b.find((c) => c.op === "wedge")!;
        expect(wedge.startRad ?? wedge.a0).toBe(0.5);
        expect(wedge.endRad ?? wedge.a1).toBe(1.5);
        const arc = b.find((c) => c.op === "arc")!;
        expect(arc.r).toBe(4); // radius scaled
        expect(arc.startRad ?? arc.a0).toBe(0.25); // angle not
    });

    it("scales through a path sink", () => {
        const b = draw(2);
        expect(b.find((c) => c.op === "moveTo")).toMatchObject({ x: 2, y: 2 });
        expect(b.find((c) => c.op === "lineTo")).toMatchObject({ x: 4, y: 4 });
    });

    it("measures in the renderer's own space, unscaled", () => {
        const { ctx } = recordingDrawContext();
        const one = ctx.measureText("hello", { size: 11 });
        const two = scaleDrawContext(ctx, 2).measureText("hello", { size: 11 });
        expect(two).toEqual(one);
    });
});

// the point of the wrapper: a real chart, with its own hardcoded label sizes, scales without any
// renderer change
const findSurface = (n: EngineNode): EngineNode | null => {
    if (n.surface) return n;
    for (const c of n.children ?? []) {
        const found = findSurface(c);
        if (found) return found;
    }
    return null;
};

describe("a chart scales with the format", () => {
    const chart = sectionOf(
        inst("barChart", { type: "bar", values: "10,20,30", categories: "A,B,C" }),
    );
    const paintAt = (k: number): DrawCall[] => {
        const node = findSurface(composeSection(chart, layoutCtx(1280, scaled(k), tokens)))!;
        const { ctx, calls } = recordingDrawContext();
        node.surface!.paint(ctx, { x: 0, y: 0, w: 800 * k, h: 400 * k });
        return calls;
    };

    it("draws the same primitives at both scales", () => {
        expect(paintAt(2).map((c) => c.op)).toEqual(paintAt(1).map((c) => c.op));
    });

    it("doubles its axis label sizes without the renderer knowing", () => {
        const sizeOf = (calls: DrawCall[]): number[] =>
            calls
                .filter((c) => c.op === "text")
                .map((c) => (c.style as { size?: number }).size ?? 0);
        const one = sizeOf(paintAt(1));
        const two = sizeOf(paintAt(2));
        expect(one.length).toBeGreaterThan(0);
        expect(two).toEqual(one.map((s) => s * 2));
    });

    it("keeps every drawn coordinate inside the doubled box", () => {
        const xs = paintAt(2)
            .filter((c) => typeof c.x === "number")
            .map((c) => c.x as number);
        expect(Math.max(...xs)).toBeLessThanOrEqual(800 * 2 + 1);
    });
});
