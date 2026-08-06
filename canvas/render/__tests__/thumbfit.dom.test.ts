// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import { sectionSlides } from "@canvas/render/commands";
import { resolveProfile, sectionFrame } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";
import { colGroup } from "@model/artifact";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");
const THUMB_W = 176;

// far taller than a 16:9 frame — a doc-style section of heading + many paragraphs
const tall = sectionOf(
    colGroup([
        inst("text", { style: "h1", text: "Where the dollars sit, and where they're moving" }),
        ...Array.from({ length: 40 }, (_, i) =>
            inst("text", { style: "body", text: `para ${i} ${"y".repeat(400)}` }),
        ),
    ]),
);
const short = sectionOf(colGroup([inst("text", { style: "h1", text: "Just a title" })]));

// What ScaledSectionCanvas(frame="slide") renders: page 0 of sectionSlides, content-fit into the
// frame, then the frame scaled to the thumb width. Mirrors slideElement (present).
const thumb = (section: typeof tall): { rendered: number; box: number } => {
    const fr = sectionFrame(section, deck);
    const page = sectionSlides(section, tokens, deck, true)[0]!;
    const contentFit = Math.min(1, page.h / page.contentH);
    const scale = THUMB_W / fr.w;
    return {
        rendered: page.contentH * contentFit * scale,
        box: Math.round((THUMB_W * fr.h) / fr.w),
    };
};

describe("16:9 thumbnails never overflow their box", () => {
    it("paginates a tall section rather than rendering it whole", () => {
        const pages = sectionSlides(tall, tokens, deck, true);
        expect(pages.length).toBeGreaterThan(1);
        // every page's content fits its frame, so nothing can escape downstream
        for (const p of pages) expect(p.contentH).toBeLessThanOrEqual(p.h + 1);
    });

    it("fits a tall section inside the thumb box", () => {
        const { rendered, box } = thumb(tall);
        expect(rendered).toBeLessThanOrEqual(box + 1);
    });

    it("fits a short section inside the thumb box too", () => {
        const { rendered, box } = thumb(short);
        expect(rendered).toBeLessThanOrEqual(box + 1);
        expect(rendered).toBeGreaterThan(0);
    });

    it("shows the first page at full scale, not the whole section shrunk", () => {
        // the regression: scaling the whole 3.6x section down would make page 0 unreadable
        const page = sectionSlides(tall, tokens, deck, true)[0]!;
        expect(page.contentH).toBeLessThanOrEqual(page.h + 1);
    });

    it("passes `plain` through, so an empty region shows no drop affordance in a thumbnail", () => {
        const empty = sectionOf(colGroup([]));
        const bare = sectionSlides(empty, tokens, deck, true)[0]!;
        const withAffordance = sectionSlides(empty, tokens, deck, false)[0]!;
        expect(bare.commands.length).toBeLessThan(withAffordance.commands.length);
    });
});
