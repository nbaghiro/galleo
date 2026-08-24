import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { Section } from "@model/artifact";
import { needsScript } from "@model/artifact";
import { setSectionNotes } from "@elements/ops";
import { capture } from "@ui/analytics";
import { commit, editor, getWriteNotes } from "./store";

// Speaker notes as the editor produces them. The wire shape and the storage rules live in
// @model/artifact; this is writing them, on demand for one section or in a pass over the piece.

/** Blank cues are kept while editing (a cleared input is still a row), so both fields are checked. */
export const hasNotes = (s: Section): boolean =>
    !!s.notes && (s.notes.spoken.trim().length > 0 || (s.notes.cues ?? []).some((c) => c.trim()));

/** The script a voice would read, or "" when there is nothing to say. */
export const spokenOf = (s: Section): string => s.notes?.spoken.trim() ?? "";

export const notesCoverage = (sections: readonly Section[]): number =>
    sections.reduce((n, s) => n + (hasNotes(s) ? 1 : 0), 0);

/**
 * Write one section's script, now, because a voice is about to read it. The whole piece still goes
 * to the model for continuity; only this section comes back, which is what makes the first press
 * cost one section's wait instead of the whole deck's.
 *
 * Returns whether there is now something to say: a section the model declines to script (a hero, a
 * divider) comes back false and the player skips it, the same as an unscripted one always was.
 */
export async function scriptSection(sectionId: string, signal?: AbortSignal): Promise<boolean> {
    const run = getWriteNotes();
    const section = editor.artifact.sections.find((s) => s.id === sectionId);
    if (!section) return false;
    if (!needsScript(section)) return spokenOf(section).length > 0;
    if (!run) return spokenOf(section).length > 0;

    let wrote = false;
    await run(
        editor.artifact,
        [sectionId],
        (note) => {
            wrote = true;
            // over the artifact as it stands, so a note landing late never reverts a live edit
            commit(setSectionNotes(editor.artifact, note.sectionId, note.notes), {
                coalesce: "notes:ai",
            });
        },
        signal,
    );
    return wrote;
}

/**
 * Everything still unscripted, in one pass, after the first section is already being spoken. The
 * per-section call ahead of it buys latency; this buys continuity, since the model writing eighteen
 * sections together can carry a thread between them that eighteen separate calls cannot.
 *
 * Deliberately not awaited by the player: it runs behind the voice and each note commits as it
 * lands, so a section reached before its note arrives simply gets scripted on demand instead.
 */
export async function scriptRest(skip: string, signal?: AbortSignal): Promise<void> {
    const run = getWriteNotes();
    if (!run) return;
    const rest = editor.artifact.sections
        .filter((s) => s.id !== skip && needsScript(s))
        .map((s) => s.id);
    if (!rest.length) return;
    await run(
        editor.artifact,
        rest,
        (note) => {
            // a section the voice already reached has a script now; leave it rather than
            // invalidating audio that is playing
            const at = editor.artifact.sections.find((s) => s.id === note.sectionId);
            if (!at || !needsScript(at)) return;
            commit(setSectionNotes(editor.artifact, note.sectionId, note.notes), {
                coalesce: "notes:ai",
            });
        },
        signal,
    );
}

export interface NotesRunner {
    /** Non-null while a write is running: "one" for this section, "all" for the piece. */
    writing: Accessor<"one" | "all" | null>;
    error: Accessor<string | null>;
    /** How many sections have something to say, which is what narration would record. */
    covered: Accessor<number>;
    canWrite: Accessor<boolean>;
    writeWithAi(scope: "one" | "all", sectionId?: string): Promise<void>;
}

/**
 * The two AI actions on speaker notes, shared by the editor panel and the present overlay so the
 * same run cannot behave differently depending on where it was started from. One in flight at a
 * time: both write the same sections, and letting them race would interleave two sets of notes.
 */
export function createNotesRunner(): NotesRunner {
    const [writing, setWriting] = createSignal<"one" | "all" | null>(null);
    const [error, setError] = createSignal<string | null>(null);
    let abort: AbortController | undefined;
    onCleanup(() => abort?.abort());

    const covered = (): number => notesCoverage(editor.artifact.sections);
    const busy = (): boolean => !!writing();

    const start = (): AbortSignal => {
        abort?.abort();
        abort = new AbortController();
        setError(null);
        return abort.signal;
    };
    const failed = (e: unknown, fallback: string): void => {
        if (!abort?.signal.aborted) setError(e instanceof Error ? e.message : fallback);
    };

    return {
        writing,
        error,
        covered,
        canWrite: () => !!getWriteNotes(),

        // Each note commits over the artifact as it stands, so one arriving late never reverts an
        // edit made while the run was going.
        async writeWithAi(scope, sectionId) {
            const run = getWriteNotes();
            if (!run || busy() || (scope === "one" && !sectionId)) return;
            const signal = start();
            setWriting(scope);
            const before = covered();
            let written = 0;
            try {
                await run(
                    editor.artifact,
                    scope === "one" ? [sectionId!] : undefined,
                    (note) => {
                        written++;
                        commit(setSectionNotes(editor.artifact, note.sectionId, note.notes), {
                            coalesce: "notes:ai",
                        });
                    },
                    signal,
                );
                capture("notes_written", {
                    where: "panel",
                    section_count: written,
                    regenerated: before > 0,
                });
            } catch (e) {
                failed(e, "The notes could not be written.");
            } finally {
                setWriting(null);
            }
        },
    };
}
