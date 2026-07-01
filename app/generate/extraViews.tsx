import type { Component } from "solid-js";
import { createEffect, createSignal, For, Show } from "solid-js";
import { BuildCanvas } from "./BuildCanvas";
import { doneBeats, gen } from "./session";
import { reduced, TypingLine } from "./typing";

// ── HUD: full-bleed canvas + viewfinder brackets + a frosted-glass widget (beat segments + narration) ──
export const HudCanvas: Component = () => {
    const [open, setOpen] = createSignal(true);
    return (
        <div class="relative h-full w-full overflow-hidden">
            <div class="absolute inset-0">
                <BuildCanvas />
            </div>
            <div class="pointer-events-none absolute left-3 top-3 z-20 h-6 w-6 rounded-[2px] border-l-2 border-t-2 border-accent/50" />
            <div class="pointer-events-none absolute right-3 top-3 z-20 h-6 w-6 rounded-[2px] border-r-2 border-t-2 border-accent/50" />
            <div class="pointer-events-none absolute bottom-3 left-3 z-20 h-6 w-6 rounded-[2px] border-b-2 border-l-2 border-accent/50" />
            <div class="pointer-events-none absolute right-4 top-4 z-20 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {gen.format}.galleo · live
            </div>
            <Show when={open()} fallback={<HudHandle onOpen={() => setOpen(true)} />}>
                <div class="absolute bottom-5 right-5 z-20 w-[360px] rounded-xl border border-accent/35 bg-panel/70 p-3 shadow-2xl backdrop-blur-xl">
                    <HudSegs onClose={() => setOpen(false)} />
                    <HudNarr />
                </div>
            </Show>
        </div>
    );
};

const HudHandle: Component<{ onOpen: () => void }> = (props) => {
    const done = doneBeats;
    return (
        <button
            class="absolute bottom-5 right-5 z-20 flex items-center gap-2 rounded-full border border-accent/35 bg-panel/70 px-3.5 py-2 font-mono text-[11px] text-soft shadow-2xl backdrop-blur-xl transition hover:text-ink"
            title="Show HUD"
            onClick={props.onOpen}
        >
            <Show when={gen.phase === "building"}>
                <span class="h-2 w-2 animate-pulse rounded-full bg-accent" />
            </Show>
            <span class="text-accent">galleo@agent</span>
            <span>
                · beat {done()}/{gen.beats.length}
            </span>
            <span class="text-accent">▴</span>
        </button>
    );
};

const HudSegs: Component<{ onClose: () => void }> = (props) => {
    const done = doneBeats;
    return (
        <div class="mb-2.5">
            <div class="mb-2 flex gap-1">
                <For each={gen.beats}>
                    {(b) => (
                        <div
                            class={`h-1 flex-1 rounded-full ${
                                b.status === "done"
                                    ? "bg-accent"
                                    : b.status === "active"
                                      ? "animate-pulse bg-accent/60"
                                      : "bg-line"
                            }`}
                        />
                    )}
                </For>
            </div>
            <div class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <span class="flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> galleo@agent
                </span>
                <span class="flex items-center gap-2">
                    <span>
                        beat {done()}/{gen.beats.length}
                    </span>
                    <button
                        class="grid h-[18px] w-[18px] place-items-center rounded text-[12px] transition hover:bg-canvas hover:text-ink"
                        title="Hide"
                        onClick={props.onClose}
                    >
                        ✕
                    </button>
                </span>
            </div>
        </div>
    );
};

const HudNarr: Component = () => {
    let scroll!: HTMLDivElement;
    createEffect(() => {
        const n = gen.narration.length;
        queueMicrotask(() => {
            if (n >= 0)
                scroll?.scrollTo({
                    top: scroll.scrollHeight,
                    behavior: reduced() ? "auto" : "smooth",
                });
        });
    });
    return (
        <div
            ref={scroll}
            class="max-h-[120px] overflow-y-auto font-mono text-[11px] leading-relaxed"
        >
            <For each={gen.narration}>
                {(line) => (
                    <div class={`flex gap-2 ${line.done ? "opacity-45" : "opacity-100"}`}>
                        <span class="flex-none text-accent">›</span>
                        <span class="min-w-0 flex-1 text-ink">
                            <Show when={line.done} fallback={<TypingLine text={line.text} />}>
                                {line.text}
                            </Show>
                            <Show when={line.mono}>
                                <span class="text-accent">{line.mono}</span>
                            </Show>
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
};
