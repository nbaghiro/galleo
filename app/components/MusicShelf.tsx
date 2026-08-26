import type { Component } from "solid-js";
import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { MusicPresetInfo, WorkspaceBed } from "@model/speech";
import { Button, IconButton, Spinner } from "@ui/button";
import { Icon } from "@ui/icons";
import { TextField } from "@ui/inputs";
import { api } from "@app/api";

// The workspace's music, the same surface its voices have: what it keeps, which one a new piece
// reaches for, and a way to commission another. A bed differs from a voice in one way that shows
// here: a workspace may keep none, because a piece with no bed simply plays no music.

const Row: Component<{
    bed: WorkspaceBed;
    playing: boolean;
    onPlay: (bed: WorkspaceBed) => void;
    onChange: (beds: WorkspaceBed[]) => void;
    onError: (message: string) => void;
}> = (props) => {
    const [renaming, setRenaming] = createSignal(false);
    const [draft, setDraft] = createSignal(props.bed.name);

    const run = async (fn: () => Promise<WorkspaceBed[]>): Promise<void> => {
        try {
            props.onChange(await fn());
        } catch (e) {
            props.onError(e instanceof Error ? e.message : "That change did not save.");
        }
    };

    return (
        <div class="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0">
            <IconButton
                size="sm"
                rounded="full"
                tone="muted"
                class="flex-none"
                title={props.playing ? `Stop ${props.bed.name}` : `Play ${props.bed.name}`}
                onClick={() => props.onPlay(props.bed)}
            >
                <Icon name={props.playing ? "pause" : "play"} size={13} />
            </IconButton>

            <div class="min-w-0 flex-1">
                <Show
                    when={renaming()}
                    fallback={
                        <div class="flex items-center gap-2">
                            <span class="truncate text-[13px] text-ink">{props.bed.name}</span>
                            <Show when={props.bed.isDefault}>
                                <span class="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent">
                                    Default
                                </span>
                            </Show>
                        </div>
                    }
                >
                    <form
                        class="flex items-center gap-1.5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setRenaming(false);
                            void run(() => api.patchBed(props.bed.id, { name: draft() }));
                        }}
                    >
                        <TextField
                            class="flex-1"
                            value={draft()}
                            onChange={setDraft}
                            aria-label="Name for this music"
                        />
                        <Button type="submit" variant="outline" size="sm">
                            Save
                        </Button>
                    </form>
                </Show>
                <Show when={!renaming()}>
                    <p class="mt-0.5 truncate text-[11px] text-muted">
                        {Math.round(props.bed.ms / 1000)}s · loops while a piece is presented
                    </p>
                </Show>
            </div>

            <Show when={!props.bed.isDefault}>
                <Button
                    size="sm"
                    variant="outline"
                    title="Use this for pieces that pick none of their own"
                    onClick={() =>
                        void run(() => api.patchBed(props.bed.id, { makeDefault: true }))
                    }
                >
                    Make default
                </Button>
            </Show>
            <IconButton
                size="sm"
                rounded="md"
                tone="muted"
                title="Rename"
                onClick={() => setRenaming((v) => !v)}
            >
                <Icon name="edit" size={13} />
            </IconButton>
            <IconButton
                size="sm"
                rounded="md"
                tone="muted"
                title="Remove"
                onClick={() => void run(() => api.removeBed(props.bed.id))}
            >
                <Icon name="trash" size={13} />
            </IconButton>
        </div>
    );
};

export const MusicShelf: Component = () => {
    const [shelf, { mutate }] = createResource(() => api.musicShelf());
    const [presets] = createResource(() => api.musicPresets());
    const [error, setError] = createSignal<string | null>(null);
    const [busy, setBusy] = createSignal<string | null>(null);
    const [adding, setAdding] = createSignal(false);
    const [described, setDescribed] = createSignal("");
    const [playing, setPlaying] = createSignal<string | null>(null);

    let audio: HTMLAudioElement | undefined;
    const play = (bed: WorkspaceBed): void => {
        audio ??= new Audio();
        if (playing() === bed.id) {
            audio.pause();
            setPlaying(null);
            return;
        }
        audio.pause();
        audio.src = bed.url;
        audio.onended = () => setPlaying(null);
        void audio
            .play()
            .then(() => setPlaying(bed.id))
            .catch(() => setError("That music could not be played."));
    };
    onCleanup(() => audio?.pause());

    const list = (): WorkspaceBed[] => shelf() ?? [];
    const onShelf = (presetId: string): boolean => list().some((b) => b.preset === presetId);

    const run = async (key: string, fn: () => Promise<WorkspaceBed[]>): Promise<void> => {
        if (busy()) return;
        setBusy(key);
        setError(null);
        try {
            mutate(await fn());
            setAdding(false);
            setDescribed("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "That music could not be made.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div class="rounded-xl border border-line bg-panel p-4">
            <p class="mb-3 text-[12px] leading-snug text-muted">
                The music that plays under a piece while it is presented. Any artifact can use a
                different one, or none.
            </p>
            <Show when={error()}>
                <p class="mb-2 text-[12px] text-fail">{error()}</p>
            </Show>

            <Show
                when={list().length}
                fallback={
                    <p class="mb-3 text-[13px] text-muted">
                        No music yet. Add some to play it under a presentation.
                    </p>
                }
            >
                <For each={list()}>
                    {(bed) => (
                        <Row
                            bed={bed}
                            playing={playing() === bed.id}
                            onPlay={play}
                            onChange={mutate}
                            onError={setError}
                        />
                    )}
                </For>
            </Show>

            <Show
                when={adding()}
                fallback={
                    <Button variant="outline" class="mt-3" onClick={() => setAdding(true)}>
                        Add music
                    </Button>
                }
            >
                <div class="mt-3 rounded-xl border border-line bg-canvas p-3">
                    <div class="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                        Pick one
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <For each={presets() ?? []}>
                            {(preset: MusicPresetInfo) => (
                                <Button
                                    variant="tool"
                                    size="sm"
                                    disabled={!!busy() || onShelf(preset.id)}
                                    title={preset.description}
                                    onClick={() =>
                                        void run(preset.id, () => api.shelveBed(preset.id))
                                    }
                                >
                                    <Show when={busy() === preset.id}>
                                        <Spinner size={12} tone="current" />
                                    </Show>
                                    {onShelf(preset.id) ? `${preset.name} ✓` : preset.name}
                                </Button>
                            )}
                        </For>
                    </div>

                    <div class="mb-2 mt-4 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                        Or describe one
                    </div>
                    <form
                        class="flex flex-col gap-2 sm:flex-row sm:items-center"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (described().trim())
                                void run("compose", () => api.composeBed(described()));
                        }}
                    >
                        <TextField
                            class="flex-1"
                            placeholder="Slow dub with a warm bassline"
                            aria-label="What the music should sound like"
                            value={described()}
                            onChange={setDescribed}
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            class="flex-none"
                            disabled={!!busy() || !described().trim()}
                        >
                            <Show when={busy() === "compose"}>
                                <Spinner size={13} tone="current" />
                            </Show>
                            {busy() === "compose" ? "Composing…" : "Compose"}
                        </Button>
                    </form>
                    <p class="mt-2 text-[11px] text-muted">
                        Writing a new piece of music uses credits. Picking one above is free after
                        the first time anyone here uses it.
                    </p>

                    <Button variant="ghost" size="sm" class="mt-2" onClick={() => setAdding(false)}>
                        Done
                    </Button>
                </div>
            </Show>
        </div>
    );
};
