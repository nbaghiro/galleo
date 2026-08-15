import type { Component } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import { isCoarsePointer } from "@ui/viewport";
import { api } from "@app/api";
import type { TranscriptState, VoiceSession, VoiceStatus } from "./voice";
import { emptyTranscript, insertDictation, startVoiceSession, voiceSupported } from "./voice";

const STATUS_LABEL: Record<VoiceStatus, string> = {
    permission: "Allow microphone",
    connecting: "Connecting",
    listening: "Listening",
    finishing: "Finishing",
};

// probed once per app session; the mic only renders where dictation can actually work
let probe: Promise<boolean> | undefined;
const voiceAvailable = (): Promise<boolean> =>
    (probe ??= voiceSupported()
        ? api
              .voiceStatus()
              .then((r) => r.ready)
              .catch(() => false)
        : Promise.resolve(false));

/**
 * Hold-to-talk dictation for a textarea composer. Renders the mic button plus a live-transcript
 * overlay; the overlay positions against the nearest `relative` ancestor (the composer block),
 * so it spans the full composer width on every screen size.
 */
export const VoiceInput: Component<{
    field: () => HTMLTextAreaElement | undefined;
    value: () => string;
    setValue: (v: string) => void;
    /** Walkie-talkie mode: release submits the composed draft instead of leaving it to edit. */
    onAutoSend?: () => void;
}> = (props) => {
    const [ready, setReady] = createSignal(false);
    const [session, setSession] = createSignal<VoiceSession | null>(null);
    const [status, setStatus] = createSignal<VoiceStatus | null>(null);
    const [transcript, setTranscript] = createSignal<TranscriptState>(emptyTranscript());
    const [error, setError] = createSignal<string | null>(null);
    const [hint, setHint] = createSignal(false);
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    let heldAt = 0;

    onMount(() => void voiceAvailable().then(setReady));
    onCleanup(() => {
        clearTimeout(errorTimer);
        session()?.cancel();
    });

    const reset = (): void => {
        setSession(null);
        setStatus(null);
    };

    const insert = (text: string): void => {
        if (!text) return;
        const el = props.field();
        const at = el?.selectionStart ?? props.value().length;
        const { value, caret } = insertDictation(props.value(), at, text);
        props.setValue(value);
        queueMicrotask(() => {
            el?.focus();
            el?.setSelectionRange(caret, caret);
        });
    };

    const start = (): void => {
        if (session()) return;
        clearTimeout(errorTimer);
        setError(null);
        setHint(false);
        heldAt = Date.now();
        setTranscript(emptyTranscript());
        const el = props.field();
        const caret = el?.selectionStart ?? props.value().length;
        setSession(
            startVoiceSession({
                previousText: props.value().slice(Math.max(0, caret - 500), caret) || undefined,
                onStatus: setStatus,
                onTranscript: setTranscript,
                onDone: (text) => {
                    reset();
                    if (text) {
                        insert(text);
                        // setValue is synchronous, so the submit reads the spliced draft
                        props.onAutoSend?.();
                    } else if (Date.now() - heldAt < 600) {
                        // a bare tap: teach the gesture instead of silently doing nothing
                        setHint(true);
                        errorTimer = setTimeout(() => setHint(false), 3000);
                    }
                },
                onError: (message) => {
                    reset();
                    setError(message);
                    errorTimer = setTimeout(() => setError(null), 4000);
                },
            }),
        );
    };

    const release = (): void => session()?.stop();
    const abort = (): void => {
        session()?.cancel();
        reset();
    };

    // Escape while holding abandons the dictation instead of committing it
    createEffect(() => {
        if (!session()) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                e.preventDefault();
                abort();
            }
        };
        document.addEventListener("keydown", onKey, true);
        onCleanup(() => document.removeEventListener("keydown", onKey, true));
    });

    return (
        <Show when={ready()}>
            <Show when={session() || error() || hint()}>
                <div class="absolute inset-x-3 bottom-full z-20 mb-2 rounded-xl border border-line bg-panel p-3 shadow-xl">
                    <Show
                        when={session()}
                        fallback={
                            <p
                                class="text-[12px] leading-snug"
                                classList={{
                                    "text-[#e5484d]": !!error(),
                                    "text-muted": !error(),
                                }}
                            >
                                {error() ?? "Hold the mic while you speak — release to insert."}
                            </p>
                        }
                    >
                        <div class="flex items-center gap-1.5">
                            <span
                                class="size-1.5 rounded-full bg-accent motion-safe:animate-pulse"
                                classList={{ "opacity-40": status() !== "listening" }}
                            />
                            <span class="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                                {STATUS_LABEL[status() ?? "connecting"]}
                            </span>
                            <span class="ml-auto font-mono text-[9.5px] text-muted">
                                release to insert · esc cancels
                            </span>
                        </div>
                        <Show when={transcript().committed.length || transcript().partial}>
                            {/* column-reverse keeps the newest words pinned to the bottom edge */}
                            <div class="mt-2 flex max-h-36 flex-col-reverse overflow-y-auto">
                                <p class="text-[13px] leading-relaxed text-ink">
                                    {transcript().committed.join(" ")}
                                    <Show when={transcript().partial}>
                                        <span class="text-soft">
                                            {transcript().committed.length ? " " : ""}
                                            {transcript().partial}
                                        </span>
                                    </Show>
                                </p>
                            </div>
                        </Show>
                    </Show>
                </div>
            </Show>
            <IconButton
                size={isCoarsePointer() ? "touch" : "sm"}
                rounded="md"
                tone={session() ? "accent" : "muted"}
                class="flex-none touch-none select-none"
                classList={{ "ring-2 ring-accent/25": !!session() }}
                title="Hold to dictate"
                onPointerDown={(e) => {
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    start();
                }}
                onPointerUp={release}
                onPointerCancel={release}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => {
                    // keyboard "clicks" (detail 0) toggle, since a keyboard cannot hold
                    if (e.detail === 0) (session() ? release : start)();
                }}
            >
                <Icon name="mic" size={14} />
            </IconButton>
        </Show>
    );
};
