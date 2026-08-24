import { and, eq, inArray, isNull } from "drizzle-orm";
import type {
    DesignedCandidate,
    LibraryVoice,
    Voice,
    VoiceLabels,
    VoiceQuery,
    WorkspaceVoice,
} from "@model/speech";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { providerBlocked } from "@services/core/ai/speech";

// Voice discovery, adoption and the per-workspace shelf. Synthesis is core/ai/speech.ts; this file
// is about which voices exist and who has chosen them.
//
// Adoption is install-wide. A community voice cannot be spoken with until it has been added to the
// calling ElevenLabs account, that add counts against a monthly budget on the single account serving
// every workspace, and per-tenant adoption of the same popular voice would spend it on duplicates.
// `adopt` is therefore idempotent on `voices.library_id` and is the only path that calls the
// provider's add endpoint.

const LIBRARY_URL = "https://api.elevenlabs.io/v1/shared-voices";
const ADD_URL = "https://api.elevenlabs.io/v1/voices/add";

export class VoiceError extends Error {
    constructor(
        message: string,
        readonly status: 402 | 502 | 503,
    ) {
        super(message);
    }
}

/** A refused call, told apart: an account block is configuration (503), anything else is the provider. */
const refusal = async (res: Response, what: string): Promise<VoiceError> => {
    const blocked = providerBlocked(await res.text().catch(() => ""));
    return blocked
        ? new VoiceError(`ElevenLabs: ${blocked}`, 503)
        : new VoiceError(`${what} refused (${res.status})`, 502);
};

const key = (): string => {
    const k = process.env.ELEVENLABS_API_KEY;
    if (!k) throw new VoiceError("voices are not configured on this server", 503);
    return k;
};

interface SharedVoiceRow {
    voice_id?: string;
    public_owner_id?: string;
    name?: string;
    description?: string;
    preview_url?: string;
    gender?: string;
    age?: string;
    accent?: string;
    language?: string;
    use_case?: string;
    descriptive?: string;
}

const labelsOf = (r: SharedVoiceRow): VoiceLabels => ({
    ...(r.gender ? { gender: r.gender } : {}),
    ...(r.age ? { age: r.age } : {}),
    ...(r.accent ? { accent: r.accent } : {}),
    ...(r.language ? { language: r.language } : {}),
    ...(r.use_case ? { useCase: r.use_case } : {}),
    ...(r.descriptive ? { descriptive: r.descriptive } : {}),
});

const PAGE = 24;

/** Exported for its tests: the query the browse tab's filters become. */
export function libraryParams(q: VoiceQuery): URLSearchParams {
    const p = new URLSearchParams({
        page_size: String(PAGE),
        sort: "trending",
        // narration is what this is for, so the default slice is voices people use for it
        use_cases: q.useCase || "narrative_story",
    });
    if (q.search) p.set("search", q.search);
    if (q.gender) p.set("gender", q.gender);
    if (q.age) p.set("age", q.age);
    if (q.accent) p.set("accent", q.accent);
    if (q.language) p.set("language", q.language);
    if (q.descriptive) p.set("descriptives", q.descriptive);
    if (q.page && q.page > 0) p.set("page", String(q.page));
    return p;
}

/** Exported for its tests: the provider's rows, narrowed to what the picker shows. */
export function toLibraryVoices(rows: readonly SharedVoiceRow[]): LibraryVoice[] {
    const out: LibraryVoice[] = [];
    for (const r of rows) {
        if (!r.voice_id || !r.public_owner_id || !r.name) continue;
        const labels = labelsOf(r);
        out.push({
            externalId: r.voice_id,
            ownerId: r.public_owner_id,
            name: r.name,
            ...(r.description ? { description: r.description } : {}),
            ...(Object.keys(labels).length ? { labels } : {}),
            ...(r.preview_url ? { previewUrl: r.preview_url } : {}),
        });
    }
    return out;
}

export async function searchLibrary(
    q: VoiceQuery,
    fetchFn: typeof fetch = fetch,
): Promise<LibraryVoice[]> {
    // resolved before the try: an unconfigured server is a 503, and catching its own error here
    // would report it as "could not be reached", which sends someone hunting a network problem
    const apiKey = key();
    let res: Response;
    try {
        res = await fetchFn(`${LIBRARY_URL}?${libraryParams(q)}`, {
            headers: { "xi-api-key": apiKey },
        });
    } catch {
        throw new VoiceError("the voice library could not be reached", 502);
    }
    if (!res.ok) throw await refusal(res, "the voice library");
    const body = (await res.json()) as { voices?: SharedVoiceRow[] };
    return toLibraryVoices(body.voices ?? []);
}

const rowToVoice = (r: typeof schema.voices.$inferSelect): Voice => ({
    id: r.id,
    source: r.source as Voice["source"],
    name: r.name,
    ...(r.description ? { description: r.description } : {}),
    ...(r.labels ? { labels: r.labels } : {}),
    ...(r.previewUrl
        ? { previewUrl: r.previewUrl }
        : r.previewData
          ? { previewUrl: `data:audio/mpeg;base64,${r.previewData}` }
          : {}),
});

/**
 * Add a community voice to this deployment's account, once. Returns the existing row when the voice
 * is already adopted, without touching the provider, which is what keeps the monthly add budget from
 * being spent on the same voice twice.
 */
export async function adopt(
    v: LibraryVoice,
    fetchFn: typeof fetch = fetch,
): Promise<typeof schema.voices.$inferSelect> {
    const [existing] = await db
        .select()
        .from(schema.voices)
        .where(eq(schema.voices.libraryId, v.externalId));
    if (existing) return existing;

    const apiKey = key(); // outside the try, for the same reason as in searchLibrary
    let res: Response;
    try {
        res = await fetchFn(`${ADD_URL}/${v.ownerId}/${v.externalId}`, {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ new_name: v.name }),
        });
    } catch {
        throw new VoiceError("the voice could not be added", 502);
    }
    if (!res.ok) throw await refusal(res, "the voice service");
    // the add returns the id this account speaks with, which may differ from the community id
    const added = (await res.json().catch(() => ({}))) as { voice_id?: string };

    const [row] = await db
        .insert(schema.voices)
        .values({
            externalId: added.voice_id ?? v.externalId,
            libraryId: v.externalId,
            source: "library",
            ownerId: v.ownerId,
            name: v.name,
            description: v.description,
            labels: v.labels,
            previewUrl: v.previewUrl,
        })
        // two requests can race the select above; the unique key makes the loser a no-op read
        .onConflictDoNothing({ target: schema.voices.libraryId })
        .returning();
    if (row) return row;
    const [raced] = await db
        .select()
        .from(schema.voices)
        .where(eq(schema.voices.libraryId, v.externalId));
    if (!raced) throw new VoiceError("the voice could not be saved", 502);
    return raced;
}

const DESIGN_URL = "https://api.elevenlabs.io/v1/text-to-voice/design";
const CREATE_URL = "https://api.elevenlabs.io/v1/text-to-voice/create";

/**
 * A designed voice occupies one custom voice slot on the single account serving every workspace, and
 * those slots are finite for all of them put together (160 on Pro, 660 on Scale). This ceiling is
 * ours rather than any plan's: one workspace must not be able to exhaust them for everyone.
 */
export const DESIGN_CEILING = 120;

/** Generate candidates from a description. Nothing is persisted until one is kept. */
export async function design(
    description: string,
    sampleText: string | undefined,
    fetchFn: typeof fetch = fetch,
): Promise<DesignedCandidate[]> {
    const apiKey = key();
    let res: Response;
    try {
        res = await fetchFn(DESIGN_URL, {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
                voice_description: description,
                // a real line from the customer's own piece is a far better signal than a generic
                // sample, so it is passed when there is one and generated when there is not
                ...(sampleText ? { text: sampleText } : { auto_generate_text: true }),
            }),
        });
    } catch {
        throw new VoiceError("the voice designer could not be reached", 502);
    }
    if (!res.ok) throw await refusal(res, "the voice designer");
    const body = (await res.json()) as {
        previews?: {
            generated_voice_id?: string;
            audio_base_64?: string;
            duration_secs?: number;
        }[];
    };
    return (body.previews ?? [])
        .filter((p) => p.generated_voice_id && p.audio_base_64)
        .map((p) => ({
            generatedVoiceId: p.generated_voice_id!,
            audio: `data:audio/mpeg;base64,${p.audio_base_64!}`,
            ms: Math.round((p.duration_secs ?? 0) * 1000),
        }));
}

/** How many designed voices this deployment holds, against DESIGN_CEILING. */
export async function designedCount(): Promise<number> {
    const rows = await db
        .select({ id: schema.voices.id })
        .from(schema.voices)
        .where(eq(schema.voices.source, "designed"));
    return rows.length;
}

/** Turn a candidate into a real voice. This is the call that consumes a slot. */
export async function keepDesigned(
    generatedVoiceId: string,
    name: string,
    description: string,
    preview: string | undefined,
    fetchFn: typeof fetch = fetch,
): Promise<typeof schema.voices.$inferSelect> {
    if ((await designedCount()) >= DESIGN_CEILING)
        throw new VoiceError(
            "this Galleo instance has reached its designed-voice limit; remove one first",
            402,
        );
    const apiKey = key();
    let res: Response;
    try {
        res = await fetchFn(CREATE_URL, {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
                generated_voice_id: generatedVoiceId,
                voice_name: name,
                voice_description: description,
            }),
        });
    } catch {
        throw new VoiceError("the voice could not be created", 502);
    }
    if (!res.ok) throw await refusal(res, "the voice service");
    const made = (await res.json()) as { voice_id?: string };
    if (!made.voice_id) throw new VoiceError("the voice service returned no voice", 502);

    const [row] = await db
        .insert(schema.voices)
        .values({
            externalId: made.voice_id,
            source: "designed",
            name,
            description,
            // a designed voice has no hosted preview, so the kept candidate's own bytes are the sample
            previewData: preview?.replace(/^data:[^,]+,/, ""),
        })
        .returning();
    if (!row) throw new VoiceError("the voice could not be saved", 502);
    return row;
}

/**
 * Designed voices no shelf holds and no artifact names. Each one occupies a slot shared by every
 * workspace, so an experiment nobody kept must not hold one forever.
 */
export async function reapDesigned(): Promise<number> {
    const orphans = await db
        .select({ id: schema.voices.id, externalId: schema.voices.externalId })
        .from(schema.voices)
        .leftJoin(schema.workspaceVoices, eq(schema.workspaceVoices.voiceId, schema.voices.id))
        .where(
            and(eq(schema.voices.source, "designed"), isNull(schema.workspaceVoices.workspaceId)),
        );
    if (!orphans.length) return 0;
    await db.delete(schema.voices).where(
        inArray(
            schema.voices.id,
            orphans.map((o) => o.id),
        ),
    );
    return orphans.length;
}

/**
 * The voice narration falls back to when the library is out of reach.
 *
 * A library voice is the better default (there are thousands, and they do not expire) but reaching
 * one needs both `voices_read` + `add_voice_from_voice_library` on the key AND a paid ElevenLabs
 * account: a free account is refused at synthesis with "Free users cannot use library voices via the
 * API". Premade voices carry neither restriction, so this is what makes narration work out of the box.
 *
 * Chosen as a default that suits an arbitrary artifact rather than any one piece: female,
 * middle-aged, labelled `informative_educational`, which is the register a deck, a document and a
 * landing page can all be read in. Alice (Xb7hH8MSUJpSbSDYk0k2) and Bella (hpp4J3VqNfWAUOO0d1Us)
 * are the same shape if this one ever needs replacing.
 *
 * KNOWN EXPIRY: ElevenLabs retires every premade voice on 31 December 2026. This is a fallback with
 * a shelf life, not the long-term default. When it lapses `ensureVoice` will fail the same way the
 * library path does today, with the provider's own message, and the fix is a paid account (which
 * makes the library path work) or a new id here.
 */
const PREMADE_FALLBACK = {
    externalId: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda",
    description: "Knowledgable and professional, an even register for any piece",
    labels: { gender: "female", age: "middle_aged", useCase: "informative_educational" },
} as const;

/**
 * Move a workspace onto the premade voice and make it the default, after a library voice turned out
 * to be unusable. Called from the synthesis path rather than from `ensureVoice`, because that is
 * where the failure actually shows: adoption succeeds on a free account and only speaking is
 * refused, so a workspace can hold a shelved library voice it can never be heard in.
 *
 * Making it the default is the point: the next run picks it directly instead of failing again.
 */
export async function fallBackToPremade(
    workspaceId: string,
): Promise<{ id: string; externalId: string; name: string }> {
    const row = await premadeVoice();
    await shelve(workspaceId, row.id, { makeDefault: true });
    return { id: row.id, externalId: row.externalId, name: row.name };
}

/** The premade fallback as a `voices` row, inserted once and reused by every workspace after. */
async function premadeVoice(): Promise<typeof schema.voices.$inferSelect> {
    const [held] = await db
        .select()
        .from(schema.voices)
        .where(eq(schema.voices.externalId, PREMADE_FALLBACK.externalId));
    if (held) return held;
    const [row] = await db
        .insert(schema.voices)
        .values({
            externalId: PREMADE_FALLBACK.externalId,
            source: "seeded",
            name: PREMADE_FALLBACK.name,
            description: PREMADE_FALLBACK.description,
            labels: { ...PREMADE_FALLBACK.labels },
        })
        // needs no adoption call, so two racing requests only race on the insert
        .onConflictDoNothing({ target: schema.voices.externalId })
        .returning();
    if (row) return row;
    const [raced] = await db
        .select()
        .from(schema.voices)
        .where(eq(schema.voices.externalId, PREMADE_FALLBACK.externalId));
    if (!raced) throw new VoiceError("no narration voice could be prepared", 502);
    return raced;
}

const SEED_SHELF = 6;

/**
 * Give a fresh workspace a shelf to narrate from, adopted from the live library rather than from a
 * hardcoded list: the provider's own Default voices expire on 31 December 2026, so any id baked in
 * here would stop working inside the year. Silently does nothing without a key, which is the same
 * "unconfigured means invisible" rule dictation already follows.
 */
export async function seedShelf(
    workspaces: readonly { id: string; cap: number }[],
    fetchFn: typeof fetch = fetch,
): Promise<number> {
    if (!process.env.ELEVENLABS_API_KEY || !workspaces.length) return 0;
    const found = await searchLibrary({ useCase: "narrative_story" }, fetchFn);
    const picked = found.slice(0, SEED_SHELF);
    let adopted = 0;
    for (const [i, v] of picked.entries()) {
        const row = await adopt(v, fetchFn);
        adopted++;
        // the seed respects each plan's shelf cap, or a Free demo workspace would open holding six
        // voices it could never have saved itself
        for (const ws of workspaces) if (ws.cap < 0 || i < ws.cap) await shelve(ws.id, row.id);
    }
    return adopted;
}

/**
 * The voice a piece should speak with, adopting one on demand when the workspace has never chosen.
 *
 * Narration has to work before anyone opens settings, and a hardcoded id cannot be the answer: the
 * provider's Default voices expire at the end of 2026. So the first narration a workspace asks for
 * takes the top narration voice from the live library, adopts it install-wide like any other, and
 * shelves it as the default. From then on it is an ordinary shelf entry the workspace can rename,
 * replace, or narrate past.
 *
 * Only the write path calls this. A manifest read must never adopt, or a GET would spend the
 * account's monthly add budget.
 */
export async function ensureVoice(
    workspaceId: string,
    artifactVoiceId: string | undefined,
    fetchFn: typeof fetch = fetch,
): Promise<{ id: string; externalId: string; name: string } | null> {
    const chosen = await voiceFor(workspaceId, artifactVoiceId);
    if (chosen) return chosen;

    // The library first, since those voices are better and do not expire. It needs two key scopes
    // and a paid account, so any refusal here falls through to the premade voice rather than
    // leaving the workspace unable to narrate at all.
    try {
        const found = await searchLibrary({ useCase: "narrative_story" }, fetchFn);
        const first = found[0];
        if (first) {
            const row = await adopt(first, fetchFn);
            await shelve(workspaceId, row.id);
            const picked = await voiceFor(workspaceId, artifactVoiceId);
            if (picked) return picked;
        }
    } catch {
        // falls through: an unreachable library is not a reason to have no voice
    }

    const row = await premadeVoice();
    await shelve(workspaceId, row.id);
    return await voiceFor(workspaceId, artifactVoiceId);
}

/** The workspace's shelf, default first. */
export async function shelfFor(workspaceId: string): Promise<WorkspaceVoice[]> {
    const rows = await db
        .select({ voice: schema.voices, link: schema.workspaceVoices })
        .from(schema.workspaceVoices)
        .innerJoin(schema.voices, eq(schema.voices.id, schema.workspaceVoices.voiceId))
        .where(eq(schema.workspaceVoices.workspaceId, workspaceId));
    return rows
        .map(({ voice, link }) => ({
            ...rowToVoice(voice),
            ...(link.name ? { name: link.name } : {}),
            isDefault: link.isDefault,
        }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** Shelve a voice. The first one a workspace saves becomes its default, since something must be. */
export async function shelve(
    workspaceId: string,
    voiceId: string,
    opts: { name?: string; makeDefault?: boolean } = {},
): Promise<void> {
    const held = await db
        .select({ voiceId: schema.workspaceVoices.voiceId })
        .from(schema.workspaceVoices)
        .where(eq(schema.workspaceVoices.workspaceId, workspaceId));
    const first = held.length === 0;
    const asDefault = opts.makeDefault || first;
    if (asDefault) await clearDefault(workspaceId);
    await db
        .insert(schema.workspaceVoices)
        .values({ workspaceId, voiceId, name: opts.name, isDefault: asDefault })
        .onConflictDoUpdate({
            target: [schema.workspaceVoices.workspaceId, schema.workspaceVoices.voiceId],
            set: { ...(opts.name ? { name: opts.name } : {}), isDefault: asDefault },
        });
}

const clearDefault = async (workspaceId: string): Promise<void> => {
    await db
        .update(schema.workspaceVoices)
        .set({ isDefault: false })
        .where(
            and(
                eq(schema.workspaceVoices.workspaceId, workspaceId),
                eq(schema.workspaceVoices.isDefault, true),
            ),
        );
};

export async function renameShelved(
    workspaceId: string,
    voiceId: string,
    name: string,
): Promise<void> {
    await db
        .update(schema.workspaceVoices)
        .set({ name })
        .where(
            and(
                eq(schema.workspaceVoices.workspaceId, workspaceId),
                eq(schema.workspaceVoices.voiceId, voiceId),
            ),
        );
}

export async function makeDefault(workspaceId: string, voiceId: string): Promise<void> {
    await clearDefault(workspaceId);
    await db
        .update(schema.workspaceVoices)
        .set({ isDefault: true })
        .where(
            and(
                eq(schema.workspaceVoices.workspaceId, workspaceId),
                eq(schema.workspaceVoices.voiceId, voiceId),
            ),
        );
}

/**
 * Remove a voice from a shelf. Removing the default promotes another rather than leaving the
 * workspace with none, and removing the last one is refused: a workspace with an empty shelf cannot
 * narrate at all, and that is a worse outcome than keeping one voice it no longer wants.
 */
export async function unshelve(workspaceId: string, voiceId: string): Promise<void> {
    const held = await db
        .select({
            voiceId: schema.workspaceVoices.voiceId,
            isDefault: schema.workspaceVoices.isDefault,
        })
        .from(schema.workspaceVoices)
        .where(eq(schema.workspaceVoices.workspaceId, workspaceId));
    if (held.length <= 1) throw new VoiceError("a workspace keeps at least one voice", 402);
    const row = held.find((h) => h.voiceId === voiceId);
    if (!row) return;
    await db
        .delete(schema.workspaceVoices)
        .where(
            and(
                eq(schema.workspaceVoices.workspaceId, workspaceId),
                eq(schema.workspaceVoices.voiceId, voiceId),
            ),
        );
    if (row.isDefault) {
        const next = held.find((h) => h.voiceId !== voiceId);
        if (next) await makeDefault(workspaceId, next.voiceId);
    }
    // A designed voice holds one of a finite number of slots shared by every workspace, so the moment
    // the last shelf lets go of one it is released rather than waiting for a sweep that never runs.
    await reapDesigned();
}

/**
 * The provider id that should speak this artifact: its own choice, else the workspace default.
 * Null when the workspace has no voice at all, which is what makes narration unavailable rather
 * than silently picking one.
 */
export async function voiceFor(
    workspaceId: string,
    artifactVoiceId: string | undefined,
): Promise<{ id: string; externalId: string; name: string } | null> {
    const rows = await db
        .select({ voice: schema.voices, link: schema.workspaceVoices })
        .from(schema.workspaceVoices)
        .innerJoin(schema.voices, eq(schema.voices.id, schema.workspaceVoices.voiceId))
        .where(eq(schema.workspaceVoices.workspaceId, workspaceId));
    const chosen =
        rows.find((r) => artifactVoiceId && r.voice.id === artifactVoiceId) ??
        rows.find((r) => r.link.isDefault) ??
        rows[0];
    return chosen
        ? {
              id: chosen.voice.id,
              externalId: chosen.voice.externalId,
              name: chosen.link.name ?? chosen.voice.name,
          }
        : null;
}
