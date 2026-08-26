import { and, eq, isNull, ne } from "drizzle-orm";
import type { ArtifactContent, Id } from "@model/artifact";
import type { Soundtrack, WorkspaceBed } from "@model/speech";
import { DEFAULT_PRESET } from "@model/speech";
import { THEMES } from "@themes";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { themeById } from "@services/core/themes";
import {
    BED_RULES,
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

/**
 * Whether a bed was written for this piece. The other way to be allowed to play one is to have it on
 * the workspace's shelf, which the caller checks separately: a bed composed for one artifact is
 * never shelved, so shelf membership alone would refuse a piece its own music.
 */
export async function bedBelongsTo(bedId: string, artifactId: string): Promise<boolean> {
    const [row] = await db
        .select({ source: schema.soundtracks.source, artifactId: schema.soundtracks.artifactId })
        .from(schema.soundtracks)
        .where(eq(schema.soundtracks.id, bedId));
    return row?.source === "custom" && row.artifactId === artifactId;
}

/** One bed's bytes. Presets are install-wide, so a custom row is the only one tied to an artifact. */
export async function audioFor(
    trackId: string,
    // absent for a shelf bed, which belongs to a workspace rather than to a piece; a custom bed is
    // then refused, since the artifact it belongs to cannot match "no artifact"
    artifactId?: string,
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

// ---- The workspace's shelf -------------------------------------------------------------------
//
// The same shape the voice shelf has, for the same reason: a house preset belongs to the whole
// deployment, so what one workspace did with it (named it, made it the default) is a fact about the
// pairing rather than about the bed.

export class BedError extends Error {
    constructor(
        message: string,
        readonly status: 402 | 404 | 502 | 503,
    ) {
        super(message);
    }
}

/** What a shelved bed is called: the workspace's own name for it, else what it is. */
const bedName = (row: typeof schema.soundtracks.$inferSelect, renamed: string | null): string => {
    if (renamed?.trim()) return renamed.trim();
    const preset = row.preset ? presetById(row.preset) : undefined;
    if (preset) return preset.name;
    return row.prompt.slice(0, 60);
};

export async function shelfFor(
    workspaceId: string,
    urlFor: (id: Id) => string,
): Promise<WorkspaceBed[]> {
    const rows = await db
        .select({ bed: schema.soundtracks, link: schema.workspaceSoundtracks })
        .from(schema.workspaceSoundtracks)
        .innerJoin(
            schema.soundtracks,
            eq(schema.soundtracks.id, schema.workspaceSoundtracks.soundtrackId),
        )
        .where(eq(schema.workspaceSoundtracks.workspaceId, workspaceId));
    return rows
        .map(({ bed, link }) => ({
            ...rowToTrack(bed, urlFor(bed.id)),
            name: bedName(bed, link.name),
            isDefault: link.isDefault,
        }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

const clearDefault = async (workspaceId: string): Promise<void> => {
    await db
        .update(schema.workspaceSoundtracks)
        .set({ isDefault: false })
        .where(
            and(
                eq(schema.workspaceSoundtracks.workspaceId, workspaceId),
                eq(schema.workspaceSoundtracks.isDefault, true),
            ),
        );
};

/** The first bed on an empty shelf becomes the default, so a workspace is never left without one. */
export async function shelve(
    workspaceId: string,
    soundtrackId: string,
    opts: { name?: string; makeDefault?: boolean } = {},
): Promise<void> {
    const held = await db
        .select({ id: schema.workspaceSoundtracks.soundtrackId })
        .from(schema.workspaceSoundtracks)
        .where(eq(schema.workspaceSoundtracks.workspaceId, workspaceId));
    const asDefault = opts.makeDefault || held.length === 0;
    if (asDefault) await clearDefault(workspaceId);
    await db
        .insert(schema.workspaceSoundtracks)
        .values({ workspaceId, soundtrackId, name: opts.name, isDefault: asDefault })
        .onConflictDoUpdate({
            target: [
                schema.workspaceSoundtracks.workspaceId,
                schema.workspaceSoundtracks.soundtrackId,
            ],
            set: { ...(opts.name ? { name: opts.name } : {}), isDefault: asDefault },
        });
}

export async function renameShelved(
    workspaceId: string,
    soundtrackId: string,
    name: string,
): Promise<void> {
    await db
        .update(schema.workspaceSoundtracks)
        .set({ name })
        .where(
            and(
                eq(schema.workspaceSoundtracks.workspaceId, workspaceId),
                eq(schema.workspaceSoundtracks.soundtrackId, soundtrackId),
            ),
        );
}

export async function makeDefault(workspaceId: string, soundtrackId: string): Promise<void> {
    await clearDefault(workspaceId);
    await db
        .update(schema.workspaceSoundtracks)
        .set({ isDefault: true })
        .where(
            and(
                eq(schema.workspaceSoundtracks.workspaceId, workspaceId),
                eq(schema.workspaceSoundtracks.soundtrackId, soundtrackId),
            ),
        );
}

/**
 * Take a bed off the shelf. Unlike a voice, a workspace may keep none: a piece with no bed simply
 * plays no music, where a piece with no voice cannot be narrated at all. Removing the default
 * promotes whatever is left rather than leaving a shelf that has beds but no default.
 */
export async function unshelve(workspaceId: string, soundtrackId: string): Promise<void> {
    const held = await db
        .select({
            id: schema.workspaceSoundtracks.soundtrackId,
            isDefault: schema.workspaceSoundtracks.isDefault,
        })
        .from(schema.workspaceSoundtracks)
        .where(eq(schema.workspaceSoundtracks.workspaceId, workspaceId));
    const row = held.find((h) => h.id === soundtrackId);
    if (!row) return;
    await db
        .delete(schema.workspaceSoundtracks)
        .where(
            and(
                eq(schema.workspaceSoundtracks.workspaceId, workspaceId),
                eq(schema.workspaceSoundtracks.soundtrackId, soundtrackId),
            ),
        );
    // a workspace-composed bed exists only for its shelf, so taking it off is deleting it
    await db
        .delete(schema.soundtracks)
        .where(
            and(
                eq(schema.soundtracks.id, soundtrackId),
                eq(schema.soundtracks.source, "workspace"),
            ),
        );
    if (!row.isDefault) return;
    const next = held.find((h) => h.id !== soundtrackId);
    if (next) await makeDefault(workspaceId, next.id);
}

/**
 * A bed composed from a description someone typed, which is the music half of designing a voice.
 * Shelved on the way out, so the thing they just paid for is theirs to reuse.
 */
export async function composeForWorkspace(
    workspaceId: string,
    description: string,
    fetchFn?: typeof fetch,
): Promise<{ row: typeof schema.soundtracks.$inferSelect; ms: number }> {
    const said = description.trim().slice(0, 400);
    if (!said) throw new BedError("say what it should sound like", 502);
    const prompt = `${said}. ${BED_RULES}`;
    const hash = musicHash(prompt, DEFAULT_MS, MUSIC_MODEL);

    const [held] = await db
        .select()
        .from(schema.soundtracks)
        .where(
            and(eq(schema.soundtracks.workspaceId, workspaceId), eq(schema.soundtracks.hash, hash)),
        );
    if (held) {
        await shelve(workspaceId, held.id, { name: said });
        return { row: held, ms: 0 };
    }

    const out = await compose(prompt, DEFAULT_MS, fetchFn);
    const [row] = await db
        .insert(schema.soundtracks)
        .values({
            source: "workspace",
            workspaceId,
            prompt,
            hash,
            modelId: MUSIC_MODEL,
            mime: out.mime,
            data: out.audio.toString("base64"),
            bytes: out.audio.byteLength,
            ms: out.ms,
        })
        .returning();
    if (!row) throw new BedError("the bed could not be saved", 502);
    await shelve(workspaceId, row.id, { name: said });
    return { row, ms: out.ms };
}

/** The bed this workspace reaches for when a piece names none of its own. */
export async function defaultBed(
    workspaceId: string,
): Promise<typeof schema.soundtracks.$inferSelect | undefined> {
    const [row] = await db
        .select({ bed: schema.soundtracks })
        .from(schema.workspaceSoundtracks)
        .innerJoin(
            schema.soundtracks,
            eq(schema.soundtracks.id, schema.workspaceSoundtracks.soundtrackId),
        )
        .where(
            and(
                eq(schema.workspaceSoundtracks.workspaceId, workspaceId),
                eq(schema.workspaceSoundtracks.isDefault, true),
            ),
        );
    return row?.bed;
}

/**
 * Fill every demo workspace's shelf, the music half of `seedShelf` in core/voices.ts.
 *
 * The presets are install-wide, and the seed never clears the catalog (it deletes a workspace's
 * artifacts and themes, not the beds every workspace shares), so the composing happens once per
 * environment and every reseed after that just re-inserts the shelf rows. Without a music-capable
 * key this is a no-op and the demo simply opens with an empty shelf, exactly as narration does.
 */
export async function seedMusicShelf(
    workspaces: readonly { id: string; music: boolean }[],
    fetchFn: typeof fetch = fetch,
): Promise<number> {
    if (!process.env.ELEVENLABS_API_KEY || !workspaces.length) return 0;
    const shelves = workspaces.filter((w) => w.music);
    if (!shelves.length) return 0;

    let composed = 0;
    for (const preset of MUSIC_PRESETS) {
        const out = await ensurePreset(preset.id, fetchFn);
        if (out.chars) composed++; // zero means this deployment already had it
        // the default preset lands first, so it is the one `shelve` makes the default
        for (const ws of shelves) await shelve(ws.id, out.row.id);
    }
    return composed;
}
