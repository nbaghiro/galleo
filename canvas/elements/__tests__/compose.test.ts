import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { SectionBackground, SectionTone } from "@model/artifact";
import type { Tokens } from "@themes";
import {
    composeSection,
    composedLeafFor,
    composedNodeFor,
    sectionContentTokens,
    toneGround,
} from "@elements/compose";
import { emptyRegion, rowGroup } from "@model/artifact";
import { layout } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { THEMES, contrastRatio, luminance } from "@themes";
import {
    commandById,
    inst,
    layoutCtx,
    measure,
    recordingDrawContext,
    sectionOf,
    tokens,
} from "@canvas/testkit";

// section → [inner] → [content]
const contentOf = (section: EngineNode): EngineNode => section.children![0]!.children![0]!;

const deckCtx = layoutCtx(800, resolveProfile("deck"));
const webCtx = layoutCtx(1200, resolveProfile("web"));
const textRoot = (): ReturnType<typeof inst> => inst("text", { text: "Hello" });

// a real shipped dark theme, so the swap is exercised against tokens someone can actually pick
const darkTokens = THEMES.carbon!.tokens;
const CREAM = "#E2DFD3"; // the landing-page logo band
const bgOf = (background: SectionBackground): ReturnType<typeof sectionOf> =>
    sectionOf(textRoot(), { background });

describe("sectionContentTokens", () => {
    it("returns the base theme over a light background", () => {
        expect(sectionContentTokens(bgOf({ kind: "none" }), tokens)).toBe(tokens);
    });
    it("switches to light-on-dark tokens over a dark background", () => {
        expect(sectionContentTokens(bgOf({ kind: "color", color: "#111111" }), tokens).ink).toBe(
            "#ffffff",
        );
    });

    // The bug: the swap used to run one way only, so a light band under a dark theme kept the
    // theme's light ink and the text vanished into the band.
    describe("a light band under a dark theme", () => {
        const swapped = sectionContentTokens(bgOf({ kind: "color", color: CREAM }), darkTokens);

        it("paints near-black ink instead of the theme's light ink", () => {
            expect(darkTokens.ink).toBe("#EDEDED");
            expect(swapped.ink).toBe("#0c0c0c");
            expect(contrastRatio(swapped.ink, CREAM)).toBeGreaterThan(4.5);
        });

        it("tiers soft/muted/line/surface/bg as rgba black, mirroring the on-dark set", () => {
            expect(swapped.soft).toBe("rgba(0,0,0,0.86)");
            expect(swapped.muted).toBe("rgba(0,0,0,0.64)");
            expect(swapped.line).toBe("rgba(0,0,0,0.24)");
            expect(swapped.surface).toBe("rgba(0,0,0,0.10)");
            expect(swapped.bg).toBe("rgba(0,0,0,0.06)");
        });

        it("drops an accent too light to read on the band, and re-pairs onAccent", () => {
            expect(luminance(darkTokens.accent)).toBeGreaterThan(0.9); // carbon's near-white accent
            expect(luminance(swapped.accent)).toBeLessThan(luminance(darkTokens.accent));
            expect(contrastRatio(swapped.accent, CREAM)).toBeGreaterThan(4.5);
            expect(swapped.onAccent).toBe("#ffffff");
        });

        it("keeps an accent that already reads on a light band untouched", () => {
            const t: Tokens = { ...darkTokens, accent: "#7B2D26", onAccent: "#ffffff" };
            const out = sectionContentTokens(bgOf({ kind: "color", color: CREAM }), t);
            expect(out.accent).toBe("#7B2D26");
            expect(out.onAccent).toBe("#ffffff"); // unchanged accent keeps the theme's own pairing
        });

        it("reads a gradient by its `from` stop, the way the dark side does", () => {
            const grad = bgOf({ kind: "gradient", gradient: { from: CREAM, to: "#ffffff" } });
            expect(sectionContentTokens(grad, darkTokens).ink).toBe("#0c0c0c");
        });
    });

    // Everything the old asymmetric swap decided must decide the same way, or stored artifacts
    // repaint. Only dark-theme + explicit-light-band may move.
    describe("byte identity for every combination the old swap already handled", () => {
        const same = (bg: SectionBackground, t: Tokens): void => {
            expect(sectionContentTokens(bgOf(bg), t)).toBe(t);
        };

        it("a light theme returns the very same token object for every light band", () => {
            for (const bg of [
                { kind: "none" } as const,
                { kind: "color", color: CREAM } as const,
                { kind: "color", color: "#ffffff" } as const,
                { kind: "gradient", gradient: { from: "#ffffff", to: CREAM } } as const,
                { kind: "color" } as const, // a colour kind with no colour reads as nothing
            ])
                same(bg, tokens);
        });

        it("a section with no background of its own never swaps, under either theme", () => {
            same({ kind: "none" }, tokens);
            same({ kind: "none" }, darkTokens);
            expect(sectionContentTokens(sectionOf(textRoot()), darkTokens)).toBe(darkTokens);
        });

        it("still swaps to the on-dark set for a dark band under either theme", () => {
            for (const t of [tokens, darkTokens])
                expect(sectionContentTokens(bgOf({ kind: "color", color: "#111111" }), t).ink).toBe(
                    "#ffffff",
                );
        });

        it("still treats an image band as dark, since the scrim makes it one", () => {
            expect(sectionContentTokens(bgOf({ kind: "image", image: "x.png" }), tokens).ink).toBe(
                "#ffffff",
            );
        });
    });

    describe("the author's `dark` override, now symmetric", () => {
        it("dark: true forces the on-dark set over a light colour, under either theme", () => {
            for (const t of [tokens, darkTokens])
                expect(
                    sectionContentTokens(bgOf({ kind: "color", color: CREAM, dark: true }), t).ink,
                ).toBe("#ffffff");
        });

        it("dark: false forces the light-content set over a dark colour on a dark theme", () => {
            const bg = { kind: "color", color: "#111111", dark: false } as const;
            expect(sectionContentTokens(bgOf(bg), darkTokens).ink).toBe("#0c0c0c");
        });

        it("dark: false is still a no-op on a light theme: the base tokens already read", () => {
            const bg = { kind: "color", color: "#111111", dark: false } as const;
            expect(sectionContentTokens(bgOf(bg), tokens)).toBe(tokens);
        });

        it("an override on a section with no background stays inert", () => {
            expect(sectionContentTokens(bgOf({ kind: "none", dark: false }), darkTokens)).toBe(
                darkTokens,
            );
        });
    });
});

describe("theme-relative tones", () => {
    const toneSection = (tone: SectionTone): ReturnType<typeof sectionOf> =>
        bgOf({ kind: "tone", tone });
    const themes = Object.values(THEMES);

    it("a tint stays inside the page's own range, so the theme's ink still reads on it", () => {
        for (const th of themes) {
            const ground = toneGround("tint", th.tokens);
            const content = sectionContentTokens(toneSection("tint"), th.tokens);
            expect(content.ink, th.id).toBe(th.tokens.ink); // the page's own ink, not a swap
            expect(contrastRatio(content.ink, ground), th.id).toBeGreaterThan(7);
        }
    });

    it("a tint separates from the surface by the same share of the range in every theme", () => {
        for (const th of themes) {
            const delta = Math.abs(
                luminance(toneGround("tint", th.tokens)) - luminance(th.tokens.surface),
            );
            expect(delta, th.id).toBeGreaterThan(0.03);
        }
    });

    // Moving the ground toward the ink is contrast the tiers below ink lose, and `muted` runs near
    // the AA-large floor in several themes: uncompensated, a caption on a dark theme's tint band
    // drops through it (carbon measured 2.97). The compensation is what this guards.
    it("hands the tiers below ink back the contrast the band took from them", () => {
        for (const th of themes) {
            const ground = toneGround("tint", th.tokens);
            const content = sectionContentTokens(toneSection("tint"), th.tokens);
            // muted is the tier that decides this, since it runs nearest the floor: a caption on a
            // tint band must never read worse than the same caption on the theme's own page
            const onPage = contrastRatio(th.tokens.muted, th.tokens.surface);
            expect(contrastRatio(content.muted, ground), `${th.id}/muted`).toBeGreaterThan(onPage);
            // the tier above it stays comfortably legible rather than merely no worse
            expect(contrastRatio(content.soft, ground), `${th.id}/soft`).toBeGreaterThan(4.5);
        }
    });

    it("keeps a dark theme's caption on a tint band above the legibility floor", () => {
        const ground = toneGround("tint", darkTokens);
        const content = sectionContentTokens(toneSection("tint"), darkTokens);
        // uncompensated this lands at 2.97 against the 3:1 AA-large floor the eval checks read
        expect(contrastRatio(content.muted, ground)).toBeGreaterThan(3);
        expect(contrastRatio(darkTokens.muted, ground)).toBeLessThan(3);
    });

    it("contrast grounds on the theme's own ink and inverts the content with it", () => {
        for (const th of themes) {
            const ground = toneGround("contrast", th.tokens);
            expect(ground, th.id).toBe(th.tokens.ink);
            const content = sectionContentTokens(toneSection("contrast"), th.tokens);
            // a light theme's ink is a dark ground, a dark theme's ink is a light one
            expect(content.ink, th.id).toBe(th.dark ? "#0c0c0c" : "#ffffff");
            expect(contrastRatio(content.ink, ground), th.id).toBeGreaterThan(4.5);
        }
    });

    it("accent grounds on the accent and anchors its content on onAccent", () => {
        for (const th of themes) {
            const content = sectionContentTokens(toneSection("accent"), th.tokens);
            expect(toneGround("accent", th.tokens), th.id).toBe(th.tokens.accent);
            expect(content.ink, th.id).toBe(th.tokens.onAccent);
            expect(content.soft, th.id).toContain("0.86");
            // accent and onAccent trade places, so a mark on the band still separates from it
            expect(content.accent, th.id).toBe(th.tokens.onAccent);
            expect(content.onAccent, th.id).toBe(th.tokens.accent);
        }
    });

    it("never falls into the luminance guessing the raw-hex swap does", () => {
        // obsidian's accent is near-white: read as a hex band it would trip the light-band swap and
        // come out with near-black ink, but the tone knows its own pairing.
        const obsidian = THEMES.obsidian!.tokens;
        expect(luminance(obsidian.accent)).toBeGreaterThan(0.85);
        expect(sectionContentTokens(toneSection("accent"), obsidian).ink).toBe(obsidian.onAccent);
        // and the same ground written as a colour DOES go through the swap
        const asHex = bgOf({ kind: "color", color: obsidian.accent });
        expect(sectionContentTokens(asHex, obsidian).ink).toBe("#0c0c0c");
    });

    it("a tone band that names none reads as the quietest one rather than failing the section", () => {
        const bare: SectionBackground = { kind: "tone" };
        expect(sectionContentTokens(bgOf(bare), darkTokens)).toEqual(
            sectionContentTokens(toneSection("tint"), darkTokens),
        );
        expect(composeSection(bgOf(bare), deckCtx).fill?.color).toBe(
            toneGround("tint", deckCtx.theme),
        );
    });

    it("paints the tone's ground as the section fill", () => {
        for (const tone of ["tint", "contrast", "accent"] as SectionTone[])
            expect(composeSection(toneSection(tone), deckCtx).fill?.color).toBe(
                toneGround(tone, deckCtx.theme),
            );
    });

    it("drops the delineation border once the tone's ground is dark", () => {
        // on the default (light) theme a tint stays light and keeps its hairline; contrast does not
        expect(composeSection(toneSection("tint"), deckCtx).fill?.border).toBeDefined();
        expect(composeSection(toneSection("contrast"), deckCtx).fill?.border).toBeUndefined();
    });
});

describe("the swapped tokens reach elements that paint from ctx.theme", () => {
    const chartOnCream = (theme: Tokens): string[] => {
        const s = sectionOf(inst("chart", { type: "column", values: "3, 7, 5", showGrid: true }), {
            id: "s1",
            background: { kind: "color", color: CREAM },
        });
        const node = composedNodeFor(
            s,
            { section: "s1", path: [] },
            layoutCtx(800, undefined, theme),
        )!;
        const { ctx, calls } = recordingDrawContext();
        node.surface!.paint(ctx, { x: 0, y: 0, w: 600, h: 240 });
        return calls
            .filter((c) => c.op === "text")
            .map((c) => String((c.style as { fill?: string }).fill ?? ""));
    };

    it("a chart on a light band under a dark theme paints dark axis text", () => {
        const fills = chartOnCream(darkTokens);
        expect(fills.length).toBeGreaterThan(0);
        for (const fill of fills) expect(fill).toMatch(/^(#0c0c0c|rgba\(0,0,0,)/);
    });

    it("and keeps the light theme's own axis text exactly as it was", () => {
        for (const fill of chartOnCream(tokens))
            expect([tokens.ink, tokens.soft, tokens.muted]).toContain(fill);
    });
});

describe("composedLeafFor", () => {
    it("returns a bare text element's own leaf", () => {
        const s = sectionOf(textRoot(), { id: "s1" });
        const leaf = composedLeafFor(s, { section: "s1", path: [] }, deckCtx)!;
        expect(leaf.text).toBe("Hello");
    });
    it("returns the container-restyled leaf for a diagram child, not the spec's body size", () => {
        const s = sectionOf(
            inst("diagram", { type: "process", items: "Plan | think it through, Build" }),
            { id: "s1" },
        );
        // child 0 = item 0's label, child 1 = its detail (kids[i*2], kids[i*2+1])
        const label = composedLeafFor(s, { section: "s1", path: [0] }, deckCtx)!;
        const detail = composedLeafFor(s, { section: "s1", path: [1] }, deckCtx)!;
        expect(label.text).toBe("Plan");
        expect(label.size).toBe(12); // NODE_TEXT, the size the cell paints
        expect(label.weight).toBe(600);
        expect(detail.size).toBe(11);
    });
    it("returns the table-restyled leaf for a cell (header weight/ink, body soft)", () => {
        const s = sectionOf(inst("table", { cols: 2, rows: 2, header: true, data: "A, B\nc, d" }), {
            id: "s1",
        });
        const header = composedLeafFor(s, { section: "s1", path: [0] }, deckCtx)!;
        const body = composedLeafFor(s, { section: "s1", path: [2] }, deckCtx)!;
        expect(header.weight).toBe(700);
        expect(header.color).toBe(tokens.ink);
        expect(body.weight).toBe(400);
        expect(body.color).toBe(tokens.soft);
    });
    it("returns null for an address with no text", () => {
        const s = sectionOf(inst("image", { src: "x" }), { id: "s1" });
        expect(composedLeafFor(s, { section: "s1", path: [] }, deckCtx)).toBeNull();
    });
    it("composedNodeFor returns the tagged subtree an address paints as", () => {
        const s = sectionOf(rowGroup([inst("text", { text: "L" }), inst("text", { text: "R" })]), {
            id: "s1",
        });
        const root = composedNodeFor(s, { section: "s1", path: [] }, deckCtx)!;
        expect(root.id).toBe("el:s1");
        const right = composedNodeFor(s, { section: "s1", path: [1] }, deckCtx)!;
        expect(right.id).toBe("el:s1:1");
        expect(right.text?.text ?? right.children?.[0]?.text?.text).toBe("R");
    });
    it("scales leaves with the width ramp — overlay callers must compose at the painted width", () => {
        const s = sectionOf(textRoot(), { id: "s1" });
        const wide = composedLeafFor(s, { section: "s1", path: [] }, deckCtx)!;
        const narrow = composedLeafFor(
            s,
            { section: "s1", path: [] },
            layoutCtx(320, resolveProfile("deck")),
        )!;
        // 320/640 sits below the ramp floor, so the leaf lands at exactly 0.7× the wide size
        expect(narrow.size).toBeCloseTo(wide.size * 0.7, 5);
    });
});

describe("composeSection", () => {
    it("tags the section region id", () => {
        expect(composeSection(sectionOf(textRoot()), deckCtx).id).toBe("section:s1");
    });

    it("a framed deck section on a light color wears a border + radius", () => {
        const node = composeSection(
            sectionOf(textRoot(), { background: { kind: "color", color: "#ffffff" } }),
            deckCtx,
        );
        expect(node.fill?.color).toBe("#ffffff");
        expect(typeof node.fill?.radius).toBe("number");
        expect(node.fill?.border).toBeDefined();
    });

    it("a dark section drops the delineation border but keeps its fill", () => {
        const node = composeSection(
            sectionOf(textRoot(), { background: { kind: "color", color: "#111111" } }),
            deckCtx,
        );
        expect(node.fill?.color).toBe("#111111");
        expect(node.fill?.border).toBeUndefined();
    });

    it("a full-bleed section merges into the page (radius 0, no border)", () => {
        const node = composeSection(
            sectionOf(textRoot(), { bleed: true, background: { kind: "color", color: "#ffffff" } }),
            deckCtx,
        );
        expect(node.fill?.radius).toBe(0);
        expect(node.fill?.border).toBeUndefined();
    });

    it("a web (continuous) section centers a capped column with no card radius", () => {
        const node = composeSection(sectionOf(textRoot()), webCtx);
        expect(node.alignX).toBe("center");
        expect(node.fill?.radius).toBeUndefined();
    });

    it("an image background paints as a cover image with a scrim", () => {
        const node = composeSection(
            sectionOf(textRoot(), { background: { kind: "image", image: "bg.png" } }),
            deckCtx,
        );
        expect(node.image?.src).toBe("bg.png");
        expect(node.image?.fit).toBe("cover");
        expect(node.image?.scrim).toBeGreaterThan(0);
    });

    it("a gradient background paints as a gradient fill", () => {
        const node = composeSection(
            sectionOf(textRoot(), {
                background: { kind: "gradient", gradient: { from: "#fff", to: "#000" } },
            }),
            deckCtx,
        );
        expect(node.fill?.gradient).toEqual({ from: "#fff", to: "#000" });
    });

    it("clips its content to the section box on the horizontal axis (the containment boundary)", () => {
        expect(composeSection(sectionOf(textRoot()), deckCtx).clip).toEqual({ x: true });
    });

    it("crops an over-100% column row at the section edge instead of spilling past the card", () => {
        // two 70% columns = 140%: percent can't shrink, so the clip must contain the overflow
        const section = sectionOf(
            rowGroup([inst("text", { text: "L" }), inst("text", { text: "R" })], [0.7, 0.7]),
        );
        const W = 400;
        const { commands } = layout(
            composeSection(section, deckCtx),
            { x: 0, y: 0, w: W, h: 400 },
            measure,
        );
        const overflowing = commandById(commands, "el:s1:1");
        // the column's own box overflows past the section's right edge...
        expect(overflowing.box.x + overflowing.box.w).toBeGreaterThan(W);
        // ...but its clip is bounded to the section box, so nothing paints past the card edge.
        expect(overflowing.clip).toBeDefined();
        expect(overflowing.clip!.x + overflowing.clip!.w).toBeLessThanOrEqual(W + 0.5);
    });
});

describe("composeElement (via composeSection)", () => {
    it("applies per-instance layout — fill width + radius override — to the element", () => {
        const s = sectionOf(inst("image", { src: "x.png" }, { width: "fill", radius: 20 }));
        const content = contentOf(composeSection(s, deckCtx));
        expect(content.w.mode).toBe("grow"); // width: "fill"
        expect(content.image?.radius).toBe(20); // radius override
    });

    it("composes an empty container as the dashed drop-region placeholder", () => {
        const content = contentOf(composeSection(sectionOf(emptyRegion()), deckCtx));
        expect(content.fill?.border?.style).toBe("dashed");
    });

    it("composes an unknown element type as a red error box", () => {
        const content = contentOf(composeSection(sectionOf(inst("does-not-exist")), deckCtx));
        expect(content.fill?.color).toBe("#f6dede");
    });
});

describe("a continuous section's frame reads as a band", () => {
    const W = 1200;
    const band = (aspect?: number, ctx = webCtx): EngineNode =>
        composeSection(
            sectionOf(textRoot(), { id: "s1", ...(aspect ? { frame: { aspect } } : {}) }),
            ctx,
        );
    const heightOf = (section: EngineNode, w = W): number =>
        layout(section, { x: 0, y: 0, w, h: 100000 }, measure).commands.reduce(
            (m, c) => Math.max(m, c.box.y + c.box.h),
            0,
        );

    it("opens at least as tall as the aspect asks for", () => {
        expect(heightOf(band(16 / 7))).toBeCloseTo((W * 7) / 16, 0);
    });

    it("centres its content in the band it made", () => {
        const node = band(16 / 7);
        expect(node.alignY).toBe("center");
        const inner = node.children![0]!;
        const { commands } = layout(node, { x: 0, y: 0, w: W, h: 100000 }, measure);
        const text = commands.find((c) => c.kind === "text")!;
        const mid = (W * 7) / 16 / 2;
        expect(Math.abs(text.box.y + text.box.h / 2 - mid)).toBeLessThan(2);
        expect(inner.h.mode).toBe("fit"); // the band is the section's own height, not the child's
    });

    it("grows past the band rather than clipping content that needs the room", () => {
        const tall = sectionOf(
            inst("text", { text: "word ".repeat(1200) }),
            { id: "s1", frame: { aspect: 16 / 3 } }, // a shallow band, so the copy is what decides
        );
        const h = heightOf(composeSection(tall, webCtx));
        expect(h).toBeGreaterThan((W * 3) / 16);
    });

    it("changes nothing for a section with no frame", () => {
        const plain = band();
        expect(plain.h).toEqual({ mode: "fit", min: undefined, max: undefined });
        expect(plain.alignY).toBeUndefined();
        expect(heightOf(plain)).toBeLessThan(400);
    });

    it("leaves the paged path alone: there the frame is the page, not a floor", () => {
        const paged = band(16 / 7, deckCtx);
        expect(paged.alignY).toBeUndefined();
        expect(paged.h).toEqual({ mode: "fit", min: undefined, max: undefined });
        expect(heightOf(paged, 800)).toBe(heightOf(band(undefined, deckCtx), 800));
    });

    it("ignores a frame that names no aspect, or a nonsense one", () => {
        const framed = (frame: { aspect?: number }): EngineNode =>
            composeSection(sectionOf(textRoot(), { id: "s1", frame }), webCtx);
        for (const frame of [{}, { aspect: 0 }, { aspect: -2 }])
            expect(framed(frame).h).toEqual({ mode: "fit", min: undefined, max: undefined });
    });
});

describe("dock", () => {
    const nav = {
        type: "container",
        data: {
            direction: "row",
            children: [{ type: "text", data: { text: "Brand", style: "label" } }],
        },
        layout: { dock: "top" as const },
    };
    const hero = { type: "text", data: { text: "Headline", style: "h1" } };
    const sec = (frame?: { aspect: number }) => ({
        id: "s1",
        root: { type: "container", data: { children: [nav, hero] } },
        bleed: true,
        ...(frame ? { frame } : {}),
    });
    const webCtx = { ...deckCtx, format: resolveProfile("web") };

    it("hoists a docked child to the section band, out of the content flow", () => {
        const node = composeSection(sec({ aspect: 16 / 7 }) as never, webCtx);
        // the docked row rides the section node itself, beside the inner gutter box
        expect(node.children).toHaveLength(2);
        const float = node.children!.find((c) => c.float);
        expect(float?.float).toMatchObject({ y: "start", z: 1 });
        // and the content no longer contains it
        const inner = node.children!.find((c) => !c.float)!;
        const content = inner.children![0]!;
        expect((content.children ?? []).some((c) => c.float)).toBe(false);
    });

    // regression: docked chrome used to be detected by float shape, which a top-left pin matches
    it("hoists only the docked child, never a pinned one floating the same way", () => {
        const badge = {
            type: "text",
            data: { text: "New", style: "label" },
            layout: {
                width: "fit" as const,
                pin: { x: "start" as const, y: "start" as const, z: 1 },
            },
        };
        const section = {
            id: "s1",
            root: { type: "container", data: { children: [nav, badge, hero] } },
            bleed: true,
        };
        const web = composeSection(section as never, webCtx);
        // one hoisted node (the nav); the pinned badge floats inside the content instead
        expect(web.children!.filter((c) => c.float)).toHaveLength(1);
        const content = web.children!.find((c) => !c.float)!.children![0]!;
        expect((content.children ?? []).filter((c) => c.float)).toHaveLength(1);
        // and a page keeps the pin floating while it grounds the nav into the flow
        const paged = composeSection(section as never, deckCtx);
        const pagedContent = paged.children![0]!.children![0]!;
        expect((pagedContent.children ?? []).filter((c) => c.float)).toHaveLength(1);
    });

    it("keeps an undocked root intact", () => {
        const plain = {
            id: "s2",
            root: { type: "container", data: { children: [hero] } },
        };
        const node = composeSection(plain as never, webCtx);
        expect(node.children).toHaveLength(1);
    });

    // a page has no scroll for chrome to hang over, and autofit fills the frame to its padding,
    // so a float would land on the headline
    it("leaves the row in the flow on a paged format, ahead of the content", () => {
        const node = composeSection(sec() as never, deckCtx);
        expect(node.children).toHaveLength(1);
        const content = node.children![0]!.children![0]!;
        expect(content.children).toHaveLength(2);
        expect(content.children!.some((c) => c.float)).toBe(false);
        const { commands } = layout(node, { x: 0, y: 0, w: 800, h: 100000 }, measure);
        const [brand, headline] = commands.filter((c) => c.kind === "text");
        expect(brand!.text.text).toBe("Brand");
        expect(brand!.box.y + brand!.box.h).toBeLessThanOrEqual(headline!.box.y);
    });
});

describe("the reading column", () => {
    const docCtx = layoutCtx(1000, resolveProfile("doc"));
    const photo: SectionBackground = { kind: "image", image: "p.png" };
    const contentBox = (node: EngineNode, w: number): { x: number; w: number } => {
        const { commands } = layout(node, { x: 0, y: 0, w, h: 100000 }, measure);
        const text = commands.find((c) => c.kind === "text")!;
        return { x: text.box.x, w: text.box.w };
    };

    it("a doc's full-width band holds the column its contained neighbours sit in", () => {
        // the band lays out at the board width, a contained section at the column width
        const band = composeSection(
            sectionOf(textRoot(), { bleed: true, background: photo }),
            layoutCtx(1440, resolveProfile("doc")),
        );
        const contained = composeSection(sectionOf(textRoot()), docCtx);
        const inColumn = contentBox(contained, 1000);
        expect(contentBox(band, 1440)).toEqual({ x: inColumn.x + 220, w: inColumn.w });
    });

    it("a site's column is the profile cap, on every section", () => {
        const wide = layoutCtx(1440, resolveProfile("web"));
        const plain = contentBox(composeSection(sectionOf(textRoot()), wide), 1440);
        const band = contentBox(
            composeSection(sectionOf(textRoot(), { bleed: true, background: photo }), wide),
            1440,
        );
        expect(plain).toEqual(band);
    });
});
