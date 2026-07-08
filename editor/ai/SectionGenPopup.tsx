import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { sectionRegionId } from "@model/target";
import { content, currentArtifactId, regions } from "../editor";
import { Icon } from "../icons";
import { closeSectionGen, runSectionGen, sectionGen } from "./section-gen";
import { fetchSuggestions, suggestSections } from "./suggest";

// The anchored "generate a section here" popup — opens off the bottom edge of the section the new one will
// follow (the bottom-center pill's Generate button), takes a prompt, and hands off to runSectionGen (which
// closes this and opens the in-canvas build animation). The quick-start chips are artifact-aware: free
// deterministic gap suggestions by default, swapped for content-specific ones via the ✨ button (one cheap
// cached call). Clicking a chip prefills the prompt.

export const SectionGenPopup: Component = () => {
    const [text, setText] = createSignal("");
    const [chips, setChips] = createSignal<string[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [refined, setRefined] = createSignal(false);
    let field!: HTMLTextAreaElement;
    let panel!: HTMLDivElement;

    const showing = createMemo(() => sectionGen.stage === "prompt");

    // Content-specific suggestions on demand — one cached call per artifact; force a fresh set once refined.
    const refine = async (): Promise<void> => {
        const id = currentArtifactId();
        if (!id || loading()) return;
        setLoading(true);
        try {
            const list = await fetchSuggestions(id, content(), refined());
            if (list.length) {
                setChips(list);
                setRefined(true);
            }
        } finally {
            setLoading(false);
        }
    };

    // The box of the section the new one follows (the Generate button is always per-section, so afterId set).
    const box = createMemo(() => {
        const id = showing() ? sectionGen.afterId : null;
        if (!id) return null;
        return regions().find((r) => r.id === sectionRegionId(id))?.box ?? null;
    });

    // On each open: reset the text, seed the free deterministic suggestions, and focus the field.
    createEffect(() => {
        if (showing()) {
            setText("");
            setChips(suggestSections(content()));
            setRefined(false);
            setLoading(false);
            queueMicrotask(() => field?.focus());
        }
    });

    // Escape closes; click outside the panel closes.
    createEffect(() => {
        if (!showing()) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                e.stopPropagation();
                closeSectionGen();
            }
        };
        const onDown = (e: PointerEvent): void => {
            if (panel && !panel.contains(e.target as Node)) closeSectionGen();
        };
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("pointerdown", onDown, true);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("pointerdown", onDown, true);
        });
    });

    const submit = (): void => {
        const t = text().trim();
        if (t) void runSectionGen(t);
    };

    return (
        <Show when={showing() && box()}>
            {(b) => (
                <div
                    ref={panel}
                    class="absolute z-30 w-[420px] max-w-[80vw] -translate-x-1/2 rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur-md"
                    style={{
                        left: `${b().x + b().w / 2}px`,
                        top: `${b().y + b().h + 12}px`,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                >
                    <div class="mb-2 flex items-center justify-between px-1">
                        <span class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft">
                            <Icon name="sparkle" size={13} />
                            Generate a section here
                        </span>
                        <button
                            class="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-accent disabled:opacity-50"
                            onClick={() => void refine()}
                            disabled={loading()}
                            title="Suggest sections from this artifact's content"
                        >
                            <Show when={loading()} fallback={<Icon name="sparkle" size={11} />}>
                                <span class="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent" />
                            </Show>
                            {refined() ? "Refresh ideas" : "Suggest from this"}
                        </button>
                    </div>
                    <textarea
                        ref={field}
                        value={text()}
                        onInput={(e) => setText(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        rows={2}
                        placeholder="Describe the section to add — it'll fit the story around it…"
                        class="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] leading-snug text-ink outline-none placeholder:text-soft focus:border-accent"
                    />
                    <div class="mt-2 flex flex-wrap gap-1.5">
                        <For each={chips()}>
                            {(c) => (
                                <button
                                    class="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-soft hover:border-accent hover:text-ink"
                                    onClick={() => {
                                        setText(c);
                                        field?.focus();
                                    }}
                                >
                                    {c}
                                </button>
                            )}
                        </For>
                    </div>
                    <div class="mt-2.5 flex items-center justify-end gap-2">
                        <button
                            class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-soft hover:text-ink"
                            onClick={() => closeSectionGen()}
                        >
                            Cancel
                        </button>
                        <button
                            class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-onaccent shadow-sm disabled:opacity-40"
                            disabled={!text().trim()}
                            onClick={submit}
                        >
                            <Icon name="sparkle" size={13} /> Generate
                        </button>
                    </div>
                </div>
            )}
        </Show>
    );
};
