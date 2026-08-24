// Voice and narration: the voices a workspace can speak with, and the cached audio a piece narrates
// itself from. Lives at this layer because both ends need it — the picker and the player are in the
// browser, the synthesis and the cache are in services, and neither may import the other.
//
// The spoken text itself is `SectionNotes` in ./artifact; this file is about turning it into sound.

import type { Id } from "./artifact";

/** library = adopted from the provider's community list · designed = generated · seeded = shipped. */
export type VoiceSource = "library" | "designed" | "seeded";

// The provider's own vocabulary, kept verbatim so a filter round-trips without a translation table.
export interface VoiceLabels {
    gender?: string;
    age?: string;
    accent?: string;
    language?: string;
    useCase?: string;
    descriptive?: string;
}

/** One voice this deployment can speak with. `id` is ours; the provider id never leaves services. */
export interface Voice {
    id: Id;
    source: VoiceSource;
    name: string;
    description?: string;
    labels?: VoiceLabels;
    /** A sample to play in the picker: the provider's url, or a data uri for a designed voice. */
    previewUrl?: string;
}

/** A voice on a workspace's shelf: the catalog row plus what this workspace did with it. */
export interface WorkspaceVoice extends Voice {
    isDefault: boolean;
}

/** What the browse tab sends; every field is a provider-native filter, so nothing is translated. */
export interface VoiceQuery {
    search?: string;
    gender?: string;
    age?: string;
    accent?: string;
    language?: string;
    useCase?: string;
    descriptive?: string;
    page?: number;
}

/** A community voice as the library returns it, before this deployment has adopted it. */
export interface LibraryVoice {
    externalId: string;
    ownerId: string;
    name: string;
    description?: string;
    labels?: VoiceLabels;
    previewUrl?: string;
}

/**
 * Character-level timing from the provider, which is what a caption highlights from. Parallel arrays
 * rather than an array of objects because that is the wire shape, and it is three numbers per
 * character: turning it into objects would triple the payload for no gain.
 */
export interface SpeechAlignment {
    characters: string[];
    starts: number[]; // seconds from the start of this section's audio
    ends: number[];
}

/** One section's prepared narration, as the player consumes it. */
export interface NarrationTrack {
    sectionId: Id;
    url: string;
    ms: number;
    spoken: string;
    alignment?: SpeechAlignment;
}

/** A short display name from a voice description, so a kept take is not called "Untitled". */
export function designedName(description: string): string {
    const words = description.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
    const name = words.replace(/[^\p{L}\p{N} ]/gu, "").trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : "New voice";
}

/** One take from the voice designer. Nothing is stored until a candidate is kept. */
export interface DesignedCandidate {
    generatedVoiceId: string;
    audio: string; // a data uri: a candidate has no hosted preview until it becomes a real voice
    ms: number;
}

/** The instrumental bed a piece plays while it is presented. */
export interface Soundtrack {
    id: Id;
    source: "preset" | "custom";
    preset?: string;
    prompt: string;
    ms: number;
    url: string;
}

/**
 * The bed a piece plays when nobody has chosen one. Here rather than beside the preset prompts
 * because both ends need it: the server to build it, the picker to show what is selected.
 */
export const DEFAULT_PRESET = "calm";

/** A house bed the picker offers; `ready` is false until this deployment has generated it. */
export interface MusicPresetInfo {
    id: string;
    name: string;
    description: string;
    ready: boolean;
}

/** What is prepared for a whole piece, and what is stale, so the player knows what it can play. */
export interface NarrationManifest {
    voiceName?: string;
    tracks: NarrationTrack[];
    /** Sections that have notes but no current audio: they dwell rather than being skipped. */
    stale: Id[];
    /** Whether this server can synthesize at all; absent on older payloads means it can. */
    ready?: boolean;
}

/**
 * Fold character timings into word spans, which is what a caption can actually highlight: a reader
 * follows words, and a per-character sweep reads as noise at speaking speed.
 *
 * Pure and shared so the player and its tests agree on where a word starts.
 */
export interface WordSpan {
    text: string;
    start: number;
    end: number;
}

export function wordSpans(alignment: SpeechAlignment | undefined): WordSpan[] {
    if (!alignment?.characters.length) return [];
    const { characters, starts, ends } = alignment;
    const out: WordSpan[] = [];
    let text = "";
    let start = 0;
    for (let i = 0; i < characters.length; i++) {
        const ch = characters[i] ?? "";
        if (/\s/.test(ch)) {
            if (text) out.push({ text, start, end: ends[i - 1] ?? start });
            text = "";
            continue;
        }
        if (!text) start = starts[i] ?? 0;
        text += ch;
    }
    if (text) out.push({ text, start, end: ends[characters.length - 1] ?? start });
    return out;
}

/** The word being spoken at `t` seconds, or -1 before the first and after the last. */
export function wordAt(spans: readonly WordSpan[], t: number): number {
    for (let i = 0; i < spans.length; i++) {
        const s = spans[i]!;
        if (t < s.start) return -1;
        if (t <= s.end) return i;
    }
    return -1;
}
