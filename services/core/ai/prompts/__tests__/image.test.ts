import { describe, it, expect } from "vitest";
import { imagePromptParts } from "../image";

describe("imagePromptParts", () => {
    it("uses the art-director system prompt and names the subject", () => {
        const out = imagePromptParts({ subject: "a wind farm at dusk" });
        expect(out.system).toContain("art director");
        expect(out.prompt).toContain("Subject");
        expect(out.prompt).toContain("a wind farm at dusk");
        expect(out.prompt.trimEnd().endsWith("Write the image prompt.")).toBe(true);
    });

    it("includes the theme description only when a themeId is given", () => {
        expect(imagePromptParts({ subject: "x" }).prompt).not.toContain("The active theme is");
        expect(imagePromptParts({ subject: "x", themeId: "studio" }).prompt).toContain(
            "The active theme is",
        );
    });

    it("includes the accompanying copy only when nearbyText is given", () => {
        expect(imagePromptParts({ subject: "x" }).prompt).not.toContain("It accompanies this copy");
        expect(imagePromptParts({ subject: "x", nearbyText: "Made to last" }).prompt).toContain(
            "Made to last",
        );
    });

    it("includes the aspect framing only when an aspect is given", () => {
        expect(imagePromptParts({ subject: "x" }).prompt).not.toContain("Composition for a");
        expect(imagePromptParts({ subject: "x", aspect: "16:9" }).prompt).toContain(
            "Composition for a 16:9 frame.",
        );
    });
});
