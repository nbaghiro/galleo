import { describe, expect, it } from "vitest";
import { THEME_LIST } from "@themes";

/**
 * The marketing page pairs theme tokens by hand, and a pairing that fails is not a slightly worse
 * page: it is a word the reader cannot see at all. "worse" in the thesis band was set
 * `color: var(--color-accent)` on a `.band-ink` ground, which is accent-on-ink, and 28 of the 42
 * themes fail that at 3:1. It was invisible until you selected it.
 *
 * These lock the two pairings the page now relies on. Accent-on-ink is deliberately not asserted,
 * because the page must never use it: emphasis on an inverted band goes through `.mark-accent`,
 * which paints onAccent on accent and is legible by construction.
 */
const rgb = (hex: string): number[] => {
    const raw = hex.replace("#", "");
    const full = raw.length === 3 ? raw.replace(/./g, "$&$&") : raw;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const luminance = (hex: string): number =>
    rgb(hex)
        .map((c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
const contrast = (a: string, b: string): number => {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// large display type, so the WCAG large-text threshold rather than 4.5
const FLOOR = 3;

describe("marketing token pairings", () => {
    it("accent text reads on the canvas ground in every theme", () => {
        const failing = THEME_LIST.filter(
            (t) => contrast(t.tokens.accent, t.tokens.bg) < FLOOR,
        ).map((t) => `${t.id} ${contrast(t.tokens.accent, t.tokens.bg).toFixed(2)}:1`);
        expect(failing).toEqual([]);
    });

    it("mark-accent reads in every theme, which is what makes it safe on an inverted band", () => {
        const failing = THEME_LIST.filter(
            (t) => contrast(t.tokens.onAccent, t.tokens.accent) < FLOOR,
        ).map((t) => `${t.id} ${contrast(t.tokens.onAccent, t.tokens.accent).toFixed(2)}:1`);
        expect(failing).toEqual([]);
    });

    // .band-ink paints its ground with --color-ink and its text with --color-canvas, which is the
    // theme's own ground/ink pair inverted, so this is body text and takes the 4.5 floor
    it("an inverted band's own text reads on it in every theme", () => {
        const failing = THEME_LIST.filter((t) => contrast(t.tokens.bg, t.tokens.ink) < 4.5).map(
            (t) => `${t.id} ${contrast(t.tokens.bg, t.tokens.ink).toFixed(2)}:1`,
        );
        expect(failing).toEqual([]);
    });
});
