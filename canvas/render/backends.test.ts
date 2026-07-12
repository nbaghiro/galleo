import { describe, expect, it } from "vitest";
import { backdropCss, createSectionStackCache, sectionLayoutWidth } from "@canvas/render/backends";
import { resolveProfile } from "@engine/profile";
import { inst, sectionOf, tokens } from "@canvas/testkit";

// Pure helpers — no DOM (the painters are in backends.dom.test.ts).

describe("backdropCss", () => {
    it("no background → theme bg", () => {
        expect(backdropCss(undefined, tokens)).toBe(tokens.bg);
        expect(backdropCss({ kind: "none" }, tokens)).toBe(tokens.bg);
    });
    it("color → the color", () => {
        expect(backdropCss({ kind: "color", color: "#123456" }, tokens)).toBe("#123456");
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
    it("a contained section uses maxContentWidth, clamped to the board minus 64", () => {
        expect(sectionLayoutWidth(s, deck, 2000)).toBe(deck.maxContentWidth);
        expect(sectionLayoutWidth(s, deck, 800)).toBe(800 - 64);
    });
    it("a bleed section — or any web-format section — fills the board", () => {
        expect(sectionLayoutWidth(sectionOf(inst("text", {}), { bleed: true }), deck, 900)).toBe(
            900,
        );
        expect(sectionLayoutWidth(s, web, 900)).toBe(900);
    });
});

describe("createSectionStackCache", () => {
    it("starts empty", () => {
        expect(createSectionStackCache().entries.size).toBe(0);
    });
});
