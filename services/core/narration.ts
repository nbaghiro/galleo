import { and, eq, ne, notInArray } from "drizzle-orm";
import type { ArtifactContent, Id, Section } from "@model/artifact";
import type { NarrationManifest, NarrationTrack } from "@model/speech";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { NARRATION_MODEL, narrationHash, speechReady, synthesize } from "@services/core/ai/speech";
import { ensureVoice, fallBackToPremade, voiceFor } from "@services/core/voices";
import { SpeechError } from "@services/core/ai/speech";

// The narration cache: which sections of an artifact have audio, whether it still matches their
// script, and how to build what is missing. Keyed by the text that produced it, so an edit
// invalidates exactly one section and a re-render of an unchanged piece costs nothing.

interface Spoken {
    voice: { id: string; externalId: string; name: string };
    out: Awaited<ReturnType<typeof synthesize>>;
}

/**
 * Speak one script, moving the workspace onto the premade voice if the chosen one turns out to be
 * unusable. A free ElevenLabs account can browse and adopt a library voice and is then refused at
 * synthesis, so the only place that failure surfaces is here. One retry: if the premade voice fails
 * too the problem is the key or the service, and the original message is the useful one.
 */
async function speakWith(
    workspaceId: string,
    voice: { id: string; externalId: string; name: string },
    spoken: string,
    fetchFn?: typeof fetch,
): Promise<Spoken> {
    try {
        return { voice, out: await synthesize(spoken, voice.externalId, fetchFn) };
    } catch (e) {
        const blocked = e instanceof SpeechError && e.status === 503;
        // out of quota, or on a plan that refuses this outright: another voice costs the same and
        // fails the same, so say so once rather than paying to be told twice
        if (!blocked || (e as SpeechError).exhausted) throw e;
        const premade = await fallBackToPremade(workspaceId);
        if (premade.externalId === voice.externalId) throw e;
        return { voice: premade, out: await synthesize(spoken, premade.externalId, fetchFn) };
    }
}

/** The script a voice would read for a section, or "" when there is nothing to say. */
/** Speech is metered by the thousand characters, so a section is at least one unit and never zero. */
export const unitsFor = (chars: number): number => (chars > 0 ? Math.ceil(chars / 1000) : 0);

export const spokenOf = (s: Section): string => s.notes?.spoken.trim() ?? "";

/** Sections worth narrating, in document order. A section with no notes is not one of them. */
export const narratable = (content: ArtifactContent): Section[] =>
    content.sections.filter((s) => spokenOf(s).length > 0);

async function rowsFor(artifactId: string): Promise<(typeof schema.narrations.$inferSelect)[]> {
    return await db
        .select()
        .from(schema.narrations)
        .where(eq(schema.narrations.artifactId, artifactId));
}

/**
 * What the player can play. A section with notes but no current row is `stale`: it dwells rather
 * than being skipped, because someone meant to narrate it and the audio just is not built yet.
 * A section with no notes appears in neither list and is skipped outright, which is what a hero or
 * a footer on a site wants.
 */
export async function manifestFor(
    artifactId: string,
    content: ArtifactContent,
    workspaceId: string,
    urlFor: (sectionId: string, hash: string) => string,
): Promise<NarrationManifest> {
    const voice = await voiceFor(workspaceId, content.voice);
    const rows = await rowsFor(artifactId);
    const byId = new Map(rows.map((r) => [`${r.sectionId}:${r.hash}`, r]));
    const tracks: NarrationTrack[] = [];
    const stale: Id[] = [];
    for (const s of narratable(content)) {
        const spoken = spokenOf(s);
        const hash = voice ? narrationHash(spoken, voice.externalId, NARRATION_MODEL) : "";
        const row = voice ? byId.get(`${s.id}:${hash}`) : undefined;
        if (!row) {
            stale.push(s.id);
            continue;
        }
        tracks.push({
            sectionId: s.id,
            url: urlFor(s.id, hash),
            ms: row.ms,
            spoken,
            ...(row.alignment ? { alignment: row.alignment } : {}),
        });
    }
    return { ...(voice ? { voiceName: voice.name } : {}), tracks, stale, ready: speechReady() };
}

/** One section's audio bytes, by the hash the manifest handed out. */
export async function audioFor(
    artifactId: string,
    sectionId: string,
    hash: string,
): Promise<{ data: string; mime: string } | null> {
    const [row] = await db
        .select({ data: schema.narrations.data, mime: schema.narrations.mime })
        .from(schema.narrations)
        .where(
            and(
                eq(schema.narrations.artifactId, artifactId),
                eq(schema.narrations.sectionId, sectionId),
                eq(schema.narrations.hash, hash),
            ),
        );
    return row ?? null;
}

/**
 * One section's track, synthesized if it is not already cached. This is what makes narration a thing
 * you start rather than a job you commission: the player asks for the section it is about to speak
 * and prefetches the next, so the only wait is the first one.
 *
 * Returns null when the section has nothing to say, which is not a failure: a hero or a footer is
 * skipped rather than dwelt on.
 */
export async function trackFor(
    artifactId: string,
    content: ArtifactContent,
    workspaceId: string,
    sectionId: string,
    urlFor: (sectionId: string, hash: string) => string,
    fetchFn?: typeof fetch,
): Promise<{ track: NarrationTrack; chars: number } | null> {
    const section = content.sections.find((s) => s.id === sectionId);
    const spoken = section ? spokenOf(section) : "";
    if (!spoken) return null;

    const voice = await ensureVoice(workspaceId, content.voice, fetchFn);
    if (!voice) throw new Error("No narration voice is available for this workspace.");
    const hash = narrationHash(spoken, voice.externalId, NARRATION_MODEL);

    const [cached] = await db
        .select()
        .from(schema.narrations)
        .where(
            and(
                eq(schema.narrations.artifactId, artifactId),
                eq(schema.narrations.sectionId, sectionId),
                eq(schema.narrations.hash, hash),
            ),
        );
    if (cached)
        return {
            chars: 0,
            track: {
                sectionId,
                url: urlFor(sectionId, hash),
                ms: cached.ms,
                spoken,
                ...(cached.alignment ? { alignment: cached.alignment } : {}),
            },
        };

    const spokenBy = await speakWith(workspaceId, voice, spoken, fetchFn);
    const out = spokenBy.out;
    // the fallback may have swapped the voice, and the key must describe what is stored
    const finalHash = narrationHash(spoken, spokenBy.voice.externalId, NARRATION_MODEL);
    await db
        .insert(schema.narrations)
        .values({
            artifactId,
            sectionId,
            hash: finalHash,
            voiceId: spokenBy.voice.externalId,
            modelId: NARRATION_MODEL,
            mime: out.mime,
            data: out.audio.toString("base64"),
            bytes: out.audio.byteLength,
            ms: out.ms,
            alignment: out.alignment,
            chars: out.chars,
        })
        .onConflictDoNothing({
            target: [
                schema.narrations.artifactId,
                schema.narrations.sectionId,
                schema.narrations.hash,
            ],
        });
    await dropSuperseded(artifactId, sectionId, finalHash);
    return {
        chars: out.chars,
        track: {
            sectionId,
            url: urlFor(sectionId, finalHash),
            ms: out.ms,
            spoken,
            ...(out.alignment ? { alignment: out.alignment } : {}),
        },
    };
}

export interface PrepareEvent {
    sectionId: string;
    ms: number;
    cached: boolean;
    chars: number;
}

/**
 * Build whatever is missing, section by section, yielding as each lands so the client can show
 * progress on a run that takes most of a minute. A cached section yields immediately and costs
 * nothing. Superseded rows for the same section are dropped once the new one is in, so switching a
 * voice back and forth pays once rather than twice.
 */
export async function* prepare(
    artifactId: string,
    content: ArtifactContent,
    workspaceId: string,
    sectionIds: readonly string[] | undefined,
    fetchFn?: typeof fetch,
): AsyncGenerator<PrepareEvent, void> {
    // adopts a default on first use, so narration works before anyone opens settings
    const voice = await ensureVoice(workspaceId, content.voice, fetchFn);
    if (!voice)
        throw new Error(
            "No narration voice could be found. Add one in workspace settings and try again.",
        );
    // a section deleted since the last run leaves audio nothing points at; this is the one path that
    // already walks the whole piece, so it is where the sweep belongs
    await pruneOrphans(artifactId, content);
    const wanted = sectionIds?.length ? new Set(sectionIds) : null;
    const rows = await rowsFor(artifactId);
    const have = new Set(rows.map((r) => `${r.sectionId}:${r.hash}`));

    for (const section of narratable(content)) {
        if (wanted && !wanted.has(section.id)) continue;
        const spoken = spokenOf(section);
        const hash = narrationHash(spoken, voice.externalId, NARRATION_MODEL);
        if (have.has(`${section.id}:${hash}`)) {
            const row = rows.find((r) => r.sectionId === section.id && r.hash === hash)!;
            yield { sectionId: section.id, ms: row.ms, cached: true, chars: 0 };
            continue;
        }
        const spokenBy = await speakWith(workspaceId, voice, spoken, fetchFn);
        const out = spokenBy.out;
        const finalHash = narrationHash(spoken, spokenBy.voice.externalId, NARRATION_MODEL);
        await db
            .insert(schema.narrations)
            .values({
                artifactId,
                sectionId: section.id,
                hash: finalHash,
                voiceId: spokenBy.voice.externalId,
                modelId: NARRATION_MODEL,
                mime: out.mime,
                data: out.audio.toString("base64"),
                bytes: out.audio.byteLength,
                ms: out.ms,
                alignment: out.alignment,
                chars: out.chars,
            })
            .onConflictDoNothing({
                target: [
                    schema.narrations.artifactId,
                    schema.narrations.sectionId,
                    schema.narrations.hash,
                ],
            });
        await dropSuperseded(artifactId, section.id, finalHash);
        yield { sectionId: section.id, ms: out.ms, cached: false, chars: out.chars };
    }
}

const dropSuperseded = async (
    artifactId: string,
    sectionId: string,
    keep: string,
): Promise<void> => {
    await db
        .delete(schema.narrations)
        .where(
            and(
                eq(schema.narrations.artifactId, artifactId),
                eq(schema.narrations.sectionId, sectionId),
                ne(schema.narrations.hash, keep),
            ),
        );
};

/** Audio for sections the content no longer has, e.g. one that was deleted after it was narrated. */
export async function pruneOrphans(artifactId: string, content: ArtifactContent): Promise<number> {
    const live = content.sections.map((s) => s.id);
    // notInArray over an empty list is not valid SQL, and an artifact with no sections orphans
    // everything anyway, so that case deletes by artifact alone
    const where = live.length
        ? and(
              eq(schema.narrations.artifactId, artifactId),
              notInArray(schema.narrations.sectionId, live),
          )
        : eq(schema.narrations.artifactId, artifactId);
    const gone = await db
        .delete(schema.narrations)
        .where(where)
        .returning({ id: schema.narrations.id });
    return gone.length;
}
