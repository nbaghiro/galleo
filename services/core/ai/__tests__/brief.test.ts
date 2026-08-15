import { describe, it, expect } from "vitest";
import { normalizeBrief } from "@services/core/ai/tools/plan";

describe("normalizeBrief", () => {
    const read = { goal: "g", audience: "a", tone: "t", mustInclude: ["one", "two"] };

    it("keeps the prompt and surface alongside the read", () => {
        const out = normalizeBrief("make a deck", read, "deck");
        expect(out.prompt).toBe("make a deck");
        expect(out.surface).toBe("deck");
        expect(out.goal).toBe("g");
    });

    it("trims the point list to six and drops blanks", () => {
        const out = normalizeBrief("x", {
            ...read,
            mustInclude: ["  a  ", "", "b", "c", "d", "e", "f", "g"],
        });
        expect(out.mustInclude).toEqual(["a", "b", "c", "d", "e", "f"]);
    });

    it("turns a null or blank clarify into undefined, never the string 'null'", () => {
        expect(normalizeBrief("x", { ...read, clarify: null }).clarify).toBeUndefined();
        expect(normalizeBrief("x", { ...read, clarify: "   " }).clarify).toBeUndefined();
        expect(normalizeBrief("x", { ...read, clarify: "Live pitch?" }).clarify).toBe(
            "Live pitch?",
        );
    });

    it("leaves mustInclude undefined when the model returned nothing usable", () => {
        expect(
            normalizeBrief("x", { ...read, mustInclude: ["", "  "] }).mustInclude,
        ).toBeUndefined();
    });
});
