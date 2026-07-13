import { describe, it, expect } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { themeFromArtifactParts, themeFromPromptParts } from "../theme";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title: string): Section => ({
    id,
    root: { type: "group", data: { children: [txt(title)] } },
});

const content: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [sec("s1", "Title"), sec("s2", "Thesis")],
};

describe("themeFromPromptParts", () => {
    it("lists the display, body, and mono font allow-lists in the system prompt", () => {
        const { system } = themeFromPromptParts("warm mid-century");
        expect(system).toContain("display (headings):");
        expect(system).toContain("Fraunces"); // a display font
        expect(system).toContain("body (paragraphs/UI):");
        expect(system).toContain("Manrope"); // a body font
        expect(system).toContain("mono (labels):");
        expect(system).toContain("DM Mono"); // a mono font
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

describe("themeFromArtifactParts", () => {
    it("embeds the artifact spine", () => {
        expect(themeFromArtifactParts(content).prompt).toContain('A deck themed "studio".');
    });
    it("includes the extra direction only when a hint is given", () => {
        expect(themeFromArtifactParts(content).prompt).not.toContain("Extra direction");
        expect(themeFromArtifactParts(content, "lean brutalist").prompt).toContain(
            "Extra direction",
        );
        expect(themeFromArtifactParts(content, "lean brutalist").prompt).toContain(
            "lean brutalist",
        );
    });
});
