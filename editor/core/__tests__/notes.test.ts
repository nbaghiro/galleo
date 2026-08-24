import { describe, expect, it } from "vitest";
import type { Section } from "@model/artifact";
import { hasNotes, notesCoverage, spokenOf } from "@editor/core/notes";

const sec = (id: string, notes?: Section["notes"]): Section => ({
    id,
    root: { type: "text", data: { text: id } },
    ...(notes ? { notes } : {}),
});

describe("hasNotes", () => {
    it("is false for no notes, a blank script, and blank cues", () => {
        expect(hasNotes(sec("a"))).toBe(false);
        expect(hasNotes(sec("a", { spoken: "   " }))).toBe(false);
        expect(hasNotes(sec("a", { spoken: "", cues: ["", "  "] }))).toBe(false);
    });
    it("is true when either the script or a cue carries something", () => {
        expect(hasNotes(sec("a", { spoken: "say this" }))).toBe(true);
        expect(hasNotes(sec("a", { spoken: "", cues: ["pause"] }))).toBe(true);
    });
});

describe("spokenOf", () => {
    it("trims, and is empty when there is nothing to say", () => {
        expect(spokenOf(sec("a", { spoken: "  say this  " }))).toBe("say this");
        expect(spokenOf(sec("a"))).toBe("");
    });
});

describe("notesCoverage", () => {
    it("counts only sections that carry something", () => {
        expect(
            notesCoverage([sec("a", { spoken: "one" }), sec("b"), sec("c", { spoken: "  " })]),
        ).toBe(1);
    });
});
