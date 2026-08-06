import "@elements/register";
import { describe, expect, it } from "vitest";
import { getElement } from "@elements/spec";
import {
    ICON_LIBRARY,
    drawIcon,
    drawVector,
    parseSvg,
    shapeVector,
    type ShapeKind,
} from "@elements/media/vector";
import type { Paint } from "@model/elements";
import { layoutCtx, recordingDrawContext, tokens } from "@canvas/testkit";
import type { DrawCall } from "@canvas/testkit";

function coords(c: DrawCall): [number, number][] {
    const pts: [number, number][] = [];
    const p = (x: unknown, y: unknown): void => {
        if (typeof x === "number" && typeof y === "number") pts.push([x, y]);
    };
    switch (c.op) {
        case "rect":
            p(c.x, c.y);
            p((c.x as number) + (c.w as number), (c.y as number) + (c.h as number));
            break;
        case "circle":
            p((c.cx as number) - (c.r as number), (c.cy as number) - (c.r as number));
            p((c.cx as number) + (c.r as number), (c.cy as number) + (c.r as number));
            break;
        case "line":
            p(c.x1, c.y1);
            p(c.x2, c.y2);
            break;
        case "moveTo":
        case "lineTo":
            p(c.x, c.y);
            break;
        case "bezierCurveTo":
            p(c.cp1x, c.cp1y);
            p(c.cp2x, c.cp2y);
            p(c.x, c.y);
            break;
    }
    return pts;
}
const stroke = (c: DrawCall): string | undefined => (c.style as { stroke?: string }).stroke;

describe("parseSvg", () => {
    it("lifts primitives + path into typed nodes", () => {
        const v = parseSvg(
            `<circle cx="11" cy="11" r="7"/><line x1="1" y1="1" x2="2" y2="2"/>`,
            "0 0 24 24",
        );
        expect(v.vb).toEqual([0, 0, 24, 24]);
        expect(v.nodes.map((n) => n.t)).toEqual(["ellipse", "line"]);
    });
    it("reads the viewBox from a full <svg> document", () => {
        const v = parseSvg(`<svg viewBox="0 0 48 48"><path d="M0 0L1 1"/></svg>`);
        expect(v.vb).toEqual([0, 0, 48, 48]);
        expect(v.nodes[0]!.t).toBe("path");
    });
    it("drops unsupported / unsafe tags (script, image, use)", () => {
        const v = parseSvg(
            `<script>x()</script><image href="e.png"/><use href="#a"/><rect x="0" y="0" width="4" height="4"/>`,
            "0 0 8 8",
        );
        expect(v.nodes.map((n) => n.t)).toEqual(["rect"]);
    });
    it("keeps <g> nesting and currentColor / none paints", () => {
        const v = parseSvg(
            `<g stroke="currentColor" fill="none"><path d="M0 0L1 1"/></g>`,
            "0 0 24 24",
        );
        const g = v.nodes[0]!;
        expect(g.t).toBe("group");
        if (g.t === "group") {
            expect(g.style?.stroke).toBe("currentColor");
            expect(g.style?.fill).toBe("none");
            expect(g.children[0]!.t).toBe("path");
        }
    });
});

describe("drawIcon / drawVector", () => {
    it("tints a stroke glyph to one color", () => {
        const { ctx, calls } = recordingDrawContext();
        drawIcon(ctx, ICON_LIBRARY.search!, 0, 0, 40, "#334155");
        expect(calls.some((c) => c.op === "path")).toBe(true); // circle → ellipse → path
        expect(calls.some((c) => c.op === "line")).toBe(true);
        expect(stroke(calls.find((c) => c.op === "line")!)).toBe("#334155");
    });
    it("converts a path arc into bezier segments", () => {
        const { ctx, calls } = recordingDrawContext();
        drawIcon(ctx, ICON_LIBRARY.cycle!, 0, 0, 40, "#000");
        expect(calls.some((c) => c.op === "path")).toBe(true);
        expect(calls.some((c) => c.op === "bezierCurveTo")).toBe(true);
    });
    it("resolves a theme-role tint against the theme", () => {
        const { ctx, calls } = recordingDrawContext();
        const v = parseSvg(`<path d="M0 0L10 10" stroke="currentColor"/>`, "0 0 24 24");
        drawVector(ctx, { x: 0, y: 0, w: 24, h: 24 }, v, tokens, { tint: { role: "accent" } });
        expect(stroke(calls.find((c) => c.op === "path")!)).toBe(tokens.accent);
    });
    it("keeps every icon inside its target box", () => {
        for (const [name, glyph] of Object.entries(ICON_LIBRARY)) {
            const { ctx, calls } = recordingDrawContext();
            drawIcon(ctx, glyph, 10, 20, 40, "#111");
            expect(calls.length, name).toBeGreaterThan(0);
            for (const c of calls)
                for (const [x, y] of coords(c)) {
                    expect(x, `${name} x`).toBeGreaterThanOrEqual(9);
                    expect(x, `${name} x`).toBeLessThanOrEqual(51);
                    expect(y, `${name} y`).toBeGreaterThanOrEqual(19);
                    expect(y, `${name} y`).toBeLessThanOrEqual(61);
                }
        }
    });
});

describe("shapeVector", () => {
    const accent: Paint = { role: "accent" };
    const paint = (kind: ShapeKind, w = 100, h = 100): DrawCall[] => {
        const { ctx, calls } = recordingDrawContext();
        drawVector(ctx, { x: 0, y: 0, w, h }, shapeVector(kind, w, h, { fill: accent }), tokens);
        return calls;
    };
    it("rectangle draws one rect", () => {
        expect(paint("rectangle").filter((c) => c.op === "rect")).toHaveLength(1);
    });
    it("ellipse draws a 4-curve bezier path", () => {
        const c = paint("ellipse");
        expect(c.some((x) => x.op === "path")).toBe(true);
        expect(c.filter((x) => x.op === "bezierCurveTo")).toHaveLength(4);
    });
    it("star draws a 10-vertex path (1 moveTo + 9 lineTo)", () => {
        const c = paint("star");
        expect(c.filter((x) => x.op === "moveTo")).toHaveLength(1);
        expect(c.filter((x) => x.op === "lineTo")).toHaveLength(9);
    });
    it("line draws a single stroked line", () => {
        expect(paint("line", 100, 44).filter((c) => c.op === "line")).toHaveLength(1);
    });
});

describe("graphic element", () => {
    it("renders its stored doc through the surface", () => {
        const spec = getElement("graphic")!;
        const node = spec.layout(spec.create(), layoutCtx());
        const { ctx, calls } = recordingDrawContext();
        node.surface!.paint(ctx, { x: 0, y: 0, w: 100, h: 100 });
        expect(calls.length).toBeGreaterThan(0);
    });
});
