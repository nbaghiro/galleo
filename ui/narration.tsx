import type { Accessor, Component } from "solid-js";
import { createEffect, createMemo, createSignal, on, onCleanup, For, Show } from "solid-js";
import type { NarrationManifest, NarrationTrack, Soundtrack } from "@model/speech";
import { wordAt, wordSpans } from "@model/speech";
import { duckedVolume } from "@model/artifact";
import type { Surface } from "@model/ai";
import { capture } from "./analytics";

// The narration player: one <audio> element, a track per section, and the timing that advances the
// surface it sits on. It knows nothing about slides or scrolling — the surface hands it a "go to
// this section" callback and tells it which section the viewer is on.

/**
 * Injected by the app or the publish viewer; `@ui` may not fetch for itself.
 *
 * `load` is what is already recorded. `ensure` records a section on demand and is what removes the
 * separate "prepare" step: a host that can bill for it (the author, in the editor or at /present)
 * supplies it, and a published link does not, because an anonymous viewer cannot be charged and
 * plays only what the author recorded.
 */
export interface NarrationSource {
    load(): Promise<NarrationManifest>;
    ensure?(sectionId: string): Promise<NarrationTrack | null>;
}

/** The instrumental bed, loaded separately: it plays with or without a voice over it. */
export interface SoundtrackSource {
    load(): Promise<Soundtrack | null>;
    /**
     * Turn the bed on for the piece, building the default one if this deployment has none yet.
     * Wired only where the caller may edit: without it the control appears once a bed exists and is
     * playback alone, which is all a link viewer should have over someone else's piece.
     */
    enable?(): Promise<Soundtrack | null>;
}

/**
 * The bed under a presentation. A second element rather than Web Audio, because that is all two
 * sources need, and it ducks while a voice speaks: an unattenuated bed under narration is
 * unlistenable, which is ordinary broadcast practice rather than a matter of taste.
 *
 * Loops, because a bed outlives its own length whenever nobody is narrating and the viewer sets the
 * pace. A generated track has a real beginning and end, so the seam is faded rather than cut.
 */
export function createSoundtrackPlayer(opts: {
    source: () => SoundtrackSource | undefined;
    /** True while narration speaks, which is when the bed drops. */
    speaking: () => boolean;
    volume: () => number;
    where?: () => "present" | "publish";
    artifactFormat?: () => Surface;
    onError?: (message: string) => void;
}): {
    /** There is a bed to play. */
    ready: Accessor<boolean>;
    /** The control belongs on the bar: either there is a bed, or this caller can start one. */
    offered: Accessor<boolean>;
    playing: Accessor<boolean>;
    /** True while the first press is building the bed. */
    busy: Accessor<boolean>;
    toggle(): void;
    stop(): void;
    mount(el: HTMLAudioElement): void;
} {
    const [track, setTrack] = createSignal<Soundtrack | null>(null);
    const [playing, setPlaying] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    let audio: HTMLAudioElement | undefined;
    let startedAt = 0;
    let ducked = false;

    createEffect(
        on(
            () => opts.source(),
            (src) => {
                if (!src) return;
                void src
                    .load()
                    .then(setTrack)
                    .catch(() => {
                        setTrack(null);
                        // the piece asked for music and none can play; say so once
                        opts.onError?.("The soundtrack could not be loaded.");
                    });
            },
        ),
    );

    // the gain follows the voice, so the bed sits under it rather than fighting it
    createEffect(() => {
        const speaking = opts.speaking();
        if (speaking && playing()) ducked = true;
        const level = duckedVolume(opts.volume(), speaking);
        if (audio) audio.volume = level;
    });

    const start = (): void => {
        const t = track();
        if (!audio || !t || playing()) return;
        if (audio.src !== t.url) audio.src = t.url;
        void audio.play().catch(() => setPlaying(false));
    };

    /**
     * A piece with music on starts playing it when the surface opens: the switch is the artifact's,
     * so making the viewer press a second one would be asking twice. Entering present is a click, so
     * the document is usually activated and this is allowed; where it is not, the promise rejects,
     * nothing happens, and the bar's button is the way in.
     */
    createEffect(on(track, (t) => t && start()));

    // One event per listen, on the way out, as narration does: a session is a row, not a stream.
    const report = (): void => {
        const t = track();
        if (!startedAt || !t) return;
        capture("soundtrack_played", {
            where: opts.where?.() ?? "present",
            artifact_format: opts.artifactFormat?.() ?? "deck",
            source: t.source,
            with_narration: ducked,
            ms: Date.now() - startedAt,
        });
        startedAt = 0;
        ducked = false;
    };

    const stop = (): void => {
        audio?.pause();
        setPlaying(false);
        report();
    };

    /**
     * The first press on a piece with no bed turns music on and builds the default one; every press
     * after is play/pause. Choosing a different bed is the picker's job, not this button's, and
     * pausing mid-talk must not rewrite the artifact.
     */
    const toggle = (): void => {
        if (playing()) {
            stop();
            return;
        }
        if (track()) {
            start();
            return;
        }
        const enable = opts.source()?.enable;
        if (!enable || busy()) return;
        setBusy(true);
        void enable()
            .then((t) => {
                setTrack(t);
                if (!t) opts.onError?.("That music could not be started.");
            })
            .catch((e: unknown) =>
                opts.onError?.(e instanceof Error ? e.message : "That music could not be started."),
            )
            .finally(() => setBusy(false));
    };

    const mount = (el: HTMLAudioElement): void => {
        audio = el;
        el.loop = true;
        el.volume = duckedVolume(opts.volume(), opts.speaking());
        el.addEventListener("play", () => {
            setPlaying(true);
            if (!startedAt) startedAt = Date.now();
        });
        el.addEventListener("pause", () => setPlaying(false));
    };

    onCleanup(stop);
    return {
        ready: () => !!track(),
        offered: () => !!track() || !!opts.source()?.enable,
        playing,
        busy,
        toggle,
        stop,
        mount,
    };
}

export interface NarrationPlayer {
    ready: Accessor<boolean>;
    playing: Accessor<boolean>;
    voiceName: Accessor<string | undefined>;
    /** The word being spoken, for the caption. */
    caption: Accessor<{ words: string[]; at: number } | null>;
    /** 0..1 across the whole piece, by time rather than by section count. */
    progress: Accessor<number>;
    /** The section being spoken, so the surface can step through its screens while it plays. */
    speaking: Accessor<string | undefined>;
    /** True while a section is being recorded before it can be spoken. */
    recording: Accessor<boolean>;
    /** Anything a voice could read, whether or not it has been recorded yet. */
    hasScript: Accessor<boolean>;
    /**
     * Whether the section a press would start on already has audio. False means the first press
     * records before it can speak, which is a different offer and gets a different icon.
     */
    prepared: Accessor<boolean>;
    toggle(): void;
    stop(): void;
    /** The surface calls this when the viewer navigates by hand, so the audio follows them. */
    retarget(sectionId: string): void;
    trackFor(sectionId: string): NarrationTrack | undefined;
    /** Hands the player the element it drives; rendered once by NarrationAudio. */
    mount(el: HTMLAudioElement): void;
    /** Re-read the manifest. Preparing narration mid-present has nothing to play until this runs. */
    reload(): Promise<void>;
}

export function createNarrationPlayer(opts: {
    source: () => NarrationSource | undefined;
    /** Where this is playing, for the one analytics event a listen produces. */
    where?: () => "editor" | "present" | "publish";
    artifactFormat?: () => Surface;
    /** Move the surface to a section. The player calls this to advance. */
    goToSection: (sectionId: string) => void;
    /** Which section the viewer is on right now. */
    currentSection: () => string | undefined;
    /** Every section in order, so the player knows what comes next. */
    order: () => string[];
    /** Every section that has something a voice could read, recorded or not. */
    scripted: () => Set<string>;
    /**
     * Whether this host can write a script for a section that has none. When it can, every section
     * is a candidate and `ensure` is what decides: a section with nothing worth saying comes back
     * null and is skipped, exactly as an unscripted one always was.
     */
    scriptable?: () => boolean;
    /**
     * Sections whose script no longer describes what is on screen. Recorded audio for one of these
     * is wrong rather than merely old, so it is treated as a miss: the host rewrites the script and
     * the new words are recorded over it.
     */
    stale?: () => Set<string>;
    onError?: (message: string) => void;
}): NarrationPlayer {
    const [manifest, setManifest] = createSignal<NarrationManifest | null>(null);
    const [playing, setPlaying] = createSignal(false);
    const [now, setNow] = createSignal(0);
    const [elapsed, setElapsed] = createSignal(0);
    let audio: HTMLAudioElement | undefined;
    // The section the player is speaking, which lags the surface while it moves. A signal rather
    // than a plain variable because the caption and the progress bar both read it.
    const [speaking, setSpeaking] = createSignal<string | undefined>(undefined);

    const [made, setMade] = createSignal<Map<string, NarrationTrack>>(new Map());
    const [recording, setRecording] = createSignal(false);
    // what the manifest had, plus anything recorded since; a just-made track wins
    const tracks = createMemo(() => {
        const out = new Map(manifest()?.tracks.map((t) => [t.sectionId, t]));
        for (const [id, t] of made()) out.set(id, t);
        return out;
    });
    const totalMs = createMemo(() => (manifest()?.tracks ?? []).reduce((n, t) => n + t.ms, 0));

    const trackFor = (sectionId: string): NarrationTrack | undefined => tracks().get(sectionId);

    // One event per listen, on the way out, so a session is a row rather than a stream of them.
    let startedAt = 0;
    const heard = new Set<string>();
    const report = (completed: boolean): void => {
        if (!startedAt) return;
        capture("narration_played", {
            where: opts.where?.() ?? "present",
            artifact_format: opts.artifactFormat?.() ?? "deck",
            sections_heard: heard.size,
            section_count: opts.order().length,
            completed,
            ms: Date.now() - startedAt,
        });
        startedAt = 0;
        heard.clear();
    };

    const stop = (completed = false): void => {
        audio?.pause();
        setPlaying(false);
        setSpeaking(undefined);
        report(completed);
    };

    const advance = (): void => {
        const from = speaking();
        if (!from) return;
        const next = nextWithScript(from);
        if (!next) {
            stop(true); // ran to the end, which is the number worth knowing
            return;
        }
        opts.goToSection(next);
        speak(next);
    };

    const playTrack = (track: NarrationTrack): void => {
        if (!audio) return;
        if (audio.src !== track.url) audio.src = track.url;
        audio.currentTime = 0;
        void audio.play().catch(() => setPlaying(false));
    };

    /** Audio that can be played as it stands: recorded, and recorded from the script in force. */
    const current = (sectionId: string): NarrationTrack | undefined =>
        opts.stale?.().has(sectionId) ? undefined : tracks().get(sectionId);

    const inFlight = new Map<string, Promise<NarrationTrack | null>>();

    /** Record a section if it is not already, and remember it. Null when it has nothing to say. */
    const ensure = (sectionId: string): Promise<NarrationTrack | null> => {
        const held = current(sectionId);
        if (held) return Promise.resolve(held);
        const running = inFlight.get(sectionId);
        if (running) return running;
        const src = opts.source();
        // an unconfigured server can only refuse a recording, so don't ask it to
        if (!src?.ensure || manifest()?.ready === false) return Promise.resolve(null);
        const job = src
            .ensure(sectionId)
            .then((made) => {
                if (made) setMade((m) => new Map(m).set(sectionId, made));
                return made;
            })
            .finally(() => inFlight.delete(sectionId));
        inFlight.set(sectionId, job);
        return job;
    };

    /**
     * Whether this player can speak a section, which three different callers know three ways: a host
     * that can write scripts can speak anything, an editor reads it off the notes, and a link viewer
     * has no notes at all (the published payload strips them, since cues are the presenter's) and
     * knows only from the manifest, which is the whole record of what was recorded for them.
     */
    const speakable = (sectionId: string): boolean =>
        !!opts.scriptable?.() || opts.scripted().has(sectionId) || tracks().has(sectionId);

    /** The section after this one that has something to say, so a hero or a footer is skipped. */
    const nextWithScript = (from: string): string | undefined => {
        const ids = opts.order();
        for (let i = ids.indexOf(from) + 1; i < ids.length; i++) {
            const id = ids[i]!;
            if (speakable(id)) return id;
        }
        return undefined;
    };

    /**
     * Play one section, recording it first if it has never been spoken. The wait only happens on a
     * section nobody has heard yet, because `advance` records the next one while this one plays.
     */
    const speak = (sectionId: string): void => {
        setSpeaking(sectionId);
        heard.add(sectionId);
        const held = current(sectionId);
        if (held) {
            playTrack(held);
            void prefetch(sectionId);
            return;
        }
        setRecording(true);
        void ensure(sectionId)
            .then((track) => {
                setRecording(false);
                // the viewer moved on while this was recording; whatever they moved to owns the turn
                if (!playing() || speaking() !== sectionId) return;
                if (track) {
                    playTrack(track);
                    void prefetch(sectionId);
                } else advance();
            })
            .catch((e: unknown) => {
                setRecording(false);
                opts.onError?.(e instanceof Error ? e.message : "That section could not be read.");
                stop();
            });
    };

    /** Record the next section while this one plays, so only the first one is ever a wait. */
    const prefetch = async (from: string): Promise<void> => {
        const next = nextWithScript(from);
        if (next) await ensure(next).catch(() => undefined);
    };

    const firstSpoken = (): string | undefined => {
        const at = opts.currentSection();
        if (at && speakable(at)) return at;
        return opts.order().find(speakable);
    };

    const toggle = (): void => {
        if (playing()) {
            stop();
            return;
        }
        const start = firstSpoken();
        if (!start) return;
        if (!startedAt) startedAt = Date.now();
        setPlaying(true);
        if (start !== opts.currentSection()) opts.goToSection(start);
        speak(start);
    };

    /**
     * Manual navigation moves the narration: clicking to slide nine or scrolling to section five
     * switches the audio there rather than letting the voice carry on about something else. The
     * surface debounces the continuous case before calling this.
     */
    const retarget = (sectionId: string): void => {
        if (!playing() || sectionId === speaking()) return;
        speak(sectionId);
    };

    const mount = (el: HTMLAudioElement): void => {
        audio = el;
        el.addEventListener("ended", advance);
        el.addEventListener("timeupdate", () => setNow(el.currentTime));
        el.addEventListener("play", () => setPlaying(true));
        el.addEventListener("pause", () => setPlaying(false));
        onCleanup(() => {
            el.removeEventListener("ended", advance);
        });
    };

    const reload = async (): Promise<void> => {
        const src = opts.source();
        if (!src) return;
        try {
            setManifest(await src.load());
        } catch {
            setManifest(null);
        }
    };

    // read when a source is wired; re-read on demand after a piece is prepared
    createEffect(
        on(
            () => opts.source(),
            () => void reload(),
        ),
    );

    // elapsed across the whole piece: every finished track, plus how far into this one
    createEffect(() => {
        const id = speaking();
        const list = manifest()?.tracks ?? [];
        const at = list.findIndex((t) => t.sectionId === id);
        const before = at < 0 ? 0 : list.slice(0, at).reduce((n, t) => n + t.ms, 0);
        setElapsed(before + now() * 1000);
    });

    onCleanup(() => stop());

    const caption = (): { words: string[]; at: number } | null => {
        const id = speaking();
        const track = id ? trackFor(id) : undefined;
        if (!track) return null;
        const spans = wordSpans(track.alignment);
        if (!spans.length) return { words: track.spoken.split(/\s+/).filter(Boolean), at: -1 };
        return { words: spans.map((s) => s.text), at: wordAt(spans, now()) };
    };

    return {
        // there is something to play: either already recorded, or recordable on demand
        // something to say, and either audio for it already or a way to record it
        ready: () => opts.order().some(speakable) && (tracks().size > 0 || !!opts.source()?.ensure),
        playing,
        voiceName: () => manifest()?.voiceName,
        caption,
        progress: () => (totalMs() ? Math.min(1, elapsed() / totalMs()) : 0),
        speaking,
        recording,
        prepared: () => {
            const first = firstSpoken();
            return !!first && !!current(first);
        },
        hasScript: () => opts.order().some(speakable),
        toggle,
        stop: () => stop(),
        retarget,
        trackFor,
        mount,
        reload,
    };
}

/** The hidden element the player drives. Rendered once, inside the surface. */
export const NarrationAudio: Component<{ mount: (el: HTMLAudioElement) => void }> = (props) => (
    <audio ref={(el) => props.mount(el)} preload="auto" class="hidden" />
);

/** The spoken line, with the current word lifted. Off by default; the surface toggles it. */
/**
 * What a bed has instead of captions. Narration can show its words; music can only show that it is
 * sounding, so this is a row of levels over the control bar: small, dim, and behind the work rather
 * than in front of it.
 *
 * The heights and beats are fixed rather than read off the audio. A real analyser would need Web
 * Audio around an element that currently just plays a URL, and at this size nobody is checking
 * whether the bars match the music: what has to be true is that it moves while sound is coming out
 * and stops when it is not.
 */
const LEVELS = [
    { h: 6, beat: "1.15s", delay: "-0.20s" },
    { h: 10, beat: "0.95s", delay: "-0.65s" },
    { h: 7, beat: "1.30s", delay: "0s" },
    { h: 13, beat: "0.85s", delay: "-0.40s" },
    { h: 9, beat: "1.10s", delay: "-0.75s" },
    { h: 15, beat: "1.00s", delay: "-0.10s" },
    { h: 8, beat: "1.25s", delay: "-0.55s" },
    { h: 12, beat: "0.90s", delay: "-0.30s" },
    { h: 6, beat: "1.20s", delay: "-0.70s" },
    { h: 11, beat: "1.05s", delay: "-0.45s" },
    { h: 7, beat: "0.95s", delay: "-0.05s" },
];

export const SoundtrackLevels: Component<{ playing: () => boolean }> = (props) => (
    <Show when={props.playing()}>
        {/* clears the control bar by riding the same offset it does: a fixed value would drift
            wherever a home indicator pushes the bar up */}
        <div
            class="pointer-events-none absolute inset-x-0 z-raised flex justify-center"
            style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom) + 3.5rem)" }}
        >
            {/* no plate behind it: a drop shadow is what keeps the bars legible over a light
                section, and it costs nothing of the work underneath */}
            <div class="flex items-end gap-1 [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.55))]">
                <For each={LEVELS}>
                    {(bar) => (
                        <span
                            class="bed-level w-[3px] rounded-full bg-white/60"
                            style={{
                                height: `${bar.h}px`,
                                "--bed-beat": bar.beat,
                                "animation-delay": bar.delay,
                            }}
                        />
                    )}
                </For>
            </div>
        </div>
    </Show>
);

export const NarrationCaption: Component<{
    caption: () => { words: string[]; at: number } | null;
}> = (props) => (
    <Show when={props.caption()}>
        {(c) => (
            <div class="pointer-events-none absolute inset-x-0 bottom-24 z-raised flex justify-center px-6">
                <p class="max-w-3xl rounded-xl bg-black/55 px-4 py-2.5 text-center text-[17px] leading-snug text-white/70 backdrop-blur-sm">
                    <For each={c().words}>
                        {(word, i) => (
                            <span classList={{ "text-white": i() === c().at }}>{word} </span>
                        )}
                    </For>
                </p>
            </div>
        )}
    </Show>
);
