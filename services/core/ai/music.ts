import { createHash } from "node:crypto";
import type { ArtifactContent } from "@model/artifact";
import { sectionLines } from "@model/artifact";
import { DEFAULT_PRESET } from "@model/speech";
import { providerBlocked } from "./speech";

// Music generation: an instrumental bed for a piece being presented. The third thing in this feature
// derived from the content and cached by what produced it, after notes and narration.

export class MusicError extends Error {
    constructor(
        message: string,
        readonly status: 502 | 503,
    ) {
        super(message);
    }
}

const MUSIC_URL = "https://api.elevenlabs.io/v1/music";

export const MUSIC_MODEL = "music_v1";
export const MUSIC_FORMAT = "mp3_44100_64";
export const MUSIC_MIME = "audio/mpeg";

/** Provider bounds. A bed shorter than the floor is a sting; longer than the ceiling is refused. */
export const MIN_MS = 3_000;
export const MAX_MS = 600_000;
/**
 * What a bed is when nothing knows how long it needs to be, which is any un-narrated piece.
 *
 * Short, because the player loops it and generation is charged and waited for by the second:
 * measured at roughly two seconds fixed plus a quarter of a second per second of music, so the old
 * two-minute default was a thirty-second wait behind a spinner and 1,800 credits. Thirty seconds of
 * audio is nine seconds and 450 credits, and a bed written as a repeating idea loops without
 * anyone counting the bars.
 */
export const DEFAULT_MS = 30_000;

export const musicReady = (): boolean => !!process.env.ELEVENLABS_API_KEY;

/**
 * The house set. Ordinary prompts rather than anything clever: they are generated once for the whole
 * install and every workspace shares the result, so the common case costs one generation ever.
 *
 * Written as beds, not as songs. Every one says what it must NOT do, because the failure mode of a
 * generated backing track is a tune that competes with the person talking over it.
 */
const BED_RULES =
    "Instrumental only, no vocals, no lyrics. Give it a clear repeating musical idea with warmth " +
    "and gentle momentum, played so it can be heard rather than sitting in the far background. " +
    "Keep the level even throughout: no long silences, no sudden drops, nothing that spikes. " +
    "It will be played on a loop, so end it where it began: no final chord, no fade out.";

export interface MusicPreset {
    id: string;
    name: string;
    description: string;
    prompt: string;
}

export const MUSIC_PRESETS: readonly MusicPreset[] = [
    {
        id: "calm",
        name: "Calm",
        description: "Soft piano and warm pads, unhurried",
        prompt: `Calm, unhurried underscore. Soft piano over warm analogue pads, a simple recurring motif, spacious but audible. ${BED_RULES}`,
    },
    {
        id: "warm",
        name: "Warm",
        description: "Acoustic and close, a human room",
        prompt: `Warm acoustic underscore. Soft nylon guitar, light upright bass, brushed textures, intimate and close. ${BED_RULES}`,
    },
    {
        id: "focused",
        name: "Focused",
        description: "Clean pulse, quietly purposeful",
        prompt: `Focused modern underscore. Clean muted synth pulse, subtle low end, even and purposeful without urgency. ${BED_RULES}`,
    },
    {
        id: "uplifting",
        name: "Uplifting",
        description: "Bright and open, gently optimistic",
        prompt: `Gently uplifting underscore. Bright airy keys, soft sustained strings, open and optimistic but restrained. ${BED_RULES}`,
    },
    {
        id: "cinematic",
        name: "Cinematic",
        description: "Wide strings, a sense of scale",
        prompt: `Cinematic ambient underscore. Wide sustained strings and low drones, a sense of scale and stillness. ${BED_RULES}`,
    },
];

export const presetById = (id: string | undefined): MusicPreset | undefined =>
    MUSIC_PRESETS.find((p) => p.id === (id ?? DEFAULT_PRESET));

/** How many opening sections are read for the subject, and how much of each. */
const LEAD_SECTIONS = 4;
const LEAD_CHARS = 90;
const SUBJECT_CHARS = 320;

/**
 * What the piece is about, in its own words. The opening of each of the first few sections, which
 * in practice is the headline: enough for a composer to know it is scoring a coastal retreat rather
 * than a quarterly review, without handing over the whole document.
 */
function subjectOf(content: ArtifactContent): string {
    const lines: string[] = [];
    for (const section of content.sections) {
        if (lines.length >= LEAD_SECTIONS) break;
        // the longest string in the section, which is the headline or the standfirst; reading from
        // the top of the tree instead returns a site's nav labels one word at a time
        const longest = sectionLines(section)
            .map((l) => l.trim())
            .reduce((best, l) => (l.length > best.length ? l : best), "");
        const line = longest.slice(0, LEAD_CHARS).trim();
        if (line && !lines.includes(line)) lines.push(line);
    }
    return lines.join(" · ").slice(0, SUBJECT_CHARS);
}

/** A piece to sit behind for two minutes wants a different shape from one to sit behind for ten. */
function paceOf(count: number): string {
    if (count >= 14) return "It is a long sit, so stay patient and let it develop slowly.";
    if (count > 0 && count <= 5) return "It is short, so it can be one unbroken idea.";
    return "";
}

/**
 * A prompt written for one artifact from what the piece says about itself: its subject in its own
 * words, how long a sit it is, the theme's mood descriptor, whether it is dark, and its format.
 * Deterministic on purpose, so it costs nothing, cannot fail, and the same piece always asks for the
 * same bed.
 *
 * The subject is handed over as subject, never as words to sing: `BED_RULES` rules out vocals, and
 * the line below says to take the mood rather than the text.
 *
 * Exported for its tests: what goes into the prompt is the whole design of the feature.
 */
export function bespokePrompt(
    content: ArtifactContent,
    theme: { mood?: string | null; tag?: string; isDark?: boolean } = {},
    title?: string,
): string {
    const surface =
        content.format === "doc"
            ? "a written document being read aloud"
            : content.format === "web"
              ? "a landing page someone is scrolling"
              : "a deck being presented";
    const mood = theme.mood?.trim() || theme.tag?.trim();
    const light = theme.isDark ? "darker and more nocturnal" : "light and open";
    const subject = subjectOf(content);
    return [
        `An instrumental underscore for ${surface}${title ? ` titled "${title.slice(0, 80)}"` : ""}.`,
        subject ? `It is about: ${subject}. Take the mood from that, not the words.` : "",
        mood ? `The piece reads as ${mood}; match that.` : "",
        `Tonally ${light}.`,
        paceOf(content.sections.length),
        BED_RULES,
    ]
        .filter(Boolean)
        .join(" ");
}

/** Everything that changes the audio, so a hit is always safe to serve. */
export const musicHash = (prompt: string, ms: number, modelId: string): string =>
    createHash("sha256").update(`${prompt} ${ms} ${modelId} ${MUSIC_FORMAT}`).digest("hex");

/** The provider refuses anything outside its own bounds, so clamp before spending a call on it. */
export const clampMs = (ms: number): number =>
    Math.max(MIN_MS, Math.min(MAX_MS, Math.round(ms) || DEFAULT_MS));

export interface Composed {
    audio: Buffer;
    mime: string;
    ms: number;
}

export async function compose(
    prompt: string,
    ms: number,
    fetchFn: typeof fetch = fetch,
): Promise<Composed> {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new MusicError("music is not configured on this server", 503);
    const text = prompt.trim();
    if (!text) throw new MusicError("there is nothing to compose from", 502);
    const length = clampMs(ms);

    let res: Response;
    try {
        res = await fetchFn(MUSIC_URL, {
            method: "POST",
            headers: { "xi-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: text,
                music_length_ms: length,
                model_id: MUSIC_MODEL,
                output_format: MUSIC_FORMAT,
            }),
        });
    } catch {
        throw new MusicError("the music service could not be reached", 502);
    }
    if (!res.ok) {
        const blocked = providerBlocked(await res.text().catch(() => ""));
        // the account refused, not the request: a plan to change rather than an outage to wait out
        if (blocked) throw new MusicError(`ElevenLabs: ${blocked}`, 503);
        throw new MusicError(`the music service refused (${res.status})`, 502);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.byteLength) throw new MusicError("the music service returned no audio", 502);
    return { audio, mime: MUSIC_MIME, ms: length };
}
