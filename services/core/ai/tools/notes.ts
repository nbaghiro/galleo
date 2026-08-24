import { z } from "zod";
import { generateObject } from "ai";
import type { ArtifactContent, Section, SectionNotes } from "@model/artifact";
import { sectionFingerprint } from "@model/artifact";
import type { ModelTier } from "@model/billing";
import { implement } from "@services/core/ai/tools";
import { modelFor, type ModelOverrides } from "@services/core/models";
import { modelCall } from "@services/core/ai/provider";
import { speakerNotesParts } from "@services/core/ai/prompts/notes";

// One call over the whole piece: continuity between adjacent notes is the craft, so a section is
// never written in isolation. A partial rewrite still sees every other section, and the notes that
// already exist on the ones it is not touching.

const zNotes = z.object({
    notes: z.array(
        z.object({
            sectionId: z.string().describe("the [id] of the section these notes belong to"),
            spoken: z
                .string()
                .describe("what the presenter says out loud over this section, 2-5 sentences"),
            cues: z
                .array(z.string())
                .max(3)
                .optional()
                .describe("private reminders for the presenter; usually none"),
        }),
    ),
});

export interface WrittenNotes {
    sectionId: string;
    notes: SectionNotes;
}

interface NotesOpts {
    tier?: ModelTier;
    models?: ModelOverrides;
    guidance?: string;
    signal?: AbortSignal;
}

/** A stage direction that reached the script anyway is a cue in the wrong field, so it moves. */
const STAGE_DIRECTION = /^\s*[([](.{0,60}?)[)\]]\s*$/;

/** Exported for its tests: the model's two fields, cleaned into the shape the row stores. */
export function toNotes(spoken: string, cues: readonly string[]): SectionNotes {
    const kept: string[] = [];
    const moved: string[] = [];
    for (const line of spoken.split("\n")) {
        const aside = STAGE_DIRECTION.exec(line);
        if (aside?.[1]) moved.push(aside[1].trim());
        else kept.push(line);
    }
    const all = [...cues, ...moved].map((c) => c.trim()).filter(Boolean);
    return {
        spoken: kept
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
        ...(all.length ? { cues: all.slice(0, 3) } : {}),
        source: "ai",
    };
}

export interface ModelNote {
    sectionId: string;
    spoken?: string;
    cues?: string[];
}

/**
 * Exported for its tests. The model answers with a list it chose the order of and the ids for, so
 * this drops anything that was not asked for, keeps the first answer per section, and returns the
 * rest in document order: a client applying them in stream order must not reorder the piece.
 */
export function collectNotes(
    rows: readonly ModelNote[],
    targets: readonly string[],
    sections: readonly Section[],
): WrittenNotes[] {
    const wanted = new Set(targets);
    const by = new Map(sections.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const out: WrittenNotes[] = [];
    for (const row of rows) {
        const spoken = row.spoken?.trim();
        if (!spoken || !wanted.has(row.sectionId) || seen.has(row.sectionId)) continue;
        seen.add(row.sectionId);
        const section = by.get(row.sectionId);
        const notes = toNotes(spoken, row.cues ?? []);
        out.push({
            sectionId: row.sectionId,
            // stamped against what the model was shown, so a later edit to this section is
            // detectable as drift rather than silently narrated from an old script
            notes: section ? { ...notes, of: sectionFingerprint(section) } : notes,
        });
    }
    const at = new Map(sections.map((s, i) => [s.id, i]));
    return out.sort((a, b) => (at.get(a.sectionId) ?? 0) - (at.get(b.sectionId) ?? 0));
}

export async function writeSpeakerNotes(
    content: ArtifactContent,
    sectionIds: readonly string[] | undefined,
    opts: NotesOpts = {},
): Promise<WrittenNotes[]> {
    const known = new Set(content.sections.map((s) => s.id));
    // an unknown id from the agent is dropped rather than failing the run; absent means the lot
    const targets = (sectionIds?.filter((id) => known.has(id)) ?? [...known]) as string[];
    if (!targets.length) return [];

    const parts = speakerNotesParts(content, targets, opts.guidance);
    const modelId = modelFor("section", opts.tier, opts.models);
    const { object } = await generateObject({
        ...modelCall(modelId, 0.7),
        schema: zNotes,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });

    return collectNotes(object.notes, targets, content.sections);
}

export const writeSpeakerNotesTool = implement("write-speaker-notes", async function* (input, ctx) {
    if (!ctx.artifact) throw new Error("There is no open artifact to write notes for.");
    return await writeSpeakerNotes(ctx.artifact, input.sectionIds, {
        tier: ctx.tier,
        models: ctx.models,
        signal: ctx.signal,
    });
});
