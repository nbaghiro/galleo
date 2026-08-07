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
    paintSectionCarousel,
    paintSectionStack,
    sectionLayoutWidth,
    renderSlidePage,
    renderToCanvas,
} from "@canvas/render/backends";
import { SECTION_GAP } from "@canvas/render/commands";
import { profileFor, resolveProfile, sectionFrame } from "@engine/profile";
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

describe("paintSectionStack — page-size cache invalidation", () => {
    const deck = resolveProfile("deck");
    const page = (width: number, height: number) =>
        profileFor({ format: "deck", page: { width, height } });

    // layoutW is identical across these profiles, so only the paged dimensions distinguish them
    const paintWith = (
        host: HTMLElement,
        sections: Section[],
        cache: ReturnType<typeof createSectionStackCache>,
        profile: Parameters<typeof paintSectionStack>[2],
    ): void => {
        paintSectionStack(host, sections, profile, tokens, { fullW: 1000, cache });
    };

    it("reuses the cached layer when nothing changed", () => {
        const sections = [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        paintWith(host, sections, cache, deck);
        const first = cache.entries.get("s1")!.commands;
        paintWith(host, sections, cache, deck);
        expect(cache.entries.get("s1")!.commands).toBe(first);
    });

    it("re-lays-out when the artifact's page size changes", () => {
        const sections = [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        paintWith(host, sections, cache, page(1080, 1080));
        const square = cache.entries.get("s1")!.commands;
        paintWith(host, sections, cache, page(1080, 1920));
        expect(cache.entries.get("s1")!.commands).not.toBe(square);
    });

    it("distinguishes a sized page from the format's own dimensions", () => {
        const sections = [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        paintWith(host, sections, cache, deck);
        const plain = cache.entries.get("s1")!.commands;
        paintWith(host, sections, cache, page(1080, 1350));
        expect(cache.entries.get("s1")!.commands).not.toBe(plain);
    });
});

describe("paintSectionStack — framed editing", () => {
    const social = resolveProfile("social");
    const deck = resolveProfile("deck");
    const sections = [sectionOf(inst("text", { text: "A card" }), { id: "s1" })];

    // a card format's shape IS the artifact, so the editor canvas must show it, not a natural-height
    // stack. It works without a scale factor because layoutW already equals the page width.
    it("renders a card format at its page aspect", () => {
        const host = document.createElement("div");
        const { heights } = paintSectionStack(host, sections, social, tokens, { fullW: 1400 });
        const layoutW = sectionLayoutWidth(sections[0]!, social, 1400);
        expect(layoutW).toBe(1080); // capped at the page width, not the canvas
        expect(heights[0]).toBeCloseTo((layoutW * 1920) / 1080, 0);
    });

    it("leaves a deck on natural heights, which it has always used", () => {
        const host = document.createElement("div");
        const { heights } = paintSectionStack(host, sections, deck, tokens, { fullW: 1400 });
        expect(heights[0]).toBeLessThan(720); // a one-line section, not a full slide
    });

    it("still reports regions for a framed section, so it stays selectable", () => {
        const host = document.createElement("div");
        const { regions } = paintSectionStack(host, sections, social, tokens, { fullW: 1400 });
        expect(regions.some((r) => r.id === "section:s1")).toBe(true);
        expect(regions.some((r) => r.id.startsWith("el:s1"))).toBe(true);
    });

    // a 1350px card does not fit a laptop viewport, so it is scaled down; every overlay reads geometry
    // from regions(), so publishing them pre-scaled is what keeps the rest of the editor working
    it("scales a card down to fit the viewport height", () => {
        const host = document.createElement("div");
        const r = paintSectionStack(host, sections, social, tokens, {
            fullW: 1400,
            fitHeight: 800,
        });
        expect(r.scale).toBeLessThan(1);
        expect(r.heights[0]).toBeLessThanOrEqual(800);
    });

    it("publishes regions in canvas coords, so overlays need no knowledge of the scale", () => {
        const host = document.createElement("div");
        const big = paintSectionStack(host, sections, social, tokens, { fullW: 1400 });
        const small = paintSectionStack(document.createElement("div"), sections, social, tokens, {
            fullW: 1400,
            fitHeight: 800,
        });
        const boxOf = (rs: typeof big.regions): number =>
            rs.find((x) => x.id === "section:s1")!.box.w;
        expect(boxOf(small.regions)).toBeCloseTo(boxOf(big.regions) * small.scale, 0);
    });

    it("never scales a natural-height format", () => {
        const host = document.createElement("div");
        const r = paintSectionStack(host, sections, deck, tokens, { fullW: 1400, fitHeight: 300 });
        expect(r.scale).toBe(1);
    });
});

describe("paintSectionCarousel", () => {
    const social = resolveProfile("social");
    const cards = ["a", "b", "c"].map((id) =>
        sectionOf(inst("text", { text: `card ${id}` }), { id }),
    );
    const run = (focus: number): ReturnType<typeof paintSectionCarousel> =>
        paintSectionCarousel(document.createElement("div"), cards, social, tokens, {
            fullW: 1400,
            fullH: 800,
            focus,
        });

    it("lays the cards out left to right", () => {
        const { lefts } = run(0);
        expect(lefts).toHaveLength(3);
        expect(lefts[1]).toBeGreaterThan(lefts[0]!);
        expect(lefts[2]).toBeGreaterThan(lefts[1]!);
    });

    it("shows the focused card larger than its neighbours", () => {
        const { widths } = run(1);
        expect(widths[1]).toBeGreaterThan(widths[0]!);
        expect(widths[1]).toBeGreaterThan(widths[2]!);
        expect(widths[0]).toBeCloseTo(widths[2]!, 5); // both neighbours step down equally
    });

    it("moves the emphasis when the focus moves", () => {
        expect(run(0).widths[0]).toBeGreaterThan(run(1).widths[0]!);
    });

    it("fits the focused card in the viewport", () => {
        const r = run(0);
        expect(r.scale).toBeLessThanOrEqual(1);
        const frame = sectionFrame(cards[0]!, social);
        expect((frame.h / frame.w) * r.widths[0]!).toBeLessThanOrEqual(800);
    });

    it("publishes regions in canvas coords, so overlays work unchanged", () => {
        const r = run(0);
        expect(r.regions.some((x) => x.id === "section:a")).toBe(true);
        // the second card's regions sit to the right of the first card's
        const a = r.regions.find((x) => x.id === "section:a")!.box;
        const b = r.regions.find((x) => x.id === "section:b")!.box;
        expect(b.x).toBeGreaterThan(a.x + a.w - 1);
    });

    // the strip does not scroll: whichever card has focus is placed in the middle of the viewport
    it("centres whichever card has focus", () => {
        for (const i of [0, 1, 2]) {
            const r = run(i);
            expect(r.lefts[i]! + r.widths[i]! / 2).toBeCloseTo(1400 / 2, 0);
        }
    });

    it("fans the rest out either side of it", () => {
        const r = run(1);
        expect(r.lefts[0]! + r.widths[0]!).toBeLessThanOrEqual(r.lefts[1]! + 1);
        expect(r.lefts[2]!).toBeGreaterThanOrEqual(r.lefts[1]! + r.widths[1]! - 1);
    });

    it("keeps every card the same shape, whatever the focus", () => {
        const r = run(1);
        const aspect = (id: string): number => {
            const box = r.regions.find((x) => x.id === `section:${id}`)!.box;
            return box.h / box.w;
        };
        expect(aspect("a")).toBeCloseTo(aspect("b"), 3);
        expect(aspect("c")).toBeCloseTo(aspect("b"), 3);
    });
});
