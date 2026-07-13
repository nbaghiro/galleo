import type { Component } from "solid-js";
import { createEffect, createSignal, For, Show } from "solid-js";
import { Icon } from "@ui/icons";
import { Chip, Eyebrow, IconButton, Spinner } from "@ui/button";
import { FloatingPanel } from "@ui/overlay";
import { textSelection } from "../text/text-format";
import {
    LANGUAGES,
    REWRITE_PRESETS,
    runRegenerate,
    runRewrite,
    runTranslate,
    textAssist,
} from "./text-assist";

type Range = { from: number; to: number };

const noBlur = (e: MouseEvent): void => e.preventDefault();

export const TextAiMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const [prompt, setPrompt] = createSignal("");
    // selection snapshot at open — a plain ref, read at action time, not reactive
    let captured: Range | null = null;
    let field: HTMLInputElement | undefined;

    const toggle = (): void => {
        if (!open()) {
            captured = textSelection();
            setPrompt("");
        }
        setOpen((o) => !o);
    };

    createEffect(() => {
        if (open()) queueMicrotask(() => field?.focus());
    });

    // close on success; leave the panel open on error so the message shows
    const act = async (p: Promise<void>): Promise<void> => {
        await p;
        if (!textAssist.error) {
            setOpen(false);
            setPrompt("");
        }
    };

    const busy = (): boolean => textAssist.busy;
    const submit = (): void => {
        const t = prompt().trim();
        if (t) void act(runRewrite(t, captured));
    };

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
                    class="absolute right-0 top-full z-overlay mt-2 max-h-[400px] w-72 overflow-y-auto"
                >
                    <div class="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1.5 focus-within:border-accent">
                        <Icon name="sparkle" size={14} />
                        <input
                            ref={field}
                            class="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
                            placeholder="Describe an edit…"
                            value={prompt()}
                            disabled={busy()}
                            onInput={(e) => setPrompt(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                        />
                        <Show when={prompt().trim()}>
                            <IconButton
                                size="sm"
                                rounded="md"
                                tone="accent"
                                title="Apply"
                                disabled={busy()}
                                onMouseDown={noBlur}
                                onClick={submit}
                            >
                                <Icon name="chevronRight" size={14} />
                            </IconButton>
                        </Show>
                    </div>

                    <Show when={busy()}>
                        <div class="flex items-center gap-2 px-1 py-2 text-[11.5px] text-soft">
                            <Spinner size={12} tone="accent" />
                            Working…
                        </div>
                    </Show>
                    <Show when={!busy() && textAssist.error}>
                        <div class="px-1 py-2 text-[11.5px] text-[#e5484d]">{textAssist.error}</div>
                    </Show>

                    <button
                        class="mt-2 flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[12.5px] font-medium text-ink transition-colors hover:border-accent hover:bg-canvas disabled:opacity-40"
                        disabled={busy()}
                        onMouseDown={noBlur}
                        onClick={() => void act(runRegenerate())}
                    >
                        <Icon name="sparkle" size={14} />
                        Regenerate whole text
                    </button>

                    <Eyebrow as="div" mono={false} class="px-0.5 pb-1.5 pt-2.5">
                        Shortcuts
                    </Eyebrow>
                    <div class="flex flex-wrap gap-1">
                        <For each={REWRITE_PRESETS}>
                            {(p) => (
                                <Chip
                                    variant="outline"
                                    disabled={busy()}
                                    title={p.instruction}
                                    onMouseDown={noBlur}
                                    onClick={() => void act(runRewrite(p.instruction, captured))}
                                >
                                    {p.label}
                                </Chip>
                            )}
                        </For>
                    </div>

                    {/* block wrapper so the top margin + divider apply (Separator is inline, drops vertical margins) */}
                    <div class="mt-4 border-t border-line pt-3.5">
                        <Eyebrow as="div" mono={false} class="px-0.5 pb-1.5">
                            Translate to
                        </Eyebrow>
                        <div class="flex flex-wrap gap-1">
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
                    </div>
                </FloatingPanel>
            </Show>
        </div>
    );
};
