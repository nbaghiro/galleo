import { describe, it, expect } from "vitest";
import { RUBRIC, VOICE, lengthGuidance } from "@services/core/ai/prompts/rubric";

describe("RUBRIC / VOICE", () => {
    it("are two distinct, non-empty guidance blocks", () => {
        expect(RUBRIC).toContain("quality bar");
        expect(VOICE).toContain("Voice");
        expect(RUBRIC).not.toBe(VOICE);
    });
});

describe("lengthGuidance", () => {
    // one band per length, bracketing what the estimate prices (sectionsForLength: 7 · 12 · 18)
    it("gives a short* length the tight band (case-insensitive prefix)", () => {
        for (const l of ["short", "Short and tight", "SHORTEST"])
            expect(lengthGuidance(l)).toContain("5 to 8 sections");
    });
    it("gives in* / deep* / long* lengths the full band", () => {
        for (const l of ["in-depth", "Deep dive", "long read"])
            expect(lengthGuidance(l)).toContain("14 to 20 sections");
    });
    it("gives a neutral or unset length the usual band and lets the story decide within it", () => {
        for (const l of ["standard", undefined]) {
            const out = lengthGuidance(l);
            expect(out).toContain("8 to 14 sections");
            expect(out).toContain("Size it to the story");
        }
    });
    it("never asks for padding, whatever the length", () => {
        for (const l of ["short", "standard", "long"])
            expect(lengthGuidance(l)).toContain("Never pad to hit a number");
    });
});
