import "@elements/register";
import { describe, expect, it } from "vitest";
import { fitSectionToFrame } from "@canvas/render/fit";
import { resolveProfile } from "@engine/profile";
import { colGroup, rowGroup } from "@model/artifact";
import { layoutSection } from "@canvas/render/commands";
import { inst, measure, sectionOf, tokens } from "@canvas/testkit";

const deck = resolveProfile("deck");
const doc = resolveProfile("doc");

const prose = (n: number): string =>
    Array.from({ length: n }, (_, i) => `word${i % 7} some more text here`).join(" ");

// a doc-shaped section: tall and narrow at its natural width
const article = sectionOf(
    colGroup([
        inst("text", { style: "label", text: "The Lead" }),
        inst("text", { style: "h2", text: "The street that closed for the summer." }),
        ...Array.from({ length: 4 }, () => inst("text", { style: "body", text: prose(28) })),
    ]),
);

// how much of the frame the fitted result actually covers, per axis
const fill = (
    f: { layoutW: number; contentH: number },
    frame: { w: number; h: number },
): { w: number; h: number } => {
    const s = Math.min(frame.w / f.layoutW, frame.h / f.contentH);
    return { w: (f.layoutW * s) / frame.w, h: (f.contentH * s) / frame.h };
};

describe("fitSectionToFrame", () => {
    const wide = { w: 1280, h: 720 }; // 16:9
    const tall = { w: 1080, h: 1920 }; // 9:16
    const square = { w: 1080, h: 1080 };

    it("fills a 16:9 frame with a section that is portrait at its natural width", () => {
        const f = fitSectionToFrame(article, wide, measure, tokens, doc, true);
        expect(f.exact).toBe(true);
        const cover = fill(f, wide);
        // wrapping is a step function, so "filled" means within a line break of it, not to the pixel
        expect(cover.w).toBeGreaterThan(0.94);
        expect(cover.h).toBeGreaterThan(0.94);
    });

    it("beats laying out at the frame width, which is what it replaces", () => {
        const naive = { layoutW: wide.w, contentH: 522 }; // article at 1280 — measured
        const f = fitSectionToFrame(article, wide, measure, tokens, doc, true);
        const worst = (c: { w: number; h: number }): number => Math.min(c.w, c.h);
        expect(worst(fill(f, wide))).toBeGreaterThan(worst(fill(naive, wide)));
    });

    it("solves the other direction too — a wide frame is not a special case", () => {
        for (const frame of [tall, square]) {
            const f = fitSectionToFrame(article, frame, measure, tokens, doc, true);
            const cover = fill(f, frame);
            expect(cover.w).toBeGreaterThan(0.94);
            expect(cover.h).toBeGreaterThan(0.94);
        }
    });

    it("goes wider for a wide frame and narrower for a tall one", () => {
        const w = fitSectionToFrame(article, wide, measure, tokens, doc, true).layoutW;
        const t = fitSectionToFrame(article, tall, measure, tokens, doc, true).layoutW;
        expect(w).toBeGreaterThan(t);
    });

    it("spends a single layout when the section already matches its frame", () => {
        // build a frame from the section's own natural shape, so no search is needed
        const slide = sectionOf(
            colGroup([
                inst("text", { style: "h1", text: "Title" }),
                inst("text", { style: "body", text: prose(12) }),
            ]),
        );
        const natural = layoutSection(slide, 1280, measure, tokens, deck, true).height;
        const f = fitSectionToFrame(slide, { w: 1280, h: natural }, measure, tokens, deck, true);
        expect(f.exact).toBe(true);
        expect(f.probes).toBe(1);
        expect(f.layoutW).toBe(1280);
    });

    it("never exceeds its probe budget", () => {
        for (const frame of [wide, tall, square])
            expect(
                fitSectionToFrame(article, frame, measure, tokens, doc, true).probes,
            ).toBeLessThanOrEqual(9);
    });

    it("stays inside a sane band around the frame width", () => {
        for (const frame of [wide, tall, square]) {
            const { layoutW } = fitSectionToFrame(article, frame, measure, tokens, doc, true);
            expect(layoutW).toBeGreaterThanOrEqual(frame.w / 8);
            expect(layoutW).toBeLessThanOrEqual(frame.w * 8);
        }
    });

    // The real-world case: a doc section with body copy beside a portrait photo. An image's height
    // GROWS with width, so H(W)/W flattens at a floor and no width crosses the target — reflowing alone
    // can never fill. coverFitMedia can, but only at a width where the TEXT already fits the frame, so
    // the fallback has to try more than the canonical one.
    const withPhoto = sectionOf(
        rowGroup(
            [
                inst("text", { style: "body", text: prose(40) }),
                inst("image", { src: "sea.png", aspect: 0.78 }),
            ],
            [0.55, 0.45],
        ),
    );

    it("fills when a photo sits beside text, at the doc's own frame", () => {
        const frame = { w: 816, h: 459 }; // sectionFrame(section, doc)
        const f = fitSectionToFrame(withPhoto, frame, measure, tokens, doc, true);
        expect(f.exact).toBe(true);
        const cover = fill(f, frame);
        expect(cover.w).toBeGreaterThan(0.94);
        expect(cover.h).toBeGreaterThan(0.94);
    });

    it("lands on the frame's own aspect, whatever width that took", () => {
        // cover-fit succeeds only where the text already fits the frame, so the width it needs depends
        // on the metrics; what must hold either way is that the result takes the frame's shape exactly
        const frame = { w: 816, h: 459 };
        const f = fitSectionToFrame(withPhoto, frame, measure, tokens, doc, true);
        expect(f.contentH / f.layoutW).toBeCloseTo(frame.h / frame.w, 2);
        expect(f.layoutW).toBeGreaterThanOrEqual(frame.w);
    });

    it("fills the same shape at a 16:9 frame too", () => {
        const f = fitSectionToFrame(withPhoto, wide, measure, tokens, doc, true);
        expect(f.exact).toBe(true);
        expect(Math.min(fill(f, wide).w, fill(f, wide).h)).toBeGreaterThan(0.94);
    });

    it("abandons the search for a lone photo and renders it as its own page", () => {
        // a lone photo has H(W) = W/aspect, so its ratio never moves and there is no crossing to find
        const photo = sectionOf(colGroup([inst("image", { src: "dune.png" })]));
        const f = fitSectionToFrame(photo, tall, measure, tokens, deck, true);
        expect(f.probes).toBeLessThanOrEqual(5); // detected by slope, not hunted to the budget
        expect(f.layoutW).toBe(tall.w); // the canonical width, never one picked for an unreachable target
    });

    it("returns commands laid out at the width it reports", () => {
        const f = fitSectionToFrame(article, wide, measure, tokens, doc, true);
        const right = f.commands.reduce((m, c) => Math.max(m, c.box.x + c.box.w), 0);
        const bottom = f.commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);
        expect(right).toBeLessThanOrEqual(f.layoutW + 1);
        expect(bottom).toBeCloseTo(f.contentH, 0);
    });
});
