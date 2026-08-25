// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import { fitIntoBox, fitSectionToFrame, thumbFrame } from "@canvas/render/fit";
import { layoutSection, layoutSlide, measureText, sectionSlides } from "@canvas/render/commands";
import { resolveProfile, sectionFrame } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";
import { colGroup } from "@model/artifact";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");
const doc = resolveProfile("doc");
const web = resolveProfile("web");
const THUMB_W = 176;
const TILE = 16 / 9;

const prose = (n: number): string =>
    Array.from({ length: n }, (_, i) => `word${i % 7} some more text here`).join(" ");

// a doc section: portrait at its natural width, far taller than a 16:9 card
const article = sectionOf(
    colGroup([
        inst("text", { style: "label", text: "The Lead" }),
        inst("text", { style: "h2", text: "The street that closed for the summer." }),
        ...Array.from({ length: 6 }, () => inst("text", { style: "body", text: prose(30) })),
    ]),
);
const short = sectionOf(colGroup([inst("text", { style: "h1", text: "Just a title" })]));
// a site hero: a 16:7 band by authorship, which is a MINIMUM height, not a page
const hero = sectionOf(
    colGroup([
        inst("text", { style: "h1", text: "The street that closed" }),
        inst("text", { style: "subtitle", text: prose(3) }),
    ]),
    { frame: { aspect: 16 / 7 } },
);
// nothing here reflows: h = w/aspect, so no width takes the card's shape and the solver gives up
const photo = sectionOf(colGroup([inst("image", { src: "dune.png", aspect: 1.2 })]));

// Mirrors ScaledSectionCanvas(frame="slide") over the geometry it actually uses: a paged card or an
// authored band renders as its own page, a continuous section solves for the width that becomes the
// card's shape, and the result is placed in the box — contained, or covering when this is a tile.
const thumb = (
    section: typeof article,
    profile = doc,
    tile?: number,
): { fillW: number; fillH: number; overflows: boolean; scale: number; boxH: number } => {
    const fr = thumbFrame(section, profile, tile);
    const box = {
        w: THUMB_W,
        h: tile ? Math.round(THUMB_W / tile) : Math.round((THUMB_W * fr.h) / fr.w),
    };
    let layoutW = fr.w;
    let contentH = fr.h;
    if (tile || profile.kind === "paged" || section.frame?.aspect) {
        const page = layoutSlide(
            section,
            fr.w,
            fr.h,
            measureText,
            tokens,
            { ...profile, overflow: "fit" },
            true,
        );
        contentH = page.height;
    } else {
        const f = fitSectionToFrame(section, fr, measureText, tokens, profile, true);
        layoutW = f.layoutW;
        contentH = f.contentH;
    }
    const { scale } = fitIntoBox(box, { w: layoutW, h: contentH }, tile ? "cover" : "contain");
    return {
        fillW: (layoutW * scale) / box.w,
        fillH: (contentH * scale) / box.h,
        overflows: layoutW * scale > box.w + 1 || contentH * scale > box.h + 1,
        scale,
        boxH: box.h,
    };
};

describe("16:9 thumbnails fill their card without cropping", () => {
    it("fills both axes for a tall doc section — the case that used to letterbox", () => {
        const t = thumb(article);
        expect(t.fillW).toBeGreaterThan(0.9);
        expect(t.fillH).toBeGreaterThan(0.9);
    });

    it("leaves a paged format alone — the card is already that section's own frame", () => {
        // a deck slide has a canonical shape, so nothing is reflowed and nothing is scaled up
        const slide = sectionOf(
            colGroup([
                inst("text", { style: "h1", text: "A Title" }),
                inst("text", { style: "subtitle", text: prose(4) }),
            ]),
        );
        const t = thumb(slide, deck);
        expect(t.fillW).toBeCloseTo(1, 1);
        expect(t.fillH).toBeCloseTo(1, 1);
    });

    it("beats laying the section out at the frame width", () => {
        const fr = sectionFrame(article, doc);
        const boxH = Math.round((THUMB_W * fr.h) / fr.w);
        const naiveH = layoutSection(article, fr.w, measureText, tokens, doc, true).height;
        const naiveS = Math.min(THUMB_W / fr.w, boxH / naiveH);
        const naiveFill = Math.min((fr.w * naiveS) / THUMB_W, (naiveH * naiveS) / boxH);
        const t = thumb(article);
        expect(Math.min(t.fillW, t.fillH)).toBeGreaterThan(naiveFill);
    });

    it("never overflows the card, for tall or short sections", () => {
        expect(thumb(article).overflows).toBe(false);
        expect(thumb(short).overflows).toBe(false);
        expect(thumb(article, deck).overflows).toBe(false);
    });

    it("leaves Present on the format's own policy, which still paginates", () => {
        expect(sectionSlides(article, tokens, deck).length).toBeGreaterThan(1);
    });

    it("keeps every command inside the solved layout width", () => {
        const fr = sectionFrame(article, doc);
        const f = fitSectionToFrame(article, fr, measureText, tokens, doc, true);
        const right = f.commands.reduce((m, c) => Math.max(m, c.box.x + c.box.w), 0);
        expect(right).toBeLessThanOrEqual(f.layoutW + 1);
    });

    it("passes `plain` through, so an empty region shows no drop affordance", () => {
        const empty = sectionOf(colGroup([]));
        const fr = sectionFrame(empty, deck);
        const bare = fitSectionToFrame(empty, fr, measureText, tokens, deck, true);
        const withAffordance = fitSectionToFrame(empty, fr, measureText, tokens, deck, false);
        expect(bare.commands.length).toBeLessThan(withAffordance.commands.length);
    });
});

describe("a tile covers its box instead of fitting inside it", () => {
    it("re-frames an authored band, so a site hero fills a 16:9 tile edge to edge", () => {
        // untiled, the hero's canvas is its own 16:7 band: it fills that, and the card it sits in
        // is left with a strip of empty across a ninth of its height
        expect(thumb(hero, web).fillH).toBeCloseTo(1, 2);
        expect(thumb(hero, web).boxH / Math.round(THUMB_W / TILE)).toBeLessThan(0.9);

        const t = thumb(hero, web, TILE);
        expect(thumbFrame(hero, web, TILE)).toEqual({ w: 1280, h: 720 });
        expect(t.fillW).toBeCloseTo(1, 2);
        expect(t.fillH).toBeCloseTo(1, 2);
        expect(t.overflows).toBe(false); // a taller frame centres the band, it does not crop it
    });

    it("covers content that could not take the card's shape, rather than letterboxing it", () => {
        // the premise: nothing in a lone photo reflows into 16:9, so the solver gives up and the
        // contained render sits inside bars
        const f = fitSectionToFrame(
            photo,
            sectionFrame(photo, doc),
            measureText,
            tokens,
            doc,
            true,
        );
        expect(f.exact).toBe(false);
        expect(Math.min(thumb(photo, doc).fillW, thumb(photo, doc).fillH)).toBeLessThan(0.9);

        const t = thumb(photo, doc, TILE);
        expect(t.fillW).toBeCloseTo(1, 2);
        expect(t.fillH).toBeGreaterThanOrEqual(1);
    });

    it("fills a doc tile on both axes, short section or tall", () => {
        for (const section of [article, short, photo]) {
            const t = thumb(section, doc, TILE);
            expect(t.fillW).toBeGreaterThanOrEqual(1);
            expect(t.fillH).toBeGreaterThanOrEqual(1);
        }
    });

    it("lays every format out at one width, so type reads the same size across the grid", () => {
        // The symptom this answers: a solved width is a function of the content, so two doc cards in
        // one row painted the same authored type at two sizes, and both larger than the deck card
        // beside them — a doc section that becomes 16:9 at 400px is scaled up three times as far.
        const solve = (s: typeof article): number =>
            fitSectionToFrame(s, sectionFrame(s, doc), measureText, tokens, doc, true).layoutW;
        expect(solve(article)).not.toBe(solve(short));

        for (const profile of [deck, doc, web])
            expect(thumbFrame(article, profile, TILE)).toEqual({ w: 1280, h: 720 });
        // one width ⇒ one scale, whatever the format and whatever the section holds
        for (const t of [
            thumb(article, doc, TILE),
            thumb(short, doc, TILE),
            thumb(article, deck, TILE),
            thumb(hero, web, TILE),
        ])
            expect(t.scale).toBeCloseTo(THUMB_W / 1280, 6);
    });

    it("leaves a deck tile pixel-identical — its card already is the section's own page", () => {
        const slide = sectionOf(
            colGroup([
                inst("text", { style: "h1", text: "A Title" }),
                inst("text", { style: "subtitle", text: prose(4) }),
            ]),
        );
        const plain = thumb(slide, deck);
        const tiled = thumb(slide, deck, TILE);
        expect(tiled.boxH).toBe(plain.boxH);
        expect(tiled.scale).toBeCloseTo(plain.scale, 6);
        expect(tiled.overflows).toBe(false);
    });

    it("crops the tail, not the head: a tall section keeps its top edge", () => {
        const tall = fitIntoBox({ w: 320, h: 180 }, { w: 1280, h: 2000 }, "cover");
        expect(tall.top).toBe(0);
        expect(2000 * tall.scale).toBeGreaterThan(180); // the premise: this one really does crop
        // contain still centres what it could not fill
        expect(fitIntoBox({ w: 320, h: 180 }, { w: 1280, h: 300 }, "contain").top).toBeGreaterThan(
            0,
        );
    });
});
