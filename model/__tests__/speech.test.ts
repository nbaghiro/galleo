import { describe, expect, it } from "vitest";
import type { SpeechAlignment } from "@model/speech";
import { designedName, wordAt, wordSpans } from "@model/speech";

const align = (text: string, per = 0.1): SpeechAlignment => ({
    characters: [...text],
    starts: [...text].map((_, i) => i * per),
    ends: [...text].map((_, i) => (i + 1) * per),
});

describe("wordSpans", () => {
    it("folds characters into words, which is what a caption can follow", () => {
        const spans = wordSpans(align("hi you"));
        expect(spans.map((s) => s.text)).toEqual(["hi", "you"]);
    });

    it("gives each word the start of its first character and the end of its last", () => {
        const spans = wordSpans(align("hi you"));
        expect(spans[0]).toEqual({ text: "hi", start: 0, end: 0.2 });
        expect(spans[1]?.start).toBeCloseTo(0.3);
        expect(spans[1]?.end).toBeCloseTo(0.6);
    });

    it("keeps punctuation attached to its word rather than making one of its own", () => {
        expect(wordSpans(align("hi, you.")).map((s) => s.text)).toEqual(["hi,", "you."]);
    });

    it("collapses a run of whitespace instead of emitting empty words", () => {
        expect(wordSpans(align("a   b")).map((s) => s.text)).toEqual(["a", "b"]);
    });

    it("handles a newline as a separator, since a script can be several lines", () => {
        expect(wordSpans(align("one\ntwo")).map((s) => s.text)).toEqual(["one", "two"]);
    });

    it("is empty for no alignment, so a track without one simply has no highlight", () => {
        expect(wordSpans(undefined)).toEqual([]);
        expect(wordSpans({ characters: [], starts: [], ends: [] })).toEqual([]);
    });
});

describe("wordAt", () => {
    const spans = wordSpans(align("hi you"));

    it("finds the word being spoken", () => {
        expect(wordAt(spans, 0.05)).toBe(0);
        expect(wordAt(spans, 0.45)).toBe(1);
    });

    it("is -1 before the first word and after the last, so nothing is highlighted", () => {
        expect(wordAt(wordSpans(align("hi", 1)), -1)).toBe(-1);
        expect(wordAt(spans, 99)).toBe(-1);
    });

    it("is -1 in the gap between words rather than holding the previous one", () => {
        expect(wordAt(spans, 0.25)).toBe(-1);
    });

    it("is -1 for an empty span list", () => {
        expect(wordAt([], 0)).toBe(-1);
    });
});

describe("designedName", () => {
    it("takes a short name from the first few words of the description", () => {
        expect(designedName("a warm unhurried british narrator")).toBe("A warm unhurried");
    });

    it("strips punctuation, since this becomes a display name", () => {
        expect(designedName("calm, low-pitched, steady")).toBe("Calm lowpitched steady");
    });

    it("falls back rather than producing an empty name", () => {
        expect(designedName("   ")).toBe("New voice");
        expect(designedName("!!! ???")).toBe("New voice");
    });
});
