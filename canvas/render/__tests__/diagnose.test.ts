import { describe, expect, it } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { diagnoseSection, diagnoseSections, SPARSE_BELOW } from "@canvas/render/diagnose";
import { measure } from "@canvas/testkit";
import "@elements/register";

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t } });

const section = (id: string, children: ElementInstance[]): Section => ({
    id,
    root: { type: "group", data: { children } },
});

const DECK = resolveProfile("deck"); // 1280 × 720, a fixed frame
const DOC = resolveProfile("doc"); // 816 wide, height "auto"

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

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
