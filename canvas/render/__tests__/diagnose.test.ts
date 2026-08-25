import { describe, expect, it } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { diagnoseSection, diagnoseSections, SPARSE_BELOW } from "@canvas/render/diagnose";
import type { MeasureText } from "@engine/node";
import { measure } from "@canvas/testkit";
import "@elements/register";

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t } });

const section = (id: string, children: ElementInstance[]): Section => ({
    id,
    root: { type: "container", data: { children } },
});

const DECK = resolveProfile("deck"); // 1280 × 720, a fixed frame
const DOC = resolveProfile("doc"); // 816 wide, height "auto"

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

// The shared testkit measurer is size-blind, and autofit's whole mechanism is that a smaller type
// re-wraps into fewer lines: this one charges half a pixel per character per point of size.
const sized: MeasureText = (leaf, maxW) => {
    const w = leaf.text.length * leaf.size * 0.5;
    const lh = leaf.lineHeight ?? leaf.size * 1.35;
    if (leaf.wrap === "none" || !Number.isFinite(maxW)) return { width: w, height: lh };
    return { width: Math.min(w, maxW), height: Math.max(1, Math.ceil(w / Math.max(1, maxW))) * lh };
};

describe("a fixed frame", () => {
    it("reports the frame it was measured against", () => {
        const fit = diagnoseSection(section("a", [text("Short")]), 1280, measure, undefined, DECK);
        expect(fit.frameHeight).toBe(720);
    });

    it("scales the frame when laid out at a different width, so the aspect holds", () => {
        const fit = diagnoseSection(section("a", [text("Short")]), 640, measure, undefined, DECK);
        expect(fit.frameHeight).toBe(360);
    });

    it("reports no overflow for content that fits", () => {
        const fit = diagnoseSection(section("a", [text("Short")]), 1280, measure, undefined, DECK);
        expect(fit.overflow).toBe(0);
    });

    it("reports the spill for content that does not fit", () => {
        const fit = diagnoseSection(
            section("a", [text(words(4000))]),
            1280,
            measure,
            undefined,
            DECK,
        );
        expect(fit.overflow).toBeGreaterThan(0);
        expect(fit.contentHeight).toBeGreaterThan(fit.frameHeight!);
    });

    // The spill above stays natural, so the generation signal survives autofit; the scale beside it
    // says how much of that spill the renderer absorbs.
    it("reports the scale the slide path would render an overflowing section at", () => {
        const spills = diagnoseSection(
            section("a", [text(words(500))]),
            1280,
            sized,
            undefined,
            DECK,
        );
        expect(spills.overflow).toBeGreaterThan(0);
        expect(spills.fitScale).toBeLessThan(1);
    });

    it("reports 1 for a section that needs no fitting, and for an elastic page", () => {
        expect(
            diagnoseSection(section("a", [text("Short")]), 1280, measure, undefined, DECK).fitScale,
        ).toBe(1);
        expect(
            diagnoseSection(section("a", [text(words(400))]), 816, measure, undefined, DOC)
                .fitScale,
        ).toBe(1);
    });

    it("reports fill, so a nearly empty slide is visible as a number", () => {
        const fit = diagnoseSection(section("a", [text("Hi")]), 1280, measure, undefined, DECK);
        expect(fit.fill).toBeLessThan(SPARSE_BELOW);
    });
});

describe("an elastic frame", () => {
    it("cannot overflow, because the page grows instead", () => {
        const fit = diagnoseSection(
            section("a", [text(words(4000))]),
            816,
            measure,
            undefined,
            DOC,
        );
        expect(fit.frameHeight).toBeNull();
        expect(fit.overflow).toBe(0);
        expect(fit.fill).toBeNull();
    });

    it("still reports the height it laid out to", () => {
        const fit = diagnoseSection(section("a", [text(words(200))]), 816, measure, undefined, DOC);
        expect(fit.contentHeight).toBeGreaterThan(0);
    });
});

// A dark colour band swaps the section's tokens to the on-dark set, where `soft` and `muted` are
// rgba rather than hex. Reading those as the theme's own (dark) ink judged white text on a dark band
// as dark-on-dark and failed every such section at ~1:1.
describe("contrast on a dark colour band", () => {
    // `subtitle` takes the `soft` tone, which on-dark is rgba
    const band = (id: string): Section => ({
        ...section(id, [
            { type: "text", data: { text: "A lead line", style: "subtitle" } },
            text("A line that reads white once the tokens swap"),
        ]),
        background: { kind: "color", color: "#16140F" },
    });

    it("judges only the text whose colour it can actually read", () => {
        const fit = diagnoseSection(band("b1"), 1280, measure, undefined, DOC);
        expect(fit.minContrast).not.toBeNull();
        expect(fit.minContrast!).toBeGreaterThan(3);
    });
});

describe("diagnoseSections", () => {
    it("keeps each section's id, so a result maps back to its beat", () => {
        const fits = diagnoseSections(
            [section("b1", [text("One")]), section("b2", [text("Two")])],
            1280,
            measure,
            undefined,
            DECK,
        );
        expect(fits.map((f) => f.id)).toEqual(["b1", "b2"]);
    });

    it("returns nothing for no sections rather than throwing", () => {
        expect(diagnoseSections([], 1280, measure)).toEqual([]);
    });
});
