import { createHash } from "node:crypto";
import type { SpeechAlignment } from "@model/speech";

// Speech synthesis: one section's spoken script becomes cached audio plus the character alignment a
// caption highlights from. The counterpart to voice.ts, which is dictation and runs the other way:
// there the browser streams to the provider directly, here the server calls and keeps the result,
// because narration is a durable part of the document and is played by people who are not signed in.

export class SpeechError extends Error {
    constructor(
        message: string,
        readonly status: 502 | 503,
        /** The account is refused whatever it asks with, so a different voice is not a way round. */
        readonly exhausted = false,
    ) {
        super(message);
    }
}

const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

/**
 * The provider's own reason when the account, rather than the request, is what refused. Two shapes
 * reach us and both name something an operator has to go and change:
 *
 * - `missing_permissions` (401): a scope to tick on a key that is otherwise fine. Narration needs
 *   `text_to_speech`; browsing and adopting a library voice need `voices_read` and
 *   `add_voice_from_voice_library`.
 * - `payment_required` / `feature_unavailable` / `limited_access` (402): the account's plan. A free
 *   ElevenLabs account cannot speak with library voices over the API at all, however the key is
 *   scoped, and cannot reach the music API either.
 *
 * Both are configuration and neither is an outage, so the caller raises them as 503 with this text.
 * A bare "refused (401)" or "refused (402)" sends someone hunting a bad secret or a dead provider
 * when the fix is a checkbox or an upgrade. Shared with core/voices.ts, which calls the same API.
 */
const ACCOUNT_BLOCKED = new Set([
    "missing_permissions",
    "payment_required",
    "feature_unavailable",
    // what the music API answers a free account with, found while wiring it up
    "limited_access",
    // out of characters for the month. Arrives as a 401, which reads as a credentials problem and
    // sent one debugging session after a key that was fine.
    "quota_exceeded",
]);

/**
 * Refusals that no other voice would survive, because they are about the account rather than about
 * what was asked for. Retrying one of these on a different voice spends a second failing request to
 * learn what the first already said.
 *
 * `payment_required` is deliberately NOT here: a free account refuses LIBRARY voices with it, and
 * reading the same words in the premade voice is exactly the way past that.
 */
const ACCOUNT_WIDE = new Set(["quota_exceeded", "limited_access"]);

const detailOf = (body: string): { status?: string; message?: string } | undefined => {
    try {
        return (JSON.parse(body) as { detail?: { status?: string; message?: string } }).detail;
    } catch {
        return undefined;
    }
};

export function providerBlocked(body: string): string | null {
    const d = detailOf(body);
    return d?.status && ACCOUNT_BLOCKED.has(d.status) && d.message ? d.message : null;
}

/** True when the refusal is the account's, so swapping the voice cannot help. */
export function providerExhausted(body: string): boolean {
    const d = detailOf(body);
    return !!d?.status && ACCOUNT_WIDE.has(d.status);
}

// The most stable model on long-form generation, which narration is by definition. eleven_v3 is more
// expressive at the same price with half the character ceiling; eleven_flash_v2_5 is half the price
// and audibly flatter. Changing this invalidates every cached row, since it is in the hash.
export const NARRATION_MODEL = "eleven_multilingual_v2";

// ~8 KB per second of audio. Enough for speech, small enough that a twelve-section deck is a few MB.
export const OUTPUT_FORMAT = "mp3_44100_64";
export const OUTPUT_MIME = "audio/mpeg";

// the provider's own ceiling for this model; a longer script is refused rather than silently clipped
export const MAX_CHARS = 10_000;

export const speechReady = (): boolean => !!process.env.ELEVENLABS_API_KEY;

/**
 * What a cached row is keyed by. Every input that changes the audio is in here, so a hit is always
 * safe to serve and an edit invalidates exactly the section it touched.
 */
export const narrationHash = (spoken: string, voiceId: string, modelId: string): string =>
    createHash("sha256")
        // \0 escapes rather than the bytes themselves: a raw NUL makes the file binary to grep
        .update(`${spoken}\0${voiceId}\0${modelId}\0${OUTPUT_FORMAT}`)
        .digest("hex");

export interface Synthesized {
    audio: Buffer;
    mime: string;
    ms: number;
    chars: number;
    alignment?: SpeechAlignment;
}

interface RawAlignment {
    characters?: unknown;
    character_start_times_seconds?: unknown;
    character_end_times_seconds?: unknown;
}

/** Exported for its tests: the provider's parallel arrays, kept only when they line up. */
export function toAlignment(raw: RawAlignment | undefined): SpeechAlignment | undefined {
    const characters = raw?.characters;
    const starts = raw?.character_start_times_seconds;
    const ends = raw?.character_end_times_seconds;
    if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends))
        return undefined;
    // a ragged triple would put a caption's highlight on the wrong word, so it is dropped whole
    if (characters.length !== starts.length || characters.length !== ends.length) return undefined;
    if (!characters.length) return undefined;
    return {
        characters: characters.map(String),
        starts: starts.map(Number),
        ends: ends.map(Number),
    };
}

/** The spoken length, from the alignment when we have it. Falls back to a speaking-rate estimate. */
export const durationMs = (alignment: SpeechAlignment | undefined, chars: number): number => {
    const last = alignment?.ends.at(-1);
    if (typeof last === "number" && last > 0) return Math.round(last * 1000);
    // ~14 characters a second is ordinary narration pace; only used when alignment is missing
    return Math.max(1000, Math.round((chars / 14) * 1000));
};

/**
 * Synthesize one script. Always the with-timestamps endpoint: the alignment cannot be reconstructed
 * afterwards, and it is what the caption overlay and the per-page step timing are built from.
 */
export async function synthesize(
    text: string,
    voiceId: string,
    fetchFn: typeof fetch = fetch,
): Promise<Synthesized> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new SpeechError("narration is not configured on this server", 503);
    const spoken = text.trim();
    if (!spoken) throw new SpeechError("there is nothing to say", 502);
    if (spoken.length > MAX_CHARS)
        throw new SpeechError(`a section's script is limited to ${MAX_CHARS} characters`, 502);

    let res: Response;
    try {
        res = await fetchFn(
            `${TTS_URL}/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
            {
                method: "POST",
                headers: { "xi-api-key": key, "Content-Type": "application/json" },
                // No `voice_settings`: the provider's defaults, picked over a tuned set by
                // listening to both across a section change. Loosening stability makes one take
                // livelier and the takes differ from each other, and a piece is spoken a section at
                // a time, so the second effect is the one you hear.
                body: JSON.stringify({ text: spoken, model_id: NARRATION_MODEL }),
            },
        );
    } catch {
        throw new SpeechError("the speech service could not be reached", 502);
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const blocked = providerBlocked(body);
        // the account refused, not the request: configuration, so 503 rather than a bad gateway
        if (blocked) throw new SpeechError(`ElevenLabs: ${blocked}`, 503, providerExhausted(body));
        throw new SpeechError(`the speech service refused (${res.status})`, 502);
    }

    const body = (await res.json()) as { audio_base64?: string; alignment?: RawAlignment };
    if (!body.audio_base64) throw new SpeechError("the speech service returned no audio", 502);
    const alignment = toAlignment(body.alignment);
    return {
        audio: Buffer.from(body.audio_base64, "base64"),
        mime: OUTPUT_MIME,
        ms: durationMs(alignment, spoken.length),
        chars: spoken.length,
        ...(alignment ? { alignment } : {}),
    };
}
