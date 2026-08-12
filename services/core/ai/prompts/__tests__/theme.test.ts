import { describe, it, expect } from "vitest";
import { themeFromPromptParts } from "../theme";

describe("themeFromPromptParts", () => {
    it("lists the display, body, and mono font allow-lists in the system prompt", () => {
        const { system } = themeFromPromptParts("warm mid-century");
        expect(system).toContain("display (headings):");
        expect(system).toContain("Fraunces");
        expect(system).toContain("body (paragraphs/UI):");
        expect(system).toContain("Manrope");
        expect(system).toContain("mono (labels):");
        expect(system).toContain("DM Mono");
    });
    it("embeds the free-text mood in the prompt", () => {
        expect(themeFromPromptParts("warm mid-century").prompt).toContain("warm mid-century");
    });
    it("omits the dark/light clause when isDark is undefined", () => {
        expect(themeFromPromptParts("warm").prompt).not.toContain("It should be a");
    });
    it("adds a dark clause when isDark is true", () => {
        expect(themeFromPromptParts("warm", true).prompt).toContain("It should be a dark theme.");
    });
    it("adds a light clause when isDark is false", () => {
        expect(themeFromPromptParts("warm", false).prompt).toContain("It should be a light theme.");
    });
});
