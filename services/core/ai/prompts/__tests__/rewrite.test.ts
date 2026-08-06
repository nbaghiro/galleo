import { describe, it, expect } from "vitest";
import { REWRITE_ACTIONS, instructionFor, rewriteParts } from "../rewrite";

describe("instructionFor", () => {
    it("maps a known action key to its canned instruction", () => {
        expect(instructionFor("punchier")).toBe(REWRITE_ACTIONS.punchier);
        expect(instructionFor("fix")).toBe(REWRITE_ACTIONS.fix);
    });
    it("passes an unknown string through unchanged", () => {
        expect(instructionFor("Make it rhyme")).toBe("Make it rhyme");
    });
});

describe("rewriteParts", () => {
    it("uses the copy-editor persona and carries text + instruction", () => {
        const out = rewriteParts("Hello world", "punchier");
        expect(out.system).toContain("copy editor");
        expect(out.prompt).toContain("Instruction");
        expect(out.prompt).toContain(REWRITE_ACTIONS.punchier);
        expect(out.prompt).toContain("Hello world");
        expect(out.prompt.trimEnd().endsWith("Return only the rewritten text.")).toBe(true);
    });

    it("includes the context block only when context is given", () => {
        expect(rewriteParts("t", "shorter").prompt).not.toContain("Context (do not rewrite this)");
        const withCtx = rewriteParts("t", "shorter", "The section headline");
        expect(withCtx.prompt).toContain("Context (do not rewrite this)");
        expect(withCtx.prompt).toContain("The section headline");
    });

    it("passes an unknown action through into the prompt", () => {
        expect(rewriteParts("t", "Make it rhyme").prompt).toContain("Make it rhyme");
    });
});
