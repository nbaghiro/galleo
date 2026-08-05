// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import type { Section } from "@model/artifact";
import {
    canvasDrawContext,
    createSectionStackCache,
    fitSlideContent,
    paint,
    paintSectionStack,
    renderSlidePage,
    renderToCanvas,
} from "@canvas/render/backends";
import { SECTION_GAP } from "@canvas/render/commands";
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

describe("renderToCanvas / renderSlidePage (raster smoke)", () => {
    const cmds: RenderCommand[] = [
        { kind: "rect", box: { x: 0, y: 0, w: 50, h: 50 }, fill: { color: "#000", radius: 4 } },
    ];
    it("renderToCanvas produces a canvas without throwing", async () => {
        expect(await renderToCanvas(cmds, 100, 100, "#fff", 1)).toBeInstanceOf(HTMLCanvasElement);
    });
    it("renderSlidePage produces a canvas without throwing", async () => {
        const canvas = await renderSlidePage(
            { commands: cmds, w: 1280, h: 720, contentH: 1440 },
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

const rect = (h: number): RenderCommand => ({
    kind: "rect",
    box: { x: 0, y: 0, w: 100, h },
    fill: { color: "#eee" },
});

describe("paintSectionStack — windowing", () => {
    const many = (n: number): Section[] =>
        Array.from({ length: n }, (_, i) =>
            sectionOf(inst("text", { text: `S${i}` }), { id: `s${i}` }),
        );
    const deck = resolveProfile("deck");
    const draw = (
        host: HTMLElement,
        sections: Section[],
        opts: Parameters<typeof paintSectionStack>[4],
    ): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(host, sections, deck, tokens, opts);

    it("reports the same geometry windowed as unwindowed, and paints only the intersecting band", () => {
        const sections = many(12);
        const full = draw(document.createElement("div"), sections, { fullW: 1000 });
        const host = document.createElement("div");
        const windowed = draw(host, sections, {
            fullW: 1000,
            window: { top: 0, bottom: full.tops[2]! },
        });

        expect(windowed.tops).toEqual(full.tops);
        expect(windowed.height).toBe(full.height);
        expect(windowed.painted).toBeLessThan(full.painted);
        expect(host.children.length).toBe(windowed.painted);
    });

    it("only reports regions for what it painted — nothing off-screen can be hit", () => {
        const sections = many(12);
        const full = draw(document.createElement("div"), sections, { fullW: 1000 });
        const windowed = draw(document.createElement("div"), sections, {
            fullW: 1000,
            window: { top: 0, bottom: full.tops[1]! },
        });
        expect(windowed.regions.some((r) => r.id === "section:s0")).toBe(true);
        expect(windowed.regions.some((r) => r.id === "section:s11")).toBe(false);
        expect(windowed.regions.length).toBeLessThan(full.regions.length);
    });

    it("paints a section as the window reaches it, and releases it once far behind", () => {
        const sections = many(12);
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const geom = draw(document.createElement("div"), sections, { fullW: 1000 });
        const far = geom.tops[9]!;

        draw(host, sections, { fullW: 1000, cache, window: { top: 0, bottom: geom.tops[1]! } });
        expect(cache.entries.get("s0")?.layer).toBeTruthy();
        expect(cache.entries.get("s9")?.layer).toBeFalsy();

        draw(host, sections, { fullW: 1000, cache, window: { top: far, bottom: geom.height } });
        expect(cache.entries.get("s9")?.layer).toBeTruthy();
        expect(cache.entries.get("s0")?.layer).toBeFalsy(); // DOM released
        expect(cache.entries.get("s0")?.height).toBeGreaterThan(0); // layout kept
    });

    it("reserves a placeholder's height and paints its stand-in", () => {
        const sections = many(3);
        const host = document.createElement("div");
        const stand = { commands: [rect(500)], height: 500 };
        const { tops, height, painted } = draw(host, sections, {
            fullW: 1000,
            placeholder: (s) => (s.id === "s1" ? stand : undefined),
        });
        expect(tops[2]! - tops[1]!).toBe(500 + SECTION_GAP);
        expect(painted).toBe(3); // the stand-in is painted like any other layer
        expect(height).toBeGreaterThan(500);
    });

    it("keeps a placeholder out of the hit-test regions", () => {
        const sections = many(2);
        const { regions } = draw(document.createElement("div"), sections, {
            fullW: 1000,
            placeholder: (s) =>
                s.id === "s0" ? { commands: [rect(300)], height: 300 } : undefined,
        });
        expect(regions.some((r) => r.id === "section:s0")).toBe(false);
        expect(regions.some((r) => r.id === "section:s1")).toBe(true);
    });

    it("repaints a section once its content replaces the stand-in", () => {
        const sections = many(1);
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        draw(host, sections, {
            fullW: 1000,
            cache,
            placeholder: () => ({ commands: [rect(400)], height: 400 }),
        });
        expect(cache.entries.get("s0")?.height).toBe(400);
        const real = draw(host, sections, { fullW: 1000, cache });
        expect(cache.entries.get("s0")?.height).not.toBe(400);
        expect(real.regions.some((r) => r.id === "section:s0")).toBe(true);
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
