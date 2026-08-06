import { describe, it, expect } from "vitest";
import { translateParts } from "../translate";

describe("translateParts", () => {
    it("uses the translator persona and carries the text + target language", () => {
        const out = translateParts("Hello", "Spanish");
        expect(out.system).toContain("translator");
        expect(out.prompt).toContain("Translate into Spanish");
        expect(out.prompt).toContain("Hello");
        expect(out.prompt.trimEnd().endsWith("Return only the Spanish translation.")).toBe(true);
    });

    it("includes the context block only when context is given", () => {
        expect(translateParts("Hello", "Spanish").prompt).not.toContain(
            "Context (for tone; do not translate this)",
        );
        const withCtx = translateParts("Hello", "Spanish", "surrounding copy");
        expect(withCtx.prompt).toContain("Context (for tone; do not translate this)");
        expect(withCtx.prompt).toContain("surrounding copy");
    });
});
