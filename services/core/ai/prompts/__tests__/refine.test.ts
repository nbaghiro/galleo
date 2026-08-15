import { describe, it, expect } from "vitest";
import { refinePromptParts, themeContext } from "@services/core/ai/prompts/refine";

describe("refinePromptParts", () => {
    it("names the craft for the kind, so the model adds direction rather than adjectives", () => {
        expect(refinePromptParts("image", "a solar array").system).toContain("art director");
        expect(refinePromptParts("video", "a solar array").system).toContain("cinematographer");
        expect(refinePromptParts("theme", "warm and earthy").system).toContain("designer");
    });

    it("forbids the generator from baking text into an image or clip", () => {
        for (const kind of ["image", "video"] as const)
            expect(refinePromptParts(kind, "x").system).toMatch(
                /no on-screen text|letters, logos/i,
            );
    });

    it("keeps a theme brief away from hex values and font files", () => {
        expect(refinePromptParts("theme", "x").system).toContain("never specific hex values");
    });

    it("returns only the prompt, with the user's subject preserved", () => {
        const out = refinePromptParts("image", "a rooftop solar array");
        expect(out.system).toContain("Return ONLY the refined prompt");
        expect(out.prompt).toContain("a rooftop solar array");
        expect(out.prompt).toContain("Add craft, not a different idea");
        expect(out.prompt.trimEnd().endsWith("Write the refined prompt.")).toBe(true);
    });

    it("folds context in only when there is some, and marks it as not-the-subject", () => {
        expect(refinePromptParts("image", "x").prompt).not.toContain("It sits alongside");
        const withCtx = refinePromptParts("image", "x", "the closing section on pricing");
        expect(withCtx.prompt).toContain("It sits alongside");
        expect(withCtx.prompt).toContain("do not describe it");
        expect(withCtx.prompt).toContain("the closing section on pricing");
    });
});

describe("themeContext", () => {
    it("describes a known theme and stays absent without one", () => {
        expect(themeContext(undefined)).toBeUndefined();
        expect(themeContext("studio")).toContain("Studio");
    });
});
