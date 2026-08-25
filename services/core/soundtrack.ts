import { and, eq, isNull, ne } from "drizzle-orm";
import type { ArtifactContent, Id } from "@model/artifact";
import type { Soundtrack } from "@model/speech";
import { DEFAULT_PRESET } from "@model/speech";
import { THEMES } from "@themes";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { themeById } from "@services/core/themes";
import {
    clampMs,
    compose,
    DEFAULT_MS,
    MUSIC_MODEL,
    MUSIC_PRESETS,
    bespokePrompt,
    musicHash,
    presetById,
} from "@services/core/ai/music";

// Which bed a piece plays and how it gets made. The audio is a cache keyed by what produced it, so
// picking the same preset twice costs one generation for the whole deployment, ever.

/** Exported for the compose route: it has just built a bed and can answer with it directly. */
export const rowToTrack = (r: typeof schema.soundtracks.$inferSelect, url: string): Soundtrack => ({
    id: r.id,
    source: r.source as Soundtrack["source"],
    ...(r.preset ? { preset: r.preset } : {}),
    prompt: r.prompt,
    ms: r.ms,
    url,
});

/** The catalog the picker shows: every preset, and whether this deployment has built it yet. */
export async function presets(): Promise<
    { id: string; name: string; description: string; ready: boolean }[]
> {
    const built = await db
        .select({ preset: schema.soundtracks.preset })
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.source, "preset"));
    const have = new Set(built.map((b) => b.preset));
    return MUSIC_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        ready: have.has(p.id),
    }));
}

/**
 * A preset's bed, generated on first use and shared by every workspace after. The first person to
 * pick "Calm" anywhere on the deployment pays for it and nobody pays again.
 */
export async function ensurePreset(
    presetId: string,
    fetchFn?: typeof fetch,
): Promise<{ row: typeof schema.soundtracks.$inferSelect; chars: number }> {
    const preset = presetById(presetId);
    if (!preset) throw new Error(`no such preset: ${presetId}`);
    const [held] = await db
        .select()
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.preset, preset.id));
    if (held) return { row: held, chars: 0 };

    const out = await compose(preset.prompt, DEFAULT_MS, fetchFn);
    const [row] = await db
        .insert(schema.soundtracks)
        .values({
            source: "preset",
            preset: preset.id,
            prompt: preset.prompt,
            hash: musicHash(preset.prompt, out.ms, MUSIC_MODEL),
            modelId: MUSIC_MODEL,
            mime: out.mime,
            data: out.audio.toString("base64"),
            bytes: out.audio.byteLength,
            ms: out.ms,
        })
        // two people picking the same preset at once race only on the insert
        .onConflictDoNothing({ target: schema.soundtracks.preset })
        .returning();
    if (row) return { row, chars: out.ms };
    const [raced] = await db
        .select()
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.preset, preset.id));
    if (!raced) throw new Error("the bed could not be saved");
    return { row: raced, chars: 0 };
}

/**
 * What the piece says about itself, which is all a custom bed's prompt is written from: the theme's
 * mood or descriptor, whether it is dark, and the title.
 */
interface SelfDescription {
    theme: { mood?: string | null; tag?: string; isDark?: boolean };
    title?: string;
}

export async function selfDescription(artifactId: string): Promise<SelfDescription> {
    const [row] = await db
        .select({ title: schema.artifacts.title, themeId: schema.artifacts.themeId })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId));
    if (!row) return { theme: {} };
    const custom = await themeById(row.themeId);
    const builtIn = THEMES[row.themeId];
    return {
        ...(row.title ? { title: row.title } : {}),
        theme: custom
            ? { mood: custom.mood, isDark: custom.isDark }
            : builtIn
              ? { tag: builtIn.tag, isDark: builtIn.dark }
              : { tag: row.themeId },
    };
}

/**
 * A bed written for one artifact from what the piece says about itself. `lengthMs` is the narration's
 * total when there is one, so a narrated piece gets a bed that runs exactly as long as the voice and
 * never has to loop.
 */
export async function composeForArtifact(
    artifactId: string,
    content: ArtifactContent,
    lengthMs: number,
    fetchFn?: typeof fetch,
): Promise<{ row: typeof schema.soundtracks.$inferSelect; ms: number }> {
    const { theme, title } = await selfDescription(artifactId);
    const prompt = bespokePrompt(content, theme, title);
    const ms = clampMs(lengthMs || DEFAULT_MS);
    const hash = musicHash(prompt, ms, MUSIC_MODEL);

    const [held] = await db
        .select()
        .from(schema.soundtracks)
        .where(
            and(eq(schema.soundtracks.artifactId, artifactId), eq(schema.soundtracks.hash, hash)),
        );
    if (held) return { row: held, ms: 0 };

    const out = await compose(prompt, ms, fetchFn);
    const [row] = await db
        .insert(schema.soundtracks)
        .values({
            source: "custom",
            artifactId,
            prompt,
            hash,
            modelId: MUSIC_MODEL,
            mime: out.mime,
            data: out.audio.toString("base64"),
            bytes: out.audio.byteLength,
            ms: out.ms,
        })
        .onConflictDoNothing({
            target: [schema.soundtracks.artifactId, schema.soundtracks.hash],
        })
        .returning();
    const made = row ?? (await byArtifactHash(artifactId, hash));
    if (!made) throw new Error("the bed could not be saved");
    // a superseded bed for the same artifact is dropped: one custom track at a time, like narration
    await db
        .delete(schema.soundtracks)
        .where(
            and(eq(schema.soundtracks.artifactId, artifactId), ne(schema.soundtracks.hash, hash)),
        );
    return { row: made, ms: out.ms };
}

const byArtifactHash = async (
    artifactId: string,
    hash: string,
): Promise<typeof schema.soundtracks.$inferSelect | undefined> => {
    const [row] = await db
        .select()
        .from(schema.soundtracks)
        .where(
            and(eq(schema.soundtracks.artifactId, artifactId), eq(schema.soundtracks.hash, hash)),
        );
    return row;
};

/**
 * The bed this piece should play, if it has one built. Never generates: a read must not spend, and
 * an anonymous viewer of a published link reaches this same function.
 */
export async function soundtrackFor(
    content: ArtifactContent,
    artifactId: string,
    urlFor: (trackId: Id) => string,
): Promise<Soundtrack | null> {
    if (!content.music?.on) return null;
    const wanted = content.music.trackId;
    if (wanted) {
        const [row] = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.id, wanted));
        return row ? rowToTrack(row, urlFor(row.id)) : null;
    }
    // no explicit choice: the default preset, if the deployment has built it
    const [row] = await db
        .select()
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.preset, DEFAULT_PRESET));
    return row ? rowToTrack(row, urlFor(row.id)) : null;
}

/** One bed's bytes. Presets are install-wide, so a custom row is the only one tied to an artifact. */
export async function audioFor(
    trackId: string,
    artifactId: string,
): Promise<{ data: string; mime: string } | null> {
    const [row] = await db
        .select()
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.id, trackId));
    if (!row) return null;
    // a custom bed is only servable through the artifact it belongs to
    if (row.source === "custom" && row.artifactId !== artifactId) return null;
    return { data: row.data, mime: row.mime };
}

/** Custom beds whose artifact is gone are removed by the cascade; presets are never orphaned. */
export const orphanedPresets = async (): Promise<number> => {
    const rows = await db
        .select({ id: schema.soundtracks.id })
        .from(schema.soundtracks)
        .where(and(eq(schema.soundtracks.source, "custom"), isNull(schema.soundtracks.artifactId)));
    return rows.length;
};
