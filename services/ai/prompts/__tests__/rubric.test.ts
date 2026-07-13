import { describe, it, expect } from "vitest";
import { RUBRIC, VOICE, lengthGuidance } from "../rubric";

describe("RUBRIC / VOICE", () => {
    it("are two distinct, non-empty guidance blocks", () => {
        expect(RUBRIC).toContain("quality bar");
        expect(VOICE).toContain("Voice");
        expect(RUBRIC).not.toBe(VOICE);
    });
});

describe("lengthGuidance", () => {
    it("always states the size-to-the-story baseline", () => {
        expect(lengthGuidance(undefined)).toContain(
            "Let the topic decide how many sections it needs.",
        );
    });
    it("leans shorter for a short* length (case-insensitive prefix)", () => {
        expect(lengthGuidance("short")).toContain("lean toward the shorter end");
        expect(lengthGuidance("Short and tight")).toContain("lean toward the shorter end");
        expect(lengthGuidance("SHORTEST")).toContain("lean toward the shorter end");
    });
    it("leans fuller for in* / deep* / long* lengths", () => {
        expect(lengthGuidance("in-depth")).toContain("lean toward the fuller end");
        expect(lengthGuidance("Deep dive")).toContain("lean toward the fuller end");
        expect(lengthGuidance("long read")).toContain("lean toward the fuller end");
    });
    it("adds neither clause for a neutral length", () => {
        const out = lengthGuidance("standard");
        expect(out).not.toContain("shorter end");
        expect(out).not.toContain("fuller end");
    });
    it("adds neither clause when length is unset", () => {
        const out = lengthGuidance(undefined);
        expect(out).not.toContain("shorter end");
        expect(out).not.toContain("fuller end");
    });
});
