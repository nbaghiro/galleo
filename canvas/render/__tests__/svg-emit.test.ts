import { describe, expect, it } from "vitest";
import { buildPathData, svgStringContext } from "@canvas/render/svg-emit";

describe("buildPathData", () => {
    it("serializes sink ops into an SVG path `d` string", () => {
        const d = buildPathData((s) => {
            s.moveTo(0, 0);
            s.lineTo(10, 0);
            s.bezierCurveTo(1, 2, 3, 4, 5, 6);
            s.quadraticCurveTo(1, 1, 2, 2);
            s.closePath();
        });
        expect(d).toBe("M0 0L10 0C1 2 3 4 5 6Q1 1 2 2Z");
    });
    it("converts a full-circle arc into cubic segments", () => {
        const d = buildPathData((s) => s.arc(50, 50, 20, 0, Math.PI * 2, false));
        expect(d.startsWith("M70 50")).toBe(true);
        expect((d.match(/C/g) ?? []).length).toBe(4); // 360° → four ≤90° cubics
    });
});

describe("svgStringContext", () => {
    it("emits each primitive into a self-contained SVG string", () => {
        const { ctx, svg } = svgStringContext(100, 50);
        ctx.rect(0, 0, 10, 10, { fill: "#f00", radius: 2 });
        ctx.circle(5, 5, 3, { stroke: "#00f", width: 1 });
        ctx.line(0, 0, 9, 9, { stroke: "#000" });
        ctx.polyline(
            [
                [0, 0],
                [5, 5],
            ],
            { fill: "#0f0" },
        );
        ctx.path(
            (s) => {
                s.moveTo(0, 0);
                s.lineTo(5, 5);
                s.closePath();
            },
            { fill: "#0f0", fillRule: "evenodd" },
        );
        ctx.text("hi", 5, 5, { size: 12, align: "center" });
        const out = svg();
        expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(out).toContain('viewBox="0 0 100 50"');
        expect(out).toContain('<rect x="0" y="0" width="10" height="10" rx="2" fill="#f00"');
        expect(out).toContain('<circle cx="5" cy="5" r="3" fill="none" stroke="#00f"');
        expect(out).toContain("<line");
        expect(out).toContain("<polygon"); // filled polyline → polygon
        expect(out).toContain('fill-rule="evenodd"');
        expect(out).toContain('text-anchor="middle"');
        expect(out).toContain(">hi</text>");
    });
    it("escapes text content", () => {
        const { ctx, svg } = svgStringContext(10, 10);
        ctx.text("a<b>&c", 0, 0, {});
        expect(svg()).toContain(">a&lt;b&gt;&amp;c</text>");
    });
});
