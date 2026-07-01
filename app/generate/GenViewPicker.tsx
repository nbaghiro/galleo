import type { Component } from "solid-js";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
    GEN_VIEW_DESC,
    GEN_VIEW_LABEL,
    GEN_VIEWS,
    type GenView,
    genView,
    setGenView,
} from "./genView";

// The hidden generation-view picker — drop it inside the intake + build screens (it inherits their theme).
// Open with the backtick (`) key, or ⌃` / ⌃⌥V even while a field is focused. Choose a direction
// (click · 1–3 · ↑↓+Enter) to switch + flash a confirmation. No visible trigger.
export const GenViewPicker: Component = () => {
    const [open, setOpen] = createSignal(false);
    const [cursor, setCursor] = createSignal(0);
    const [toast, setToast] = createSignal("");
    let toastTimer = 0;

    const flash = (label: string): void => {
        setToast(label);
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => setToast(""), 1600);
    };
    const pick = (v: GenView): void => {
        setGenView(v);
        setOpen(false);
        flash(`Switched to ${GEN_VIEW_LABEL[v]}`);
    };
    const reveal = (): void => {
        (document.activeElement as HTMLElement | null)?.blur(); // so number/arrow keys don't hit a field
        setCursor(GEN_VIEWS.indexOf(genView()));
        setOpen(true);
    };

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            const backtick = e.key === "`";
            const combo = e.key.toLowerCase() === "v" && e.altKey && (e.ctrlKey || e.metaKey);
            const toggleKey = backtick || combo;
            if (open()) {
                if (e.key === "Escape" || toggleKey) {
                    e.preventDefault();
                    setOpen(false);
                } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => (c + 1) % GEN_VIEWS.length);
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => (c - 1 + GEN_VIEWS.length) % GEN_VIEWS.length);
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    pick(GEN_VIEWS[cursor()]!);
                } else if (Number(e.key) >= 1 && Number(e.key) <= GEN_VIEWS.length) {
                    e.preventDefault();
                    pick(GEN_VIEWS[Number(e.key) - 1]!);
                }
                return;
            }
            const tag = (e.target as HTMLElement | null)?.tagName;
            const typing = tag === "INPUT" || tag === "TEXTAREA";
            // plain ` opens when not typing; ⌃` (or ⌃⌥V) opens even inside a field
            if ((backtick && (e.ctrlKey || !typing)) || combo) {
                e.preventDefault();
                reveal();
            }
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    return (
        <>
            <Show when={toast()}>
                <div class="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-accent/40 bg-panel px-4 py-2 font-mono text-[12px] text-ink shadow-lg">
                    {toast()}
                </div>
            </Show>
            <Show when={open()}>
                <div
                    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                >
                    <div
                        class="w-[340px] rounded-2xl border border-line bg-panel p-2 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div class="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                            Generation view
                        </div>
                        <For each={GEN_VIEWS}>
                            {(v, i) => (
                                <button
                                    class={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                                        i() === cursor() ? "bg-accent/12" : "hover:bg-canvas"
                                    }`}
                                    onMouseEnter={() => setCursor(i())}
                                    onClick={() => pick(v)}
                                >
                                    <span
                                        class={`grid h-6 w-6 flex-none place-items-center rounded-md border text-[11px] font-bold ${
                                            v === genView()
                                                ? "border-accent bg-accent text-onaccent"
                                                : "border-line text-muted"
                                        }`}
                                    >
                                        {v === genView() ? "✓" : i() + 1}
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span class="block text-[13px] font-semibold text-ink">
                                            {GEN_VIEW_LABEL[v]}
                                        </span>
                                        <span class="block truncate text-[11px] text-muted">
                                            {GEN_VIEW_DESC[v]}
                                        </span>
                                    </span>
                                    <Show when={v === genView()}>
                                        <span class="flex-none font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
                                            current
                                        </span>
                                    </Show>
                                </button>
                            )}
                        </For>
                        <div class="px-3 pb-1 pt-1.5 font-mono text-[10px] text-muted">
                            ↑↓ or 1–{GEN_VIEWS.length} · Enter to pick · Esc
                        </div>
                    </div>
                </div>
            </Show>
        </>
    );
};
