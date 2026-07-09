import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { sectionRegionId } from "@model/target";
import { Button, Chip, Eyebrow, Spinner } from "@ui/button";
import { content, currentArtifactId, regions } from "../editor";
import { Icon } from "@ui/icons";
import { FloatingPanel } from "@ui/overlay";
import { TextArea } from "@ui/inputs";
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
                <FloatingPanel
                    ref={panel}
                    rounded="2xl"
                    pad="md"
                    class="absolute z-30 w-[420px] max-w-[80vw] -translate-x-1/2"
                    style={{
                        left: `${b().x + b().w / 2}px`,
                        top: `${b().y + b().h + 12}px`,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                >
                    <div class="mb-2 flex items-center justify-between px-1">
                        <span class="flex items-center gap-1.5 text-soft">
                            <Icon name="sparkle" size={13} />
                            <Eyebrow tone="soft" mono={false}>
                                Generate a section here
                            </Eyebrow>
                        </span>
                        <button
                            class="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-accent disabled:opacity-50"
                            onClick={() => void refine()}
                            disabled={loading()}
                            title="Suggest sections from this artifact's content"
                        >
                            <Show when={loading()} fallback={<Icon name="sparkle" size={11} />}>
                                <Spinner size={12} tone="accent" />
                            </Show>
                            {refined() ? "Refresh ideas" : "Suggest from this"}
                        </button>
                    </div>
                    <TextArea
                        ref={field}
                        rounded="lg"
                        rows={2}
                        value={text()}
                        onChange={setText}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        placeholder="Describe the section to add — it'll fit the story around it…"
                        class="resize-none placeholder:text-soft"
                    />
                    <div class="mt-2 flex flex-wrap gap-1.5">
                        <For each={chips()}>
                            {(c) => (
                                <Chip
                                    variant="outline"
                                    onClick={() => {
                                        setText(c);
                                        field?.focus();
                                    }}
                                >
                                    {c}
                                </Chip>
                            )}
                        </For>
                    </div>
                    <div class="mt-2.5 flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => closeSectionGen()}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={!text().trim()}
                            onClick={submit}
                        >
                            <Icon name="sparkle" size={13} /> Generate
                        </Button>
                    </div>
                </FloatingPanel>
            )}
        </Show>
    );
};
