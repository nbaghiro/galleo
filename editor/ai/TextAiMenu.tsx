import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { Icon } from "@ui/icons";
import { Button, Chip, Eyebrow, IconButton, Spinner } from "@ui/button";
import { FloatingPanel } from "@ui/overlay";
import { textSelection } from "../text/text-format";
import { LANGUAGES, REWRITE_PRESETS, runRewrite, runTranslate, textAssist } from "./text-assist";

// The text AI menu — the ✨ action in the text format bar. Rewrites or translates the current selection (or
// the whole field when the caret is collapsed). It captures the selection when the popover opens, so a custom
// instruction typed into its input (which steals focus from the contenteditable) still targets the right span.
// Lives inside the ContextBar (data-galleo-toolbar), so interacting here doesn't end the text edit.

type Range = { from: number; to: number };

const noBlur = (e: MouseEvent): void => e.preventDefault();

const row =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas disabled:opacity-40";

export const TextAiMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const [custom, setCustom] = createSignal("");
    const [showLangs, setShowLangs] = createSignal(false);
    // The selection snapshot taken when the menu opens (a plain ref — read at action time, not reactive).
    let captured: Range | null = null;

    const toggle = (): void => {
        if (!open()) {
            captured = textSelection();
            setCustom("");
            setShowLangs(false);
        }
        setOpen((o) => !o);
    };

    // Run an action, then close on success (leave the menu open on error so the message shows + they retry).
    const act = async (p: Promise<void>): Promise<void> => {
        await p;
        if (!textAssist.error) {
            setOpen(false);
            setCustom("");
        }
    };

    const busy = (): boolean => textAssist.busy;

    return (
        <div class="relative">
            <IconButton
                auto
                size="md"
                rounded="md"
                tone="ink"
                active={open()}
                title="Edit with AI"
                onMouseDown={noBlur}
                onClick={toggle}
            >
                <Icon name="sparkle" size={15} />
            </IconButton>
            <Show when={open()}>
                <FloatingPanel
                    rounded="xl"
                    pad="sm"
                    class="absolute left-1/2 top-full z-50 mt-2 max-h-[340px] w-64 -translate-x-1/2 overflow-y-auto"
                >
                    {/* custom instruction */}
                    <div class="flex items-center gap-1 rounded-lg border border-line bg-canvas px-2 py-1 focus-within:border-accent">
                        <Icon name="sparkle" size={13} />
                        <input
                            class="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
                            placeholder="Tell the AI to edit…"
                            value={custom()}
                            disabled={busy()}
                            onInput={(e) => setCustom(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && custom().trim()) {
                                    e.preventDefault();
                                    void act(runRewrite(custom().trim(), captured));
                                }
                            }}
                        />
                        <Show when={custom().trim()}>
                            <Button
                                variant="primary"
                                size="sm"
                                class="flex-none"
                                disabled={busy()}
                                onMouseDown={noBlur}
                                onClick={() => void act(runRewrite(custom().trim(), captured))}
                            >
                                <Icon name="chevronRight" size={13} />
                            </Button>
                        </Show>
                    </div>

                    <Show when={busy()}>
                        <div class="flex items-center gap-2 px-2 py-1.5 text-[11.5px] text-soft">
                            <Spinner size={12} tone="accent" />
                            Working…
                        </div>
                    </Show>
                    <Show when={!busy() && textAssist.error}>
                        <div class="px-2 py-1.5 text-[11.5px] text-[#e5484d]">
                            {textAssist.error}
                        </div>
                    </Show>

                    {/* rewrite presets */}
                    <Eyebrow as="div" mono={false} class="px-2 pb-0.5 pt-1.5">
                        Rewrite
                    </Eyebrow>
                    <For each={REWRITE_PRESETS}>
                        {(p) => (
                            <button
                                class={row}
                                disabled={busy()}
                                onMouseDown={noBlur}
                                onClick={() => void act(runRewrite(p.instruction, captured))}
                            >
                                {p.label}
                            </button>
                        )}
                    </For>

                    {/* translate */}
                    <button
                        class={row}
                        disabled={busy()}
                        onMouseDown={noBlur}
                        onClick={() => setShowLangs((v) => !v)}
                    >
                        <span class="flex-1">Translate to…</span>
                        <Icon name={showLangs() ? "chevronDown" : "chevronRight"} size={13} />
                    </button>
                    <Show when={showLangs()}>
                        <div class="flex flex-wrap gap-1 px-2 pb-1 pt-0.5">
                            <For each={LANGUAGES}>
                                {(l) => (
                                    <Chip
                                        variant="outline"
                                        disabled={busy()}
                                        onMouseDown={noBlur}
                                        onClick={() => void act(runTranslate(l, captured))}
                                    >
                                        {l}
                                    </Chip>
                                )}
                            </For>
                        </div>
                    </Show>
                </FloatingPanel>
            </Show>
        </div>
    );
};
