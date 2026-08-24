import type { Component } from "solid-js";
import { createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { DesignedCandidate, LibraryVoice, VoiceQuery } from "@model/speech";
import { designedName } from "@model/speech";
import { Modal } from "./overlay";
import { Button, Chip, IconButton } from "./button";
import { TextArea, TextField } from "./inputs";
import { Icon } from "./icons";

// The voice picker: browse the provider's community library with real filters, hear a candidate,
// and save it. Shared because both workspace settings and the editor open it, and `@ui` is the only
// layer either may reach.
//
// Browsing and playing a provider preview cost nothing, so that is all this does. Hearing a voice
// read the customer's own words happens on the shelf instead, after saving: a candidate has to be
// adopted into the account before it can speak at all, and adopting one nobody keeps would spend a
// monthly budget shared by every workspace.

/** Injected: `@ui` may not fetch. */
export interface VoiceBrowser {
    search(q: VoiceQuery): Promise<LibraryVoice[]>;
    save(v: LibraryVoice, makeDefault: boolean): Promise<void>;
    /** Absent when this plan cannot design voices, which hides the tab rather than disabling it. */
    design?(description: string, sampleText?: string): Promise<DesignedCandidate[]>;
    keep?(
        c: DesignedCandidate,
        name: string,
        description: string,
        makeDefault: boolean,
    ): Promise<void>;
    /** A real line from the open piece, so candidates audition on the actual material. */
    sampleText?: () => string | undefined;
}

// The provider's own vocabulary, so a chip round-trips into the query with nothing translated.
const GENDERS = ["female", "male", "neutral"];
const AGES = ["young", "middle_aged", "old"];
const ACCENTS = ["american", "british", "australian", "irish", "african", "indian"];
const CHARACTER = ["calm", "confident", "warm", "casual", "professional", "upbeat"];

const label = (s: string): string => s.replace(/_/g, " ");

const FilterRow: Component<{
    title: string;
    options: string[];
    value: string | undefined;
    onPick: (v: string | undefined) => void;
}> = (props) => (
    <div class="mb-2.5">
        <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {props.title}
        </div>
        <div class="flex flex-wrap gap-1.5">
            <For each={props.options}>
                {(o) => (
                    <Chip
                        size="sm"
                        rounded="full"
                        selected={props.value === o}
                        onClick={() => props.onPick(props.value === o ? undefined : o)}
                    >
                        {label(o)}
                    </Chip>
                )}
            </For>
        </div>
    </div>
);

export const VoicePicker: Component<{
    browser: VoiceBrowser;
    onClose: () => void;
    /** Shown on the save button when the shelf is empty and this one becomes the default. */
    firstVoice?: boolean;
}> = (props) => {
    const [search, setSearch] = createSignal("");
    const [gender, setGender] = createSignal<string | undefined>();
    const [age, setAge] = createSignal<string | undefined>();
    const [accent, setAccent] = createSignal<string | undefined>();
    const [descriptive, setDescriptive] = createSignal<string | undefined>();
    const [tab, setTab] = createSignal<"browse" | "design">("browse");
    const [prompt, setPrompt] = createSignal("");
    const [candidates, setCandidates] = createSignal<DesignedCandidate[]>([]);
    const [designing, setDesigning] = createSignal(false);
    const [keeping, setKeeping] = createSignal<string | null>(null);
    const [saving, setSaving] = createSignal<string | null>(null);
    const [error, setError] = createSignal<string | null>(null);

    const query = createMemo(
        (): VoiceQuery => ({
            search: search().trim() || undefined,
            gender: gender(),
            age: age(),
            accent: accent(),
            descriptive: descriptive(),
        }),
    );
    const [results] = createResource(query, (q) => props.browser.search(q));

    // one element for the whole picker, so starting a second sample stops the first
    let audio: HTMLAudioElement | undefined;
    const play = (url: string): void => {
        audio ??= new Audio();
        audio.pause();
        audio.src = url;
        void audio.play().catch(() => setError("That sample could not be played."));
    };
    onCleanup(() => audio?.pause());

    const save = async (v: LibraryVoice): Promise<void> => {
        setSaving(v.externalId);
        setError(null);
        try {
            await props.browser.save(v, !!props.firstVoice);
            props.onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "That voice could not be saved.");
        } finally {
            setSaving(null);
        }
    };

    const runDesign = async (): Promise<void> => {
        if (!props.browser.design || designing()) return;
        setDesigning(true);
        setError(null);
        setCandidates([]);
        try {
            setCandidates(
                await props.browser.design(prompt().trim(), props.browser.sampleText?.()),
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "That voice could not be designed.");
        } finally {
            setDesigning(false);
        }
    };

    const keep = async (c: DesignedCandidate): Promise<void> => {
        if (!props.browser.keep) return;
        setKeeping(c.generatedVoiceId);
        setError(null);
        try {
            await props.browser.keep(
                c,
                designedName(prompt()),
                prompt().trim(),
                !!props.firstVoice,
            );
            props.onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "That voice could not be kept.");
        } finally {
            setKeeping(null);
        }
    };

    return (
        <Modal onClose={props.onClose} size="xl">
            <div class="flex items-center justify-between border-b border-line px-5 py-3.5">
                <div>
                    <div class="text-[15px] font-semibold text-ink">Choose a voice</div>
                    <p class="text-[12px] text-muted">
                        Play a sample to hear one. Saving adds it to this workspace.
                    </p>
                </div>
                <div class="flex items-center gap-2 pr-9">
                    <Show when={props.browser.design}>
                        <div class="flex gap-1 rounded-lg bg-surface p-0.5">
                            <Chip
                                size="sm"
                                rounded="md"
                                selected={tab() === "browse"}
                                onClick={() => setTab("browse")}
                            >
                                Browse
                            </Chip>
                            <Chip
                                size="sm"
                                rounded="md"
                                selected={tab() === "design"}
                                onClick={() => setTab("design")}
                            >
                                Design
                            </Chip>
                        </div>
                    </Show>
                </div>
            </div>

            <Show when={tab() === "design"}>
                <div class="max-h-[70dvh] overflow-y-auto px-5 py-4">
                    <p class="mb-2.5 text-[12px] leading-snug text-muted">
                        Describe the voice you want. You get three takes to compare, and nothing is
                        saved until you keep one.
                    </p>
                    <TextArea
                        value={prompt()}
                        rows={3}
                        rounded="lg"
                        class="px-3 py-2 text-[13px]"
                        placeholder="A warm, unhurried British woman in her forties, documentary narrator, low pitch."
                        onChange={setPrompt}
                    />
                    <div class="mt-2 flex items-center gap-2">
                        <Button
                            size="sm"
                            disabled={designing() || prompt().trim().length < 20}
                            onClick={() => void runDesign()}
                        >
                            {designing() ? "Designing…" : "Design three voices"}
                        </Button>
                        <span class="text-[11px] text-muted">
                            {prompt().trim().length < 20
                                ? "At least 20 characters."
                                : "Costs credits."}
                        </span>
                    </div>
                    <Show when={error()}>
                        <p class="mt-3 text-[12px] text-[#e5484d]">{error()}</p>
                    </Show>
                    <div class="mt-4 grid gap-2.5 sm:grid-cols-3">
                        <For each={candidates()}>
                            {(c, i) => (
                                <div class="rounded-xl border border-line p-3">
                                    <div class="mb-2 text-[12px] font-semibold text-ink">
                                        Take {i() + 1}
                                    </div>
                                    <div class="flex gap-1.5">
                                        <IconButton
                                            size="sm"
                                            rounded="full"
                                            tone="muted"
                                            title="Play this take"
                                            onClick={() => play(c.audio)}
                                        >
                                            <Icon name="play" size={13} />
                                        </IconButton>
                                        <Button
                                            size="sm"
                                            class="flex-1"
                                            disabled={keeping() === c.generatedVoiceId}
                                            onClick={() => void keep(c)}
                                        >
                                            {keeping() === c.generatedVoiceId ? "Keeping…" : "Keep"}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            </Show>
            <div
                class="grid max-h-[70dvh] grid-cols-[210px_1fr] overflow-hidden"
                classList={{ hidden: tab() === "design" }}
            >
                <aside class="overflow-y-auto border-r border-line px-4 py-3.5">
                    <TextField
                        type="search"
                        value={search()}
                        placeholder="Search voices…"
                        class="mb-3"
                        onChange={setSearch}
                    />
                    <FilterRow
                        title="Gender"
                        options={GENDERS}
                        value={gender()}
                        onPick={setGender}
                    />
                    <FilterRow title="Age" options={AGES} value={age()} onPick={setAge} />
                    <FilterRow
                        title="Accent"
                        options={ACCENTS}
                        value={accent()}
                        onPick={setAccent}
                    />
                    <FilterRow
                        title="Character"
                        options={CHARACTER}
                        value={descriptive()}
                        onPick={setDescriptive}
                    />
                </aside>

                <div class="overflow-y-auto px-5 py-4">
                    <Show when={error()}>
                        <p class="mb-3 text-[12px] text-[#e5484d]">{error()}</p>
                    </Show>
                    <Show
                        when={!results.loading}
                        fallback={<p class="text-[13px] text-muted">Looking for voices…</p>}
                    >
                        <Show
                            when={results()?.length}
                            fallback={
                                <p class="text-[13px] text-muted">
                                    No voices match those filters. Try widening them.
                                </p>
                            }
                        >
                            <div class="grid gap-2.5 sm:grid-cols-2">
                                <For each={results()}>
                                    {(v) => (
                                        <div class="rounded-xl border border-line p-3">
                                            <div class="flex items-start justify-between gap-2">
                                                <div class="min-w-0">
                                                    <div class="truncate text-[13px] font-semibold text-ink">
                                                        {v.name}
                                                    </div>
                                                    <Show when={v.description}>
                                                        <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
                                                            {v.description}
                                                        </p>
                                                    </Show>
                                                </div>
                                                <Show when={v.previewUrl}>
                                                    {(url) => (
                                                        <IconButton
                                                            size="sm"
                                                            rounded="full"
                                                            tone="muted"
                                                            class="flex-none"
                                                            title="Play a sample"
                                                            onClick={() => play(url())}
                                                        >
                                                            <Icon name="play" size={13} />
                                                        </IconButton>
                                                    )}
                                                </Show>
                                            </div>
                                            <div class="mt-2 flex flex-wrap gap-1">
                                                <For
                                                    each={[
                                                        v.labels?.gender,
                                                        v.labels?.age,
                                                        v.labels?.accent,
                                                        v.labels?.descriptive,
                                                    ].filter(Boolean)}
                                                >
                                                    {(l) => (
                                                        <span class="rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">
                                                            {label(String(l))}
                                                        </span>
                                                    )}
                                                </For>
                                            </div>
                                            <div class="mt-2.5 flex gap-1.5">
                                                <Button
                                                    size="sm"
                                                    class="flex-1"
                                                    disabled={saving() === v.externalId}
                                                    onClick={() => void save(v)}
                                                >
                                                    {saving() === v.externalId ? "Saving…" : "Save"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </Show>
                </div>
            </div>
        </Modal>
    );
};
