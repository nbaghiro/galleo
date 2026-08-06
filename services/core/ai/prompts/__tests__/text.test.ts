import { describe, it, expect } from "vitest";
import { rewriteTextParts, translateTextParts } from "../text";

describe("rewriteTextParts", () => {
    it("uses the persona + hard return-only rule and carries the instruction and text", () => {
        const out = rewriteTextParts("Hello", "make it bolder");
        expect(out.system).toContain("Galleo's content designer");
        expect(out.system).toContain("Return ONLY the edited text");
        expect(out.prompt).toContain("How to edit it");
        expect(out.prompt).toContain("make it bolder");
        expect(out.prompt).toContain("Hello");
        expect(out.prompt.trimEnd().endsWith("Return only the edited text.")).toBe(true);
    });

    it("uses the plain passage heading and no context note when context is absent", () => {
        const out = rewriteTextParts("Hello", "x");
        expect(out.prompt).toContain("The text");
        expect(out.prompt).not.toContain("Surrounding text");
    });

    it("switches the passage heading and adds a context note when context is present", () => {
        const out = rewriteTextParts("Hello", "x", "The whole sentence");
        expect(out.prompt).toContain("The passage to rewrite");
        expect(out.prompt).toContain("Surrounding text");
        expect(out.prompt).toContain("The whole sentence");
    });
});

describe("translateTextParts", () => {
    it("instructs a translation into the target language and returns only it", () => {
        const out = translateTextParts("Hello", "French");
        expect(out.system).toContain("Translate the passage into French");
        expect(out.prompt).toContain("Translate this into French");
        expect(out.prompt).toContain("Hello");
        expect(out.prompt.trimEnd().endsWith("Return only the French translation.")).toBe(true);
    });

    it("adds a context note only when context is given", () => {
        expect(translateTextParts("Hello", "French").prompt).not.toContain("Surrounding text");
        expect(translateTextParts("Hello", "French", "context").prompt).toContain(
            "Surrounding text",
        );
    });
});
