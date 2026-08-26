import { describe, expect, it } from "vitest";
import {
    backdropCss,
    createSectionStackCache,
    scaledHostCss,
    sectionFrameHeight,
    sectionLayoutWidth,
} from "@canvas/render/backends";
import { previewContentProfile, resolveProfile } from "@engine/profile";
import { inst, sectionOf, tokens } from "@canvas/testkit";

describe("scaledHostCss", () => {
    it("scales from the top-left in the base variant", () => {
        expect(scaledHostCss(400, 300, 0.5)).toBe(
            "width:400px;height:300px;transform:scale(0.5);transform-origin:top left",
        );
    });
    it("absolutely positions and centers within a frame in the center variant", () => {
        expect(scaledHostCss(400, 300, 0.5, { frameW: 800, frameH: 600 })).toBe(
            "position:absolute;width:400px;height:300px;transform:scale(0.5);transform-origin:top left;left:200px;top:225px",
        );
    });
});

describe("backdropCss", () => {
    it("no background → theme bg", () => {
        expect(backdropCss(undefined, tokens)).toBe(tokens.bg);
        expect(backdropCss({ kind: "none" }, tokens)).toBe(tokens.bg);
    });
    it("color → the color", () => {
        expect(backdropCss({ kind: "color", color: "#123456" }, tokens)).toBe("#123456");
    });
    it("resolves a tone against the theme, so the backdrop matches what the section paints", () => {
        expect(backdropCss({ kind: "tone", tone: "contrast" }, tokens)).toBe(tokens.ink);
        expect(backdropCss({ kind: "tone", tone: "accent" }, tokens)).toBe(tokens.accent);
        expect(backdropCss({ kind: "tone" }, tokens)).toBe(
            backdropCss({ kind: "tone", tone: "tint" }, tokens),
        );
    });
    it("gradient → linear-gradient with a default angle", () => {
        expect(
            backdropCss({ kind: "gradient", gradient: { from: "#fff", to: "#000" } }, tokens),
        ).toBe("linear-gradient(135deg, #fff, #000)");
    });
    it("image with scrim → layered gradient + url", () => {
        expect(backdropCss({ kind: "image", image: "p.png", scrim: 0.4 }, tokens)).toBe(
            'linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url("p.png")',
        );
    });
    it("image without scrim → bare url", () => {
        expect(backdropCss({ kind: "image", image: "p.png" }, tokens)).toBe('url("p.png")');
    });
});

describe("sectionLayoutWidth", () => {
    const deck = resolveProfile("deck");
    const web = resolveProfile("web");
    const s = sectionOf(inst("text", {}));
    it("a contained section uses maxContentWidth, clamped to the board minus its stackInset", () => {
        expect(sectionLayoutWidth(s, deck, 2000)).toBe(deck.maxContentWidth);
        // a deck keeps only a sliver of backdrop on a narrow stack; a doc holds its reading gutter
        expect(sectionLayoutWidth(s, deck, 800)).toBe(800 - 16);
        expect(sectionLayoutWidth(s, resolveProfile("doc"), 800)).toBe(800 - 64);
    });
    it("a bleed section — or any web-format section — fills the board", () => {
        expect(sectionLayoutWidth(sectionOf(inst("text", {}), { bleed: true }), deck, 900)).toBe(
            900,
        );
        expect(sectionLayoutWidth(s, web, 900)).toBe(900);
    });
    it("a doc bled for a phone fills the board, unlike the same doc on desktop", () => {
        const doc = resolveProfile("doc");
        expect(sectionLayoutWidth(s, doc, 430)).toBe(430 - 64);
        expect(sectionLayoutWidth(s, previewContentProfile(doc, true), 430)).toBe(430);
    });
    it("a doc holds one column: a tone band stays in it, a photo band still spans", () => {
        const doc = resolveProfile("doc");
        const tint = sectionOf(inst("text", {}), {
            bleed: true,
            background: { kind: "tone", tone: "tint" },
        });
        const photo = sectionOf(inst("text", {}), {
            bleed: true,
            background: { kind: "image", image: "p.png" },
        });
        expect(sectionLayoutWidth(tint, doc, 1440)).toBe(sectionLayoutWidth(s, doc, 1440));
        expect(sectionLayoutWidth(photo, doc, 1440)).toBe(1440);
        // the same two on a site are one width, which is why the flags drift there
        expect(sectionLayoutWidth(tint, web, 1440)).toBe(sectionLayoutWidth(photo, web, 1440));
    });
});

describe("sectionFrameHeight", () => {
    const deck = resolveProfile("deck");
    const s = sectionOf(inst("text", {}));
    it("gives the profile's aspect at the caller's own layout width", () => {
        expect(sectionFrameHeight(s, deck, 1280)).toBe(720);
        expect(sectionFrameHeight(s, deck, 640)).toBe(360); // editor width, same 16:9 shape
    });
    it("a section's own frame aspect wins over the profile's", () => {
        const square = sectionOf(inst("text", {}), { frame: { aspect: 1 } });
        expect(sectionFrameHeight(square, deck, 800)).toBe(800);
    });
});

describe("createSectionStackCache", () => {
    it("starts empty", () => {
        expect(createSectionStackCache().entries.size).toBe(0);
    });
});
