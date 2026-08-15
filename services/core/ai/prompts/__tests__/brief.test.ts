import { describe, it, expect } from "vitest";
import { briefParts } from "@services/core/ai/prompts/brief";

describe("briefParts", () => {
    it("carries the raw prompt and ends with the draft instruction", () => {
        const out = briefParts("A launch deck for Meridian");
        expect(out.prompt).toContain("A launch deck for Meridian");
        expect(out.prompt.trimEnd().endsWith("Draft the brief now.")).toBe(true);
    });
    it("teaches infer-don't-interrogate and the one-question ceiling", () => {
        const { system } = briefParts("x");
        expect(system).toContain("Infer, don't interrogate");
        expect(system).toContain("ONE clarifying question");
    });
    it("names the surface only when given", () => {
        expect(briefParts("x", "web").prompt).toContain("built as a web");
        expect(briefParts("x").prompt).not.toContain("built as a");
    });
});

describe("briefParts · re-read", () => {
    const previous = {
        goal: "Explain how stablecoins improve cross-border payments",
        audience: "Financial institutions",
        tone: "Informative, analytical",
        mustInclude: ["Regulatory considerations", "Use cases"],
    };

    it("shows the previous reading and rules it out", () => {
        const out = briefParts("A stablecoin whitepaper", "doc", previous);
        expect(out.prompt).toContain("don't repeat it");
        expect(out.prompt).toContain(previous.goal);
        expect(out.prompt).toContain("Regulatory considerations");
        expect(out.prompt).toContain("genuinely DIFFERENT reading");
    });

    it("says nothing about a previous reading on a first read", () => {
        const out = briefParts("A stablecoin whitepaper", "doc");
        expect(out.prompt).not.toContain("don't repeat it");
        expect(out.prompt.trimEnd().endsWith("Draft the brief now.")).toBe(true);
    });
});
