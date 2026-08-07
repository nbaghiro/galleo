// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import { fitSectionToFrame } from "@canvas/render/fit";
import { layoutSection, measureText, sectionSlides } from "@canvas/render/commands";
import { resolveProfile, sectionFrame } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";
import { colGroup } from "@model/artifact";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");
const doc = resolveProfile("doc");
const THUMB_W = 176;

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

// Mirrors ScaledSectionCanvas(frame="slide"): a paged format renders the section as its own page,
// a continuous one solves for the width that becomes the card's shape. Then fit both axes and centre.
const thumb = (
    section: typeof article,
    profile = doc,
): { fillW: number; fillH: number; overflows: boolean } => {
    const fr = sectionFrame(section, profile);
    const boxW = THUMB_W;
    const boxH = Math.round((THUMB_W * fr.h) / fr.w);
    let layoutW = fr.w;
    let contentH = fr.h;
    if (profile.kind === "paged") {
        const page = sectionSlides(section, tokens, { ...profile, overflow: "fit" }, true)[0]!;
        contentH = page.contentH;
    } else {
        const f = fitSectionToFrame(section, fr, measureText, tokens, profile, true);
        layoutW = f.layoutW;
        contentH = f.contentH;
    }
    const s = Math.min(boxW / layoutW, boxH / contentH);
    return {
        fillW: (layoutW * s) / boxW,
        fillH: (contentH * s) / boxH,
        overflows: layoutW * s > boxW + 1 || contentH * s > boxH + 1,
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
