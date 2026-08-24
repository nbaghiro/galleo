import type { Component } from "solid-js";
import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { LibraryVoice, WorkspaceVoice } from "@model/speech";
import { Button, IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import { TextField } from "@ui/inputs";
import { VoicePicker } from "@ui/voice-picker";
import { capture } from "@ui/analytics";
import { api } from "@app/api";

// The workspace's narration voices. Voice belongs to the workspace rather than to a person, for the
// same reason a theme does: it is how a team's work sounds, and the next person to narrate a deck
// should get it without configuring anything.

const Row: Component<{
    voice: WorkspaceVoice;
    canRemove: boolean;
    trying: boolean;
    onTry: (v: WorkspaceVoice) => void;
    onPlay: (url: string) => void;
    onChange: (voices: WorkspaceVoice[]) => void;
    onError: (message: string) => void;
}> = (props) => {
    const [renaming, setRenaming] = createSignal(false);
    const [draft, setDraft] = createSignal(props.voice.name);

    const run = async (fn: () => Promise<WorkspaceVoice[]>): Promise<void> => {
        try {
            props.onChange(await fn());
        } catch (e) {
            props.onError(e instanceof Error ? e.message : "That change did not save.");
        }
    };

    return (
        <div class="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0">
            <Show
                when={props.voice.previewUrl}
                fallback={<span class="size-7 flex-none" aria-hidden="true" />}
            >
                {(url) => (
                    <IconButton
                        size="sm"
                        rounded="full"
                        tone="muted"
                        class="flex-none"
                        title={`Play ${props.voice.name}`}
                        onClick={() => props.onPlay(url())}
                    >
                        <Icon name="play" size={13} />
                    </IconButton>
                )}
            </Show>

            <div class="min-w-0 flex-1">
                <Show
                    when={renaming()}
                    fallback={
                        <div class="flex items-center gap-2">
                            <span class="truncate text-[13px] text-ink">{props.voice.name}</span>
                            <Show when={props.voice.isDefault}>
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
                            void run(() =>
                                api.updateVoice(props.voice.id, { name: draft().trim() }),
                            );
                        }}
                    >
                        <TextField value={draft()} onChange={setDraft} />
                        <Button size="sm" type="submit">
                            Save
                        </Button>
                    </form>
                </Show>
                <Show when={props.voice.description && !renaming()}>
                    <p class="mt-0.5 truncate text-[11px] text-muted">{props.voice.description}</p>
                </Show>
            </div>

            <Button
                size="sm"
                variant="outline"
                disabled={props.trying}
                title="Hear this voice read a line, which costs a credit"
                onClick={() => props.onTry(props.voice)}
            >
                {props.trying ? "Reading…" : "Try it"}
            </Button>
            <Show when={!props.voice.isDefault}>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                        void run(() => api.updateVoice(props.voice.id, { isDefault: true }))
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
                disabled={!props.canRemove}
                title={props.canRemove ? "Remove" : "A workspace keeps at least one voice"}
                onClick={() => void run(() => api.removeVoice(props.voice.id))}
            >
                <Icon name="trash" size={13} />
            </IconButton>
        </div>
    );
};

export const VoiceShelf: Component<{ canDesign?: boolean }> = (props) => {
    const [shelf, { mutate, refetch }] = createResource(() => api.voices());
    const [picking, setPicking] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    let audio: HTMLAudioElement | undefined;
    const play = (url: string): void => {
        audio ??= new Audio();
        audio.pause();
        audio.src = url;
        void audio.play().catch(() => setError("That sample could not be played."));
    };
    onCleanup(() => audio?.pause());

    const list = (): WorkspaceVoice[] => shelf() ?? [];
    const [trying, setTrying] = createSignal<string | null>(null);

    // A provider preview is free and already on the row's play button; this one is synthesized, so
    // it is metered and deliberately a separate, named action.
    const tryVoice = async (v: WorkspaceVoice): Promise<void> => {
        setTrying(v.id);
        setError(null);
        try {
            const out = await api.auditionVoice(v.id);
            play(out.audio);
            capture("voice_auditioned", { source: v.source, kind: "own_text" });
        } catch (e) {
            setError(e instanceof Error ? e.message : "That voice could not be tried.");
        } finally {
            setTrying(null);
        }
    };

    const save = async (v: LibraryVoice, makeDefault: boolean): Promise<void> => {
        const next = await api.saveVoice({ ...v, makeDefault });
        mutate(next);
        capture("voice_saved", {
            source: "library",
            from: "settings",
            shelf_size: next.length,
            made_default: makeDefault,
        });
    };

    return (
        <>
            <div class="rounded-xl border border-line bg-panel p-4">
                <p class="mb-3 text-[12px] leading-snug text-muted">
                    The voice that reads a piece aloud when it narrates itself. Any artifact can use
                    a different one.
                </p>
                <Show when={error()}>
                    <p class="mb-2 text-[12px] text-fail">{error()}</p>
                </Show>
                <Show
                    when={list().length}
                    fallback={
                        <p class="mb-3 text-[13px] text-muted">
                            No voices yet. Add one to narrate anything.
                        </p>
                    }
                >
                    <For each={list()}>
                        {(v) => (
                            <Row
                                voice={v}
                                canRemove={list().length > 1}
                                trying={trying() === v.id}
                                onTry={(voice) => void tryVoice(voice)}
                                onPlay={(url) => {
                                    play(url);
                                    capture("voice_auditioned", {
                                        source: v.source,
                                        kind: "preview",
                                    });
                                }}
                                onChange={mutate}
                                onError={setError}
                            />
                        )}
                    </For>
                </Show>
                <Button size="sm" variant="outline" class="mt-3" onClick={() => setPicking(true)}>
                    Add a voice
                </Button>
            </div>
            <Show when={picking()}>
                <VoicePicker
                    firstVoice={list().length === 0}
                    browser={{
                        search: (q) => api.voiceLibrary(q),
                        save,
                        // hidden rather than disabled when the plan does not include it
                        ...(props.canDesign
                            ? {
                                  design: (d, t) => api.designVoice(d, t),
                                  keep: async (c, name, description, makeDefault) => {
                                      const next = await api.keepDesignedVoice({
                                          generatedVoiceId: c.generatedVoiceId,
                                          name,
                                          description,
                                          preview: c.audio,
                                          makeDefault,
                                      });
                                      mutate(next);
                                      capture("voice_designed", { kept: true, attempt: 1 });
                                      capture("voice_saved", {
                                          source: "designed",
                                          from: "settings",
                                          shelf_size: next.length,
                                          made_default: makeDefault,
                                      });
                                  },
                              }
                            : {}),
                    }}
                    onClose={() => {
                        setPicking(false);
                        void refetch();
                    }}
                />
            </Show>
        </>
    );
};
