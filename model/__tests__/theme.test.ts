import { afterEach, describe, expect, it } from "vitest";
import {
    contrastRatio,
    DEFAULT_THEME,
    finalizeTheme,
    fontStack,
    hexA,
    hexToOklch,
    hexToRgb,
    luminance,
    mix,
    mixWhite,
    oklchToHex,
    registerThemes,
    relLuminance,
    resolveTheme,
    THEME_LIST,
    THEMES,
    themeCssVars,
} from "@themes";
import type { Theme, Tokens } from "@themes";

// theme.ts is pure color math + resolvers + the curated library. The ONLY seam is the module-level
// custom-theme registry, reset after each test.
afterEach(() => {
    registerThemes([]);
});

const baseTokens: Tokens = {
    bg: "#ffffff",
    surface: "#ffffff",
    ink: "#000000",
    soft: "#333333",
    muted: "#777777",
    accent: "#0a84ff",
    onAccent: "#ffffff",
    line: "#dddddd",
    radius: 16,
    fontDisplay: "Fraunces",
    fontBody: "Hanken Grotesk",
    fontMono: "DM Mono",
    headingWeight: 560,
};

const customTheme = (id: string, name = "Custom"): Theme => ({
    id,
    name,
    tag: "editorial",
    dark: false,
    tokens: baseTokens,
});

describe("hexToRgb", () => {
    it("expands #rgb shorthand", () => {
        expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
        expect(hexToRgb("#000")).toEqual([0, 0, 0]);
    });
    it("parses full 6-digit hex", () => {
        expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
    });
    it("treats un-parseable channels as 0", () => {
        expect(hexToRgb("#zzzzzz")).toEqual([0, 0, 0]);
    });
});

describe("luminance", () => {
    it("is 0 for black and 1 for white", () => {
        expect(luminance("#000000")).toBe(0);
        expect(luminance("#ffffff")).toBe(1);
    });
    it("treats <6-digit input as light (1)", () => {
        expect(luminance("#fff")).toBe(1);
    });
});

describe("relLuminance (WCAG)", () => {
    it("is 0 for black and 1 for white", () => {
        expect(relLuminance("#000000")).toBeCloseTo(0, 6);
        expect(relLuminance("#ffffff")).toBeCloseTo(1, 6);
    });
});

describe("contrastRatio (WCAG)", () => {
    it("is 21 for black vs white", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    });
    it("is 1 for identical colors", () => {
        expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 6);
    });
    it("is symmetric in its arguments", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(
            contrastRatio("#ffffff", "#000000"),
            6,
        );
    });
});

describe("mix", () => {
    it("returns a at t=0 and b at t=1", () => {
        expect(mix("#000", "#fff", 0)).toBe("#000000");
        expect(mix("#000", "#fff", 1)).toBe("#ffffff");
    });
    it("blends to the midpoint at t=0.5", () => {
        expect(mix("#000", "#fff", 0.5)).toBe("#808080");
    });
    it("returns a unchanged when either side is non-hex", () => {
        expect(mix("red", "#fff", 0.5)).toBe("red");
    });
});

describe("mixWhite", () => {
    it("is unchanged at f=0", () => {
        expect(mixWhite("#336699", 0)).toBe("#336699");
    });
    it("is white at f=1", () => {
        expect(mixWhite("#336699", 1)).toBe("#ffffff");
    });
});

describe("hexA", () => {
    it("builds an rgba() string", () => {
        expect(hexA("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    });
    it("returns <6-digit input unchanged", () => {
        expect(hexA("#fff", 0.5)).toBe("#fff");
    });
});

describe("hexToOklch <-> oklchToHex round-trip", () => {
    const samples = ["#336699", "#c0a875", "#2b5c7a", "#ff0000", "#00ff00", "#0000ff", "#808080"];
    it("returns a valid 6-digit hex", () => {
        for (const hex of samples) {
            expect(oklchToHex(hexToOklch(hex))).toMatch(/^#[0-9a-f]{6}$/);
        }
    });
    it("reproduces an in-gamut color within a small epsilon", () => {
        for (const hex of samples) {
            const before = hexToRgb(hex);
            const after = hexToRgb(oklchToHex(hexToOklch(hex)));
            for (let i = 0; i < 3; i++) {
                expect(Math.abs(before[i]! - after[i]!)).toBeLessThanOrEqual(2);
            }
        }
    });
});

describe("fontStack", () => {
    it("maps display to a serif family, mono to monospace, else sans-serif", () => {
        expect(fontStack("display", baseTokens)).toBe("'Fraunces', serif");
        expect(fontStack("mono", baseTokens)).toBe("'DM Mono', monospace");
        expect(fontStack("ui", baseTokens)).toBe("'Hanken Grotesk', sans-serif");
    });
});

describe("themeCssVars", () => {
    it("derives the radius scale so radius 16 reproduces Tailwind's default steps", () => {
        const v = themeCssVars(baseTokens);
        expect(v["--radius"]).toBe("16px");
        expect(v["--radius-xs"]).toBe("2px");
        expect(v["--radius-sm"]).toBe("4px");
        expect(v["--radius-md"]).toBe("6px");
        expect(v["--radius-lg"]).toBe("8px");
        expect(v["--radius-xl"]).toBe("12px");
        expect(v["--radius-2xl"]).toBe("16px");
        expect(v["--radius-3xl"]).toBe("24px");
    });
    it("collapses every radius token to 0px at radius 0", () => {
        const v = themeCssVars({ ...baseTokens, radius: 0 });
        for (const key of [
            "--radius",
            "--radius-xs",
            "--radius-sm",
            "--radius-md",
            "--radius-lg",
            "--radius-xl",
            "--radius-2xl",
            "--radius-3xl",
        ]) {
            expect(v[key]).toBe("0px");
        }
    });
    it("carries the heading weight as --hw", () => {
        expect(themeCssVars(baseTokens)["--hw"]).toBe(String(baseTokens.headingWeight));
    });
    it("falls back to a default border-width and shadow when absent", () => {
        const v = themeCssVars(baseTokens);
        expect(v["--border-width"]).toBe("1px");
        expect(v["--shadow"]).toBe("0 1px 2px rgba(0,0,0,0.05)");
    });
    it("passes through an explicit border-width and shadow", () => {
        const v = themeCssVars({ ...baseTokens, border: 3, shadow: "none" });
        expect(v["--border-width"]).toBe("3px");
        expect(v["--shadow"]).toBe("none");
    });
});

describe("finalizeTheme (AI-safety pass)", () => {
    it("passes non-color tokens through unchanged", () => {
        const input: Tokens = { ...baseTokens, border: 2, shadow: "none" };
        const out = finalizeTheme(input);
        expect(out.fontDisplay).toBe(input.fontDisplay);
        expect(out.fontMono).toBe(input.fontMono);
        expect(out.radius).toBe(input.radius);
        expect(out.headingWeight).toBe(input.headingWeight);
        expect(out.border).toBe(input.border);
        expect(out.shadow).toBe(input.shadow);
    });
    it("resolves onAccent to a pure black or white", () => {
        const out = finalizeTheme({ ...baseTokens, accent: "#39ff14" });
        expect(["#0a0a0a", "#ffffff"]).toContain(out.onAccent);
    });
    it("repairs ink to be legible on the surface (AA+)", () => {
        const input: Tokens = {
            ...baseTokens,
            bg: "#ffffff",
            surface: "#ffffff",
            ink: "#888888",
            soft: "#aaaaaa",
            muted: "#bbbbbb",
        };
        const out = finalizeTheme(input);
        expect(contrastRatio(out.ink, out.surface)).toBeGreaterThanOrEqual(5.5);
    });
    it("tames a neon/high-chroma accent below the chroma ceiling", () => {
        const out = finalizeTheme({ ...baseTokens, accent: "#39ff14" });
        expect(hexToOklch(out.accent).C).toBeLessThan(0.155);
    });
    it("lifts surface off the page on a dark theme with no separation", () => {
        const input: Tokens = { ...baseTokens, bg: "#0a0a0a", surface: "#0a0a0a", ink: "#eeeeee" };
        const out = finalizeTheme(input);
        expect(out.bg).toBe("#0a0a0a");
        expect(contrastRatio(out.bg, out.surface)).toBeGreaterThan(1.06);
    });
});

describe("resolveTheme / registerThemes", () => {
    it("resolves a built-in by id", () => {
        expect(resolveTheme("studio")).toBe(DEFAULT_THEME);
        expect(resolveTheme("studio").id).toBe("studio");
    });
    it("falls back to DEFAULT_THEME for an unknown id", () => {
        expect(resolveTheme("nope-not-a-theme")).toBe(DEFAULT_THEME);
    });
    it("surfaces a registered custom theme by id", () => {
        const mine = customTheme("my-custom");
        registerThemes([mine]);
        expect(resolveTheme("my-custom")).toBe(mine);
    });
    it("lets a built-in id win over a same-id custom theme", () => {
        registerThemes([customTheme("studio", "Impostor")]);
        expect(resolveTheme("studio")).toBe(DEFAULT_THEME);
        expect(resolveTheme("studio").name).toBe("Studio");
    });
    it("replaces the custom set wholesale on each call", () => {
        const a = customTheme("a-theme");
        const b = customTheme("b-theme");
        registerThemes([a]);
        registerThemes([b]);
        expect(resolveTheme("a-theme")).toBe(DEFAULT_THEME);
        expect(resolveTheme("b-theme")).toBe(b);
    });
});

describe("THEME_LIST / THEMES / DEFAULT_THEME", () => {
    it("has unique ids across the library", () => {
        const ids = THEME_LIST.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it("defaults to studio", () => {
        expect(DEFAULT_THEME.id).toBe("studio");
    });
    it("keeps THEMES in lock-step with THEME_LIST", () => {
        expect(Object.keys(THEMES).length).toBe(THEME_LIST.length);
    });
});
