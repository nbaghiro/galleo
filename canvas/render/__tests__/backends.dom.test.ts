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
    sectionFrameHeight,
    sectionLayoutWidth,
} from "@canvas/render/backends";
import { SECTION_GAP } from "@canvas/render/commands";
import { profileFor, resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, textMetricsCtx, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

describe("paint / applyCommand", () => {
    it("returns the nodes it created, index-parallel to the commands", () => {
        const host = document.createElement("div");
        const commands: RenderCommand[] = [
            { kind: "rect", box: { x: 0, y: 0, w: 10, h: 10 }, fill: { color: "#000" } },
            { kind: "rect", box: { x: 0, y: 10, w: 10, h: 10 }, fill: { color: "#fff" } },
        ];
        const nodes = paint(commands, host);
        expect(nodes).toHaveLength(2);
        expect(nodes.map((n) => n.style.top)).toEqual(["0px", "10px"]);
        expect([...host.children]).toEqual(nodes);
    });

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
    it("carries the painted radius through to the published regions", () => {
        const host = document.createElement("div");
        const sections = [
            sectionOf(inst("image", { src: "https://x/img.png", radius: 14 }), { id: "s1" }),
        ];
        const { regions } = paintSectionStack(host, sections, resolveProfile("deck"), tokens, {
            fullW: 1000,
        });
        const img = regions.find((r) => r.id === "el:s1");
        expect(img?.radius).toBe(14);
    });
});

describe("paintSectionStack — slide framing", () => {
    const deck = resolveProfile("deck");
    const short = (): Section[] => [sectionOf(inst("text", { text: "A" }), { id: "s1" })];
    const tall = (): Section[] => [
        sectionOf(
            {
                type: "container",
                data: {
                    direction: "col",
                    children: Array.from({ length: 40 }, (_, i) =>
                        inst("text", { text: `Paragraph ${i}` }),
                    ),
                },
            },
            { id: "s1" },
        ),
    ];
    const draw = (sections: Section[], slide: boolean): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(document.createElement("div"), sections, deck, tokens, {
            fullW: 1000,
            slideFrame: slide,
        });

    it("pads a short section out to its frame instead of hugging the content", () => {
        const natural = draw(short(), false).heights[0]!;
        const framed = draw(short(), true).heights[0]!;
        const layoutW = sectionLayoutWidth(short()[0]!, deck, 1000);
        expect(framed).toBeGreaterThan(natural);
        expect(framed).toBe(sectionFrameHeight(short()[0]!, deck, layoutW));
    });

    it("lets a section taller than its frame keep growing", () => {
        const layoutW = sectionLayoutWidth(tall()[0]!, deck, 1000);
        expect(draw(tall(), true).heights[0]!).toBeGreaterThan(
            sectionFrameHeight(tall()[0]!, deck, layoutW),
        );
    });

    it("keeps selectable regions, so framing does not cost selection", () => {
        expect(draw(short(), true).regions.some((r) => r.id === "section:s1")).toBe(true);
    });

    it("is inert for continuous formats", () => {
        const doc = resolveProfile("doc");
        const host = (slide: boolean): number =>
            paintSectionStack(document.createElement("div"), short(), doc, tokens, {
                fullW: 1000,
                slideFrame: slide,
            }).heights[0]!;
        expect(host(true)).toBe(host(false));
    });

    it("repaints when the mode flips, rather than serving the cached layer", () => {
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const same = short(); // one identity across draws, so only the mode can miss the cache
        const run = (slide: boolean): number =>
            paintSectionStack(host, same, deck, tokens, { fullW: 1000, cache, slideFrame: slide })
                .heights[0]!;
        const natural = run(false);
        expect(run(true)).toBeGreaterThan(natural);
        expect(run(false)).toBe(natural);
    });
});

describe("paintSectionStack — autofit", () => {
    const deck = resolveProfile("deck");
    const para = (i: number): string =>
        `Paragraph ${i}: ${"lorem ipsum dolor sit amet consectetur ".repeat(6)}`;
    // 657px natural against a 554px frame: over the frame, under the pagination threshold
    const dense = (n = 6): Section[] => [
        sectionOf(
            {
                type: "container",
                data: {
                    direction: "col",
                    children: [
                        inst("text", { style: "h1", text: "A title" }),
                        ...Array.from({ length: n }, (_, i) =>
                            inst("text", { style: "body", text: para(i) }),
                        ),
                    ],
                },
            },
            { id: "s1" },
        ),
    ];
    const frameH = (): number =>
        sectionFrameHeight(dense()[0]!, deck, sectionLayoutWidth(dense()[0]!, deck, 1000));
    const draw = (
        sections: Section[],
        opts: Partial<Parameters<typeof paintSectionStack>[4]> = {},
    ): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(document.createElement("div"), sections, deck, tokens, {
            fullW: 1000,
            slideFrame: true,
            ...opts,
        });
    const hairlines = (r: ReturnType<typeof paintSectionStack>): number =>
        r.layers[0]!.commands.filter((c) => c.box.h === 1 && c.box.y === frameH()).length;

    it("reports the scale each section was painted at", () => {
        const r = draw(dense());
        expect(r.fitScales[0]).toBeLessThan(1);
        expect(Math.round(r.heights[0]!)).toBe(frameH());
    });

    it("leaves the overflow hairline for what it cannot fit, and drops it for what it can", () => {
        expect(hairlines(draw(dense()))).toBe(0);
        expect(hairlines(draw(dense(7)))).toBe(1); // past the pagination threshold: not fitted
    });

    it("reports 1 for every section when the stack is not slide-framed", () => {
        expect(draw(dense(), { slideFrame: false }).fitScales).toEqual([1]);
    });

    it("holds a frozen scale for the section carrying an inline edit, then re-solves", () => {
        const cache = createSectionStackCache();
        const host = document.createElement("div");
        const same = dense(); // one identity across draws, so only the freeze can miss the cache
        const run = (freezeFit: { id: string; scale: number } | null): [number, number] => {
            const r = paintSectionStack(host, same, deck, tokens, {
                fullW: 1000,
                slideFrame: true,
                cache,
                freezeFit,
            });
            return [r.fitScales[0]!, Math.round(r.heights[0]!)];
        };
        const [solved, fittedH] = run(null);
        expect(solved).toBeLessThan(1);
        // held at the authored size, so the section spills past its frame rather than resizing type
        expect(run({ id: "s1", scale: 1 })).toEqual([1, 657]);
        expect(run({ id: "other", scale: 1 })).toEqual([solved, fittedH]); // another section's edit
        expect(run(null)).toEqual([solved, fittedH]);
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
        const { el } = fitSlideContent(
            [{ kind: "rect", box: { x: 0, y: 0, w: 1280, h: 1440 }, fill: { color: "#000" } }],
            1440,
            1280,
            720,
        );
        expect(el.style.transform).toBe("scale(0.5)"); // 720 / 1440
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

describe("applyCommand — decoration is not read", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    const el = (c: RenderCommand): HTMLElement => {
        const host = document.createElement("div");
        return paint([c], host)[0]!;
    };

    it("hides a decor command from the a11y tree", () => {
        expect(
            el({ kind: "rect", box, fill: { color: "#000" }, decor: true }).getAttribute(
                "aria-hidden",
            ),
        ).toBe("true");
        const text = { text: "watermark", fontId: "f", size: 12, wrap: "none" as const };
        expect(el({ kind: "text", box, text, decor: true }).getAttribute("aria-hidden")).toBe(
            "true",
        );
    });

    it("leaves ordinary content alone", () => {
        expect(
            el({ kind: "rect", box, fill: { color: "#000" } }).getAttribute("aria-hidden"),
        ).toBeNull();
    });

    // layers are cached and their nodes reused, so a node that was decoration must not stay hidden
    it("clears the flag when a reused node stops being decoration", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const stand = (decor: boolean) => (): { commands: RenderCommand[]; height: number } => ({
            commands: [
                { kind: "rect", box: { ...box, w: 100, h: 40 }, ...(decor ? { decor } : {}) },
            ],
            height: 40,
        });
        const draw = (decor: boolean): void => {
            // a fresh section object per pass, so the cached layer is reconciled rather than reused
            const sec = sectionOf(inst("text", { text: "A" }), { id: "s1" });
            paintSectionStack(host, [sec], resolveProfile("doc"), tokens, {
                fullW: 1000,
                cache,
                placeholder: stand(decor),
            });
        };
        draw(true);
        const node = cache.entries.get("s1")!.layer!.children[0] as HTMLElement;
        expect(node.getAttribute("aria-hidden")).toBe("true");
        draw(false);
        expect(cache.entries.get("s1")!.layer!.children[0]).toBe(node); // reused, not replaced
        expect(node.getAttribute("aria-hidden")).toBeNull();
    });

    // an anchor with no name was already out of the tree; decoration must not undo that
    it("keeps a nameless anchor hidden and a named one visible", () => {
        expect(
            el({ kind: "rect", box, fill: { color: "#000" }, link: "/x" }).getAttribute(
                "aria-hidden",
            ),
        ).toBe("true");
        const text = { text: "Read on", fontId: "f", size: 12, wrap: "none" as const };
        expect(el({ kind: "text", box, text, link: "/x" }).getAttribute("aria-hidden")).toBeNull();
    });
});

describe("paintSectionStack — pinned sections", () => {
    const doc = resolveProfile("doc");
    const sections = (): Section[] => [
        sectionOf(inst("text", { text: "Nav" }), { id: "nav", pinned: true }),
        sectionOf(inst("text", { text: "One" }), { id: "s1" }),
        sectionOf(inst("text", { text: "Two" }), { id: "s2" }),
    ];
    const draw = (
        host: HTMLElement,
        profile = doc,
        opts: Partial<Parameters<typeof paintSectionStack>[4]> = {},
    ): ReturnType<typeof paintSectionStack> =>
        paintSectionStack(host, sections(), profile, tokens, {
            fullW: 1000,
            pinned: true,
            ...opts,
        });

    it("puts the pinned layer in flow at its own slot, and leaves the rest absolute", () => {
        const host = document.createElement("div");
        const { tops } = draw(host);
        const [nav, one] = [...host.children] as HTMLElement[];
        expect(nav!.style.position).toBe("sticky");
        expect(nav!.style.top).toBe("0px");
        expect(nav!.style.marginTop).toBe(`${tops[0]}px`);
        expect(nav!.style.left).toBe(""); // `left` on a sticky box is a stickiness constraint
        expect(one!.style.position).toBe("absolute");
        expect(one!.style.top).toBe(`${tops[1]}px`);
    });

    it("stacks the pinned layer above its siblings", () => {
        const host = document.createElement("div");
        draw(host);
        const [nav, one] = [...host.children] as HTMLElement[];
        expect(nav!.style.zIndex).toBe("1");
        expect(one!.style.zIndex).toBe("");
    });

    it("displaces nothing: tops and total height match an unpinned stack", () => {
        const pinned = draw(document.createElement("div"));
        const plain = draw(document.createElement("div"), doc, { pinned: false });
        expect(pinned.tops).toEqual(plain.tops);
        expect(pinned.height).toBe(plain.height);
    });

    it("keeps the pinned layer alive however far past its slot the reader has scrolled", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const geom = draw(document.createElement("div"));
        const far = geom.height + 5000;
        draw(host, doc, { cache, window: { top: far, bottom: far + 800 } });
        expect(cache.entries.get("nav")?.layer).toBeTruthy();
        expect(cache.entries.get("s1")?.layer).toBeFalsy();
        expect([...host.children]).toContain(cache.entries.get("nav")?.layer);
    });

    it("is ignored by a paged format, which has no scroll to stick against", () => {
        const host = document.createElement("div");
        draw(host, resolveProfile("deck"));
        expect((host.children[0] as HTMLElement).style.position).toBe("absolute");
    });

    it("is ignored unless the caller opts in, so the editor renders it in place", () => {
        const host = document.createElement("div");
        draw(host, doc, { pinned: false });
        const nav = host.children[0] as HTMLElement;
        expect(nav.style.position).toBe("absolute");
        expect(nav.style.marginTop).toBe("");
    });

    it("returns a sticky layer to absolute when the section is unpinned", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        draw(host, doc, { cache });
        const nav = cache.entries.get("nav")!.layer!;
        expect(nav.style.position).toBe("sticky");
        paintSectionStack(
            host,
            sections().map((s) => (s.id === "nav" ? { ...s, pinned: false } : s)),
            doc,
            tokens,
            { fullW: 1000, pinned: true, cache },
        );
        expect(cache.entries.get("nav")!.layer!.style.position).toBe("absolute");
        expect(cache.entries.get("nav")!.layer!.style.marginTop).toBe("");
        expect(cache.entries.get("nav")!.layer!.style.zIndex).toBe("");
    });
});
