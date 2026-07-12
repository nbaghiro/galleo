// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import {
    canvasDrawContext,
    fitSlideContent,
    paint,
    paintSectionStack,
    renderToCanvas,
} from "@canvas/render/backends";
import { resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, textMetricsCtx, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

describe("paint / applyCommand", () => {
    it("paints one absolutely-positioned div per command with its box + fill", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "rect",
                    box: { x: 10, y: 20, w: 100, h: 40 },
                    fill: { color: "#abcdef", radius: 6 },
                },
            ],
            host,
        );
        expect(host.children).toHaveLength(1);
        const el = host.children[0] as HTMLElement;
        expect(el.style.position).toBe("absolute");
        expect(el.style.left).toBe("10px");
        expect(el.style.width).toBe("100px");
        expect(el.style.background).toBe("#abcdef");
        expect(el.style.borderRadius).toBe("6px");
    });
    it("emits a clip-path inset for a clipped command", () => {
        const cmd: RenderCommand = {
            kind: "rect",
            box: { x: 0, y: 0, w: 100, h: 100 },
            fill: { color: "#000" },
            clip: { x: 0, y: 0, w: 100, h: 60 },
        };
        const host = document.createElement("div");
        paint([cmd], host);
        expect((host.children[0] as HTMLElement).style.clipPath).toBe("inset(0px 0px 40px 0px)");
    });
    it("paints a text command's content", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "text",
                    box: { x: 0, y: 0, w: 100, h: 20 },
                    text: { text: "hi there", fontId: "f", size: 12, wrap: "words" },
                },
            ],
            host,
        );
        expect((host.children[0] as HTMLElement).textContent).toContain("hi there");
    });
    it("paints an image command as a background image with a radius", () => {
        const host = document.createElement("div");
        paint(
            [
                {
                    kind: "image",
                    box: { x: 0, y: 0, w: 100, h: 100 },
                    image: { src: "p.png", fit: "cover", radius: 8 },
                },
            ],
            host,
        );
        const el = host.children[0] as HTMLElement;
        expect(el.style.backgroundImage).toContain("p.png");
        expect(el.style.borderRadius).toBe("8px");
    });
});

describe("canvasDrawContext", () => {
    it("adapts measureText through the 2D context", () => {
        expect(canvasDrawContext(textMetricsCtx()).measureText("hello", { size: 12 }).width).toBe(
            40,
        );
    });
});

describe("renderToCanvas (raster smoke)", () => {
    it("produces a canvas without throwing", async () => {
        const canvas = await renderToCanvas(
            [
                {
                    kind: "rect",
                    box: { x: 0, y: 0, w: 50, h: 50 },
                    fill: { color: "#000", radius: 4 },
                },
            ],
            100,
            100,
            "#fff",
            1,
        );
        expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });
});

describe("paintSectionStack", () => {
    it("stacks sections and reports tops, total height, and regions", () => {
        const host = document.createElement("div");
        const sections = [
            sectionOf(inst("text", { text: "A" }), { id: "s1" }),
            sectionOf(inst("text", { text: "B" }), { id: "s2" }),
        ];
        const { tops, height, regions } = paintSectionStack(
            host,
            sections,
            resolveProfile("deck"),
            tokens,
            { fullW: 1000 },
        );
        expect(host.children).toHaveLength(2);
        expect(tops[0]).toBe(0);
        expect(tops[1]).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(tops[1]!);
        expect(regions.some((r) => r.id === "section:s1")).toBe(true);
    });
});

describe("fitSlideContent", () => {
    it("scales content to fit the slide height, centered", () => {
        const div = fitSlideContent(
            [{ kind: "rect", box: { x: 0, y: 0, w: 1280, h: 1440 }, fill: { color: "#000" } }],
            1440,
            1280,
            720,
        );
        expect(div.style.transform).toBe("scale(0.5)"); // 720 / 1440
    });
});
