import { describe, expect, it } from "vitest";
import type { TurnEvent } from "@model/ai";
import type { GenMeta } from "@model/artifact";
import { makeContext, type WorkspaceReader } from "@services/core/ai/tools";
import { findArtifactsTool, readArtifactTool } from "@services/core/ai/tools/library";

// The two library tools over a fake reader: what a model is told about a piece a run made.

async function drain<R>(gen: AsyncGenerator<TurnEvent, R>): Promise<R> {
    let step: IteratorResult<TurnEvent, R> = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}

const made: GenMeta = {
    at: "2026-09-06T10:00:00.000Z",
    generationId: "0b6e7c2a-1c1e-4c5a-9f7e-2d3c4b5a6f70",
    models: { outline: "google:gemini-2.5-pro" },
    prompt: "A launch deck for Meridian",
    surface: "deck",
    steer: "keep it under ten sections",
};
const launch = { id: "a1", title: "Launch", format: "deck", generated: true };
const notes = { id: "a2", title: "Notes", format: "doc" };
const content = { format: "deck", theme: "studio", sections: [] };
const workspace: WorkspaceReader = {
    find: async () => [launch, notes],
    read: async (id) =>
        id === launch.id
            ? { ref: launch, content, aiMeta: made }
            : id === notes.id
              ? { ref: notes, content }
              : null,
};
const ctx = makeContext({ image: {}, workspace });

describe("read-artifact", () => {
    it("opens with how a run made the piece and names the generation to expand", async () => {
        const text = await drain(readArtifactTool.run({ id: launch.id }, ctx));
        expect(
            text.startsWith(
                "“Launch” (deck)\n\nMade with AI on 2026-09-06 from the brief: “A launch deck for Meridian”",
            ),
        ).toBe(true);
        expect(text).toContain("Steer: “keep it under ten sections”");
        expect(text).toContain("Models: outline: google:gemini-2.5-pro");
        expect(text).toContain(`Generation ${made.generationId}: pass it to read-generation`);
    });

    it("says nothing about a run for a piece made by hand", async () => {
        const text = await drain(readArtifactTool.run({ id: notes.id }, ctx));
        expect(text).not.toContain("Made with AI");
        expect(text).not.toContain("Generation");
    });
});

describe("find-artifacts", () => {
    it("marks the pieces a run made", async () => {
        const items = await drain(findArtifactsTool.run({}, ctx));
        const note = findArtifactsTool.note?.(items, {});
        expect(note).toContain("“Launch” (deck, made with AI)");
        expect(note).toContain("“Notes” (doc)");
    });
});
