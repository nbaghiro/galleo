// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import { svgDrawContext } from "@canvas/render/backends";
import { installCanvas2D, layoutCtx } from "@canvas/testkit";
import { listElements } from "@elements/spec";

beforeAll(() => installCanvas2D());

const SVG_NS = "http://www.w3.org/2000/svg";
const newSvg = (): SVGSVGElement => document.createElementNS(SVG_NS, "svg") as SVGSVGElement;

describe("svgDrawContext", () => {
    it("emits one SVG element per primitive", () => {
        const svg = newSvg();
        const g = svgDrawContext(svg);
        g.rect(0, 0, 10, 10, { fill: "#f00", radius: 2 });
        g.circle(5, 5, 3, { stroke: "#00f", width: 1 });
        g.line(0, 0, 10, 10, { stroke: "#000" });
        g.polyline(
            [
                [0, 0],
                [5, 5],
            ],
            { fill: "#0f0" },
        );
        g.wedge(5, 5, 4, 0, Math.PI, { fill: "#333" });
        g.path(
            (s) => {
                s.moveTo(0, 0);
                s.bezierCurveTo(1, 1, 2, 2, 3, 3);
                s.closePath();
            },
            { fill: "#0f0", fillRule: "evenodd" },
        );
        g.text("hi", 5, 5, { size: 12, align: "center" });
        const tags = [...svg.childNodes].map((n) => (n as Element).tagName);
        expect(tags).toEqual(["rect", "circle", "line", "polygon", "path", "path", "text"]);
        expect(svg.querySelector("rect")!.getAttribute("rx")).toBe("2");
        expect(svg.querySelector("text")!.textContent).toBe("hi");
        expect(svg.querySelectorAll("path")[1]!.getAttribute("fill-rule")).toBe("evenodd");
    });

    it("resolves a gradient fill to a defs linearGradient and a url() fill", () => {
        const svg = newSvg();
        const g = svgDrawContext(svg);
        g.rect(0, 0, 10, 10, { gradient: { from: "#111111", to: "#eeeeee", angle: 90 } });
        const grad = svg.querySelector("defs linearGradient")!;
        expect(grad).toBeTruthy();
        expect(grad.getAttribute("gradientUnits")).toBe("objectBoundingBox");
        expect(grad.querySelectorAll("stop")).toHaveLength(2);
        const rect = svg.querySelector("rect")!;
        expect(rect.getAttribute("fill")).toBe(`url(#${grad.getAttribute("id")})`);
    });

    it("attaches a shadow as a widened feDropShadow filter on the filled shape", () => {
        const svg = newSvg();
        const g = svgDrawContext(svg);
        g.rect(0, 0, 10, 10, {
            fill: "#f00",
            shadow: { blur: 8, dy: 2, color: "rgba(0,0,0,0.25)" },
        });
        const filter = svg.querySelector("defs filter")!;
        expect(filter).toBeTruthy();
        const drop = filter.querySelector("feDropShadow")!;
        expect(drop.getAttribute("dy")).toBe("2");
        expect(drop.getAttribute("stdDeviation")).toBe("4");
        expect(svg.querySelector("rect")!.getAttribute("filter")).toBe(
            `url(#${filter.getAttribute("id")})`,
        );
    });

    it("never decorates stroke-only shapes with gradient or shadow", () => {
        const svg = newSvg();
        const g = svgDrawContext(svg);
        g.line(0, 0, 5, 5, {
            stroke: "#000",
            gradient: { from: "#000", to: "#fff" },
            shadow: { blur: 4, dy: 1, color: "#000" },
        });
        expect(svg.querySelector("defs")).toBeNull();
        expect(svg.querySelector("line")!.getAttribute("filter")).toBeNull();
    });

    it("renders every surface element (charts · diagrams · icon · shape · graphic) without throwing", () => {
        const ctx = layoutCtx();
        const specs = listElements().filter(
            (s) =>
                s.category === "chart" ||
                s.category === "diagram" ||
                s.type === "icon" ||
                s.type === "shape" ||
                s.type === "graphic",
        );
        let painted = 0;
        for (const spec of specs) {
            const node = spec.layout(spec.create(), ctx);
            if (!node.surface) continue; // some diagrams compose into child elements, not a paint surface
            const svg = newSvg();
            node.surface.paint(svgDrawContext(svg), { x: 0, y: 0, w: 400, h: 300 });
            expect(svg.childNodes.length, spec.type).toBeGreaterThan(0);
            painted++;
        }
        expect(painted).toBeGreaterThan(15); // 13 charts + icon/shape/graphic at minimum
    });
});
