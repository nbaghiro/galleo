import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { collectNotes, toNotes } from "@services/core/ai/tools/notes";
import { speakerNotesParts } from "@services/core/ai/prompts/notes";

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
const sec = (id: string, body: string, notes?: Section["notes"]): Section => ({
    id,
    root: { type: "container", data: { children: [text(body)] } },
    ...(notes ? { notes } : {}),
});
const doc = (format: string, ...sections: Section[]): ArtifactContent => ({
    format,
    theme: "studio",
    sections,
});

describe("toNotes", () => {
    it("keeps the script and marks it as the model's work", () => {
        expect(toNotes("Say the thing.", [])).toEqual({
            spoken: "Say the thing.",
            source: "ai",
        });
    });

    it("moves a bracketed stage direction out of the script and into the cues", () => {
        const n = toNotes("Open with the number.\n(pause for effect)\nThen the ask.", []);
        expect(n.spoken).toBe("Open with the number.\nThen the ask.");
        expect(n.cues).toEqual(["pause for effect"]);
    });

    it("handles square brackets the same way, and keeps the model's own cues first", () => {
        const n = toNotes("Line one.\n[slow down]", ["watch the clock"]);
        expect(n.spoken).toBe("Line one.");
        expect(n.cues).toEqual(["watch the clock", "slow down"]);
    });

    it("leaves a parenthetical inside a sentence alone, since that is speech", () => {
        const n = toNotes("Revenue (before costs) doubled.", []);
        expect(n.spoken).toBe("Revenue (before costs) doubled.");
        expect(n.cues).toBeUndefined();
    });

    it("caps the cues at three and omits the key when there are none", () => {
        expect(toNotes("x", ["a", "b", "c", "d"]).cues).toEqual(["a", "b", "c"]);
        expect(toNotes("x", ["", "  "])).not.toHaveProperty("cues");
    });

    it("collapses the blank run a removed direction leaves behind", () => {
        expect(toNotes("One.\n\n(beat)\n\nTwo.", []).spoken).toBe("One.\n\nTwo.");
    });
});

describe("collectNotes", () => {
    const sec = (id: string, text: string): Section => ({
        id,
        root: { type: "text", data: { text } },
    });
    const order = [sec("s1", "one"), sec("s2", "two"), sec("s3", "three")];

    it("returns document order regardless of the order the model answered in", () => {
        const got = collectNotes(
            [
                { sectionId: "s3", spoken: "third" },
                { sectionId: "s1", spoken: "first" },
                { sectionId: "s2", spoken: "second" },
            ],
            ["s1", "s2", "s3"],
            order,
        );
        expect(got.map((n) => n.sectionId)).toEqual(["s1", "s2", "s3"]);
    });

    it("drops a section that was never asked for", () => {
        const got = collectNotes(
            [
                { sectionId: "s1", spoken: "asked" },
                { sectionId: "s9", spoken: "invented" },
            ],
            ["s1"],
            order,
        );
        expect(got.map((n) => n.sectionId)).toEqual(["s1"]);
    });

    it("keeps the first answer when the model names one section twice", () => {
        const got = collectNotes(
            [
                { sectionId: "s1", spoken: "first answer" },
                { sectionId: "s1", spoken: "second answer" },
            ],
            ["s1"],
            order,
        );
        expect(got).toHaveLength(1);
        expect(got[0]?.notes.spoken).toBe("first answer");
    });

    it("drops an empty script rather than storing a blank note", () => {
        expect(collectNotes([{ sectionId: "s1", spoken: "   " }], ["s1"], order)).toEqual([]);
        expect(collectNotes([{ sectionId: "s1" }], ["s1"], order)).toEqual([]);
    });
});

describe("speakerNotesParts", () => {
    const content = doc("deck", sec("s1", "The opening claim"), sec("s2", "The proof"));

    it("names every section with its id, so the model can address its answers", () => {
        const { prompt } = speakerNotesParts(content, ["s1", "s2"]);
        expect(prompt).toContain("[s1] The opening claim");
        expect(prompt).toContain("[s2] The proof");
        expect(prompt).toContain("Write notes for these sections");
    });

    it("tells the model the format, since a slide and a page are said differently", () => {
        expect(speakerNotesParts(content, ["s1"]).system).toContain("This is a deck");
        expect(speakerNotesParts(doc("web", sec("s1", "hero")), ["s1"]).system).toContain(
            "web page",
        );
        expect(speakerNotesParts(doc("doc", sec("s1", "intro")), ["s1"]).system).toContain(
            "written document",
        );
    });

    it("shows the whole piece even when only one section is being written", () => {
        const { prompt } = speakerNotesParts(content, ["s2"]);
        expect(prompt).toContain("The opening claim"); // context
        expect(prompt).toContain("write notes only for the sections named below");
        expect(prompt).toContain("Write notes for these sections\n[s2]");
    });

    it("passes the notes already written elsewhere, so a partial rewrite joins up", () => {
        const partly = doc(
            "deck",
            sec("s1", "The opening claim", { spoken: "already said this" }),
            sec("s2", "The proof"),
        );
        const { prompt } = speakerNotesParts(partly, ["s2"]);
        expect(prompt).toContain("Notes already written for other sections");
        expect(prompt).toContain("already said this");
    });

    it("does not echo back the notes of a section it is about to rewrite", () => {
        const partly = doc("deck", sec("s1", "The opening claim", { spoken: "stale draft" }));
        const { prompt } = speakerNotesParts(partly, ["s1"]);
        expect(prompt).not.toContain("stale draft");
    });

    it("carries the author's guidance when there is some", () => {
        const { prompt } = speakerNotesParts(content, ["s1"], "keep it under 20 seconds");
        expect(prompt).toContain("keep it under 20 seconds");
    });
});
