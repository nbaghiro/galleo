import "@elements/register";
import { describe, expect, it } from "vitest";
import type { TextLeaf } from "@engine/node";
import {
    CODE_BG,
    MONO_FONT_STACK,
    SECTION_GAP,
    ctxFor,
    layoutNode,
    layoutRuns,
    layoutSection,
    layoutSlide,
    runFont,
} from "@canvas/render/commands";
import { fixed, grow } from "@model/geometry";
import { inst, measure, sectionOf, textMetricsCtx } from "@canvas/testkit";

// commands.ts is mostly DOM-free: layoutSection/layoutSlide/layoutNode take an injected `measure`, and
// layoutRuns takes an injected text-metrics context. Only measureText/sectionSlides need the real canvas
// (see commands.dom.test.ts).

describe("runFont", () => {
    const leaf: TextLeaf = { text: "x", fontId: "Inter", size: 16, weight: 500, wrap: "words" };
    it("builds a CSS font shorthand, overriding per run", () => {
        expect(runFont(leaf, { text: "x" })).toBe("500 16px Inter");
        expect(runFont(leaf, { text: "x", bold: true })).toBe("700 16px Inter");
        expect(runFont(leaf, { text: "x", italic: true })).toBe("italic 500 16px Inter");
        expect(runFont(leaf, { text: "x", code: true })).toBe(`500 16px ${MONO_FONT_STACK}`);
    });
});

describe("ctxFor + constants", () => {
    it("builds a LayoutCtx with defaults", () => {
        const c = ctxFor(600);
        expect(c.availWidth).toBe(600);
        expect(c.box.w).toBe(600);
        expect(c.format.id).toBe("deck");
    });
    it("pins SECTION_GAP and the code treatment", () => {
        expect(SECTION_GAP).toBe(22);
        expect(CODE_BG).toBe("rgba(120, 120, 120, 0.12)");
    });
});

describe("layoutSection / layoutNode", () => {
    it("composes + lays out a section, reporting height + the section region", () => {
        const { commands, regions, height } = layoutSection(
            sectionOf(inst("text", { text: "Hello" })),
            600,
            measure,
        );
        expect(commands.length).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(regions.some((r) => r.id === "section:s1")).toBe(true);
    });
    it("lays out an arbitrary node at a width", () => {
        const { commands, height } = layoutNode(
            { w: grow(), h: fixed(40), fill: { color: "#000" } },
            300,
            measure,
        );
        expect(commands).toHaveLength(1);
        expect(height).toBe(40);
    });
});

describe("layoutSlide — slide fit", () => {
    it("a short section fills the frame height", () => {
        const { height } = layoutSlide(
            sectionOf(inst("text", { text: "Title" })),
            1280,
            720,
            measure,
        );
        expect(height).toBe(720);
    });
    it("a very tall section keeps its natural (taller) height", () => {
        const paras = Array.from({ length: 40 }, (_, i) =>
            inst("text", { text: `Paragraph ${i}` }),
        );
        const section = sectionOf({ type: "group", data: { direction: "col", children: paras } });
        expect(layoutSlide(section, 1280, 720, measure).height).toBeGreaterThan(720);
    });
});

describe("layoutRuns — run-aware wrap", () => {
    const cx = textMetricsCtx(); // glyph width = text.length * 8
    const leaf = (text: string, wrap: "words" | "none" = "words"): TextLeaf => ({
        text,
        fontId: "f",
        size: 12,
        wrap,
        runs: [{ text }],
    });
    it("wraps words to fit the width", () => {
        const laid = layoutRuns(cx, leaf("hello world"), 50);
        expect(laid.lines).toHaveLength(2);
        expect(laid.width).toBeLessThanOrEqual(50);
    });
    it("does not wrap when wrap is none", () => {
        expect(layoutRuns(cx, leaf("hello world", "none"), 50).lines).toHaveLength(1);
    });
    it("line height defaults to size × 1.35", () => {
        expect(layoutRuns(cx, leaf("hi"), 999).lineHeight).toBeCloseTo(12 * 1.35, 5);
    });
});
