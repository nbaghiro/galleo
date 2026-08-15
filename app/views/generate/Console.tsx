import type { Component } from "solid-js";
import { createEffect, createSignal, For, Show } from "solid-js";
import { Button, Eyebrow, Spinner } from "@ui/button";
import { TextArea } from "@ui/inputs";
import { busy, sendChat, stopChat, thread } from "@app/stores/chat";
import { builtCount, gen, pauseBuild, runLocked } from "@app/stores/generate";
import { VoiceInput } from "@app/components/VoiceInput";
import { MessageView } from "@app/views/ChatPanel";

const PLAN_HINTS = [
    "Add a pricing section after the traction one",
    "The middle drags, cut a beat",
    "Move the ask to the end",
    "What's this arc still missing?",
];
const WRITTEN_HINTS = [
    "Make this section a three-stat row",
    "Tighten the opening, it runs long",
    "Add a section on pricing after this one",
    "What's this piece still missing?",
];

const StopToChat: Component = () => (
    <Button
        variant="outline"
        size="sm"
        class="flex-none whitespace-nowrap"
        title="Stop after this section, then ask for anything"
        onClick={pauseBuild}
    >
        Stop to chat
    </Button>
);

export const Console: Component<{ active?: boolean }> = (props) => {
    const [draft, setDraft] = createSignal("");
    let feed!: HTMLDivElement;
    let field!: HTMLTextAreaElement;

    createEffect(() => {
        const tick = thread.messages.reduce(
            (n, m) => n + m.blocks.reduce((k, b) => k + (b.k === "text" ? b.text.length : 1), 0),
            thread.messages.length,
        );
        void tick;
        void busy();
        void props.active; // hidden while the brief holds the rail: re-pin on the way back
        queueMicrotask(() => feed?.scrollTo({ top: feed.scrollHeight }));
    });

    // a run in flight owns the outline and the sections; a change asked for mid-write would land
    // against a document that is still moving, so the console waits for the boundary
    const locked = runLocked;

    const send = (): void => {
        const t = draft().trim();
        if (!t || busy() || locked()) return;
        setDraft("");
        void sendChat(t);
    };

    // before anything is written the useful asks are about the arc, not the prose
    const hints = (): string[] => (builtCount() > 0 ? WRITTEN_HINTS : PLAN_HINTS);

    const focusLabel = (): string => {
        const id = gen.selectedBeat;
        if (!id) return "the whole piece";
        return gen.beats.find((b) => b.id === id)?.label ?? "the selected section";
    };

    return (
        <div class="flex min-h-0 flex-1 flex-col border-t border-line">
            <div class="flex flex-none items-center justify-between px-3 pt-2">
                <Eyebrow weight="normal" tracking="widest">
                    Console
                </Eyebrow>
                <span class="truncate font-mono text-[9px] uppercase tracking-wide text-muted">
                    on {focusLabel()}
                </span>
            </div>
            <div ref={feed} class="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2">
                <Show
                    when={thread.messages.length}
                    fallback={
                        <div class="flex flex-col gap-1.5">
                            <p class="text-[11.5px] leading-snug text-muted">
                                Ask for anything, any time. Changes arrive as proposals you apply,
                                to the outline before it's written, to the words after.
                            </p>
                            <For each={hints()}>
                                {(h) => (
                                    <button
                                        class="rounded-md border border-line px-2 py-1 text-left text-[11.5px] text-soft transition-colors hover:border-accent hover:text-ink disabled:opacity-45 disabled:hover:border-line disabled:hover:text-soft"
                                        disabled={busy() || locked()}
                                        onClick={() => void sendChat(h)}
                                    >
                                        {h}
                                    </button>
                                )}
                            </For>
                        </div>
                    }
                >
                    <For each={thread.messages}>{(m) => <MessageView m={m} />}</For>
                </Show>
            </div>
            {/* `relative` anchors the mic's live-transcript overlay across the whole composer */}
            <div class="relative flex-none border-t border-line p-2">
                <TextArea
                    ref={field}
                    rows={2}
                    rounded="md"
                    disabled={locked()}
                    placeholder={locked() ? "Writing sections…" : "Ask for a change…"}
                    value={draft()}
                    onChange={setDraft}
                    onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                />
                <div class="mt-1.5 flex items-center justify-between gap-2">
                    <span class="min-w-0 flex-1 truncate font-mono text-[9.5px] uppercase tracking-wide text-muted">
                        <Show when={busy() || locked()} fallback="↵ to send">
                            <span class="flex items-center gap-1.5 text-accent">
                                <Spinner size={10} />
                                {locked() ? "writing sections" : "working"}
                            </span>
                        </Show>
                    </span>
                    <Show when={!locked()} fallback={<StopToChat />}>
                        {/* send() refuses while busy/locked, so a mid-turn dictation stays a draft */}
                        <VoiceInput
                            field={() => field}
                            value={draft}
                            setValue={setDraft}
                            onAutoSend={send}
                        />
                        <Show
                            when={!busy()}
                            fallback={
                                <Button variant="ghost" size="sm" onClick={stopChat}>
                                    Stop
                                </Button>
                            }
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!draft().trim()}
                                onClick={send}
                            >
                                Send
                            </Button>
                        </Show>
                    </Show>
                </div>
            </div>
        </div>
    );
};
