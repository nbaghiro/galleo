// The floating format bar: the contextual control bar + rich-text mark controls shown for the selection.

import type { Rect } from "@engine/node";
import type { ControlField } from "@elements/spec";
import type { Component } from "solid-js";
import { createMemo, For, Show, createSignal } from "solid-js";
import { elementRegionId, parentTarget, regionId } from "@model/target";
import { GUTTER } from "@elements/compose";
import {
    duplicateAt,
    duplicatedAddr,
    getElementAt,
    removeAt,
    setElementLayout,
    updateDataAt,
} from "@elements/ops";
import { getElement } from "@elements/spec";
import {
    commit,
    editing,
    editor,
    regions,
    selection,
    setSelection,
    stageEl,
    editorTokens,
} from "../editor";
import { drag } from "../canvas/dnd";
import { canRegenerate, elementGenBusy, regenerateElement } from "../ai/element-gen";
import { canAssistText } from "../ai/text-assist";
import { TextAiMenu } from "../ai/TextAiMenu";
import { Field, SliderRow } from "./fields";
import { Icon } from "@ui/icons";
import type { MarkType } from "@model/text";
import { ColorPicker, highlightSwatches, textColorSwatches } from "@ui/color";
import { Button, IconButton, Spinner } from "@ui/button";
import { FloatingBar, FloatingPanel } from "@ui/overlay";
import { Separator, TextField } from "@ui/inputs";
import {
    activeMarks,
    activeValues,
    clearTextMark,
    setTextMark,
    textSelection,
    toggleTextMark,
} from "../text/text-format";

// The floating quick-action toolbar above a selected element — the "format bar". Its inline controls are
// spec-driven: an element declares `bar` (control keys) + `richText` (marks); the studio renders those
// compactly here. Universal duplicate/delete apply to every element. Studio-only — never present/export.
const BAR_GAP = 10;
const DEFAULT_RADIUS = 12; // shown on the universal radius slider before it's explicitly set

export const ContextBar: Component = () => {
    const addr = createMemo(() => {
        const s = selection();
        return s?.kind === "element" ? s.address : null;
    });
    const inst = createMemo(() => {
        const a = addr();
        return a ? getElementAt(editor.artifact, a) : undefined;
    });
    const spec = createMemo(() => {
        const i = inst();
        return i ? getElement(i.type) : undefined;
    });
    const data = createMemo(() => (inst()?.data ?? {}) as Record<string, unknown>);
    // The `bar` control keys resolved to their ControlField definitions (from `controls`), honoring each
    // field's `visibleWhen` so conditional controls (e.g. Direction/Distribute only when not a grid) drop.
    const barFields = createMemo((): ControlField[] => {
        const s = spec();
        if (!s?.bar) return [];
        const d = data();
        return s.bar
            .map((k) => s.controls.find((c) => c.key === k))
            .filter((c): c is ControlField => !!c && (!c.visibleWhen || c.visibleWhen(d)));
    });
    const box = createMemo((): Rect | null => {
        const a = addr();
        if (!a) return null;
        return regions().find((r) => r.id === elementRegionId(a))?.box ?? null;
    });
    const pos = createMemo((): { left: number; top: number } | null => {
        const b = box();
        if (!b || drag()) return null;
        const w = stageEl()?.clientWidth ?? 960;
        const left = Math.min(Math.max(b.x + b.w / 2, 130), w - 130);
        const above = b.y - 42 - BAR_GAP;
        return { left, top: above >= 0 ? above : b.y + b.h + BAR_GAP };
    });

    const setData = (key: string, value: unknown): void => {
        const a = addr();
        if (!a) return;
        // Slider/color are dragged continuously — coalesce their stream into one undo step.
        const control = barFields().find((c) => c.key === key)?.control;
        const coalesce =
            control === "slider" || control === "color"
                ? `bar:${elementRegionId(a)}:${key}`
                : undefined;
        commit(updateDataAt(editor.artifact, a, { ...data(), [key]: value }), { coalesce });
    };
    // Cross-axis self-align (how the element sits in its cell) — universal, moved off the panel. Only
    // meaningful when the element is narrower than its cell (there's room to slide it); a full-width
    // element has nowhere to go, so the buttons would be no-ops — hide them then (mirrors the width
    // resize handle only appearing when there's horizontal slack).
    // Universal corner radius — offered for any framed element (fill/image). Written to ElementLayout
    // (like width + align), so it rounds the element's frame regardless of type. Unset falls back to a
    // neutral default for display; the element keeps painting its own default radius until this is set.
    const radius = createMemo((): number => {
        const set = inst()?.layout?.radius;
        if (set !== undefined) return set;
        // Unset → show the radius the element actually painted (its theme-derived default), so the
        // slider reads true instead of jumping when first touched.
        const a = addr();
        const painted = a ? regions().find((r) => r.id === elementRegionId(a))?.radius : undefined;
        return painted ?? DEFAULT_RADIUS;
    });
    const setRadius = (n: number): void => {
        const a = addr();
        if (!a) return;
        commit(setElementLayout(editor.artifact, a, { ...(inst()?.layout ?? {}), radius: n }), {
            coalesce: `bar:${elementRegionId(a)}:radius`,
        });
    };
    const align = createMemo((): string => inst()?.layout?.align ?? "start");
    const canAlign = createMemo((): boolean => {
        const a = addr();
        const b = box();
        if (!a || !b) return false;
        // Align is self-positioning within the parent — offered only when there's horizontal slack. The
        // root's parent is the section content area (minus the gutter); a nested element's is its container.
        const rootLevel = a.path.length === 0;
        const parent = parentTarget({ kind: "element", address: a });
        const parentBox = parent
            ? regions().find((r) => r.id === regionId(parent))?.box
            : undefined;
        if (!parentBox) return false;
        const contentW = rootLevel ? parentBox.w - 2 * GUTTER : parentBox.w;
        return b.w < contentW - 6;
    });
    const setAlign = (v: "start" | "center" | "end"): void => {
        const a = addr();
        if (a)
            commit(setElementLayout(editor.artifact, a, { ...(inst()?.layout ?? {}), align: v }));
    };
    const ALIGNS = [
        ["start", "alignLeft"],
        ["center", "alignCenter"],
        ["end", "alignRight"],
    ] as const;
    // Regenerate — offered for any element that's meaningful to re-roll on its own (canRegenerate resolves
    // fragments of quotes/stats/bullets up to their parent; drops dividers/videos). Fires a fresh AI version
    // that swaps in place as one undo step; spins while the (single) regeneration is in flight.
    const canRegen = createMemo((): boolean => {
        const a = addr();
        return a ? canRegenerate(a) : false;
    });
    const regen = (): void => {
        const a = addr();
        if (a) void regenerateElement(a);
    };
    const dup = (): void => {
        const a = addr();
        if (!a) return;
        commit(duplicateAt(editor.artifact, a));
        setSelection({ kind: "element", address: duplicatedAddr(a) });
    };
    const del = (): void => {
        const a = addr();
        if (!a) return;
        commit(removeAt(editor.artifact, a));
        setSelection(null);
    };

    return (
        <Show when={pos()}>
            {(p) => (
                <FloatingBar
                    tone="panel"
                    rounded="xl"
                    pad="sm"
                    shadow="2xl"
                    anchor="free"
                    gap="0.5"
                    data-galleo-toolbar="true"
                    class="absolute z-chrome -translate-x-1/2"
                    style={{ left: `${p().left}px`, top: `${p().top}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Show when={barFields().length}>
                        <For each={barFields()}>
                            {(c) => (
                                <Field
                                    compact
                                    field={c}
                                    value={data()[c.key]}
                                    onChange={(v) => setData(c.key, v)}
                                />
                            )}
                        </For>
                        <Separator vertical class="mx-0.5" />
                    </Show>
                    <Show when={spec()?.frame}>
                        <span class="flex items-center gap-1.5 pl-1 pr-0.5 text-soft">
                            <Icon name="corner" size={14} />
                            <span class="w-[74px]">
                                <SliderRow
                                    value={radius()}
                                    min={0}
                                    max={40}
                                    step={1}
                                    unit="px"
                                    onChange={setRadius}
                                />
                            </span>
                        </span>
                        <Separator vertical class="mx-0.5" />
                    </Show>
                    <Show when={editing() && spec()?.richText}>
                        <MarkControls />
                        <Separator vertical class="mx-0.5" />
                    </Show>
                    <Show when={canAlign()}>
                        <For each={ALIGNS}>
                            {([v, ic]) => (
                                <IconButton
                                    size="md"
                                    rounded="md"
                                    tone="ink"
                                    active={align() === v}
                                    title={`Align ${v}`}
                                    onClick={() => setAlign(v)}
                                >
                                    <Icon name={ic} size={15} />
                                </IconButton>
                            )}
                        </For>
                        <Separator vertical class="mx-0.5" />
                    </Show>
                    {/* The single AI ✨: the text-edit intake popup while inline-editing rich text (it acts on
                        the selection), the whole-element regenerate otherwise. One button in one place, so
                        there's never a confusing second sparkle. */}
                    <Show when={editing() && spec()?.richText && canAssistText()}>
                        <TextAiMenu />
                        <Separator vertical class="mx-0.5" />
                    </Show>
                    <Show when={!(editing() && spec()?.richText && canAssistText()) && canRegen()}>
                        <IconButton
                            size="md"
                            rounded="md"
                            tone="ink"
                            class="hover:text-accent"
                            title="Regenerate with AI"
                            disabled={elementGenBusy()}
                            onClick={regen}
                        >
                            <Show
                                when={elementGenBusy()}
                                fallback={<Icon name="sparkle" size={15} />}
                            >
                                <Spinner size={14} tone="accent" />
                            </Show>
                        </IconButton>
                        <Separator vertical class="mx-0.5" />
                    </Show>
                    <IconButton size="md" rounded="md" tone="ink" title="Duplicate" onClick={dup}>
                        <Icon name="duplicate" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        class="hover:text-accent"
                        title="Delete"
                        onClick={del}
                    >
                        <Icon name="trash" size={15} />
                    </IconButton>
                </FloatingBar>
            )}
        </Show>
    );
};

// The inline-mark group of the text format bar: bold/italic/underline/strike + inline code, then text
// color, highlight, and link (each a small picker popover). Rendered inside the ContextBar (which
// carries `data-galleo-toolbar`, so interacting here doesn't end the edit). Buttons use onMouseDown
// preventDefault to keep the contenteditable focused + selected; only the link URL input takes focus,
// and it acts on a selection range captured before the input stole focus.

const BOOL: { type: MarkType; icon: string; title: string }[] = [
    { type: "b", icon: "bold", title: "Bold (⌘B)" },
    { type: "i", icon: "italic", title: "Italic (⌘I)" },
    { type: "u", icon: "underline", title: "Underline (⌘U)" },
    { type: "s", icon: "strike", title: "Strikethrough" },
];

const noBlur = (e: MouseEvent): void => e.preventDefault();
// Positioning + padding for the color/highlight flyout; FloatingPanel owns the surface chrome.
const popCls = "absolute left-1/2 top-full z-overlay mt-2 w-60 -translate-x-1/2 p-2.5";

export const MarkControls: Component = () => {
    const [pop, setPop] = createSignal<null | "color" | "hl" | "link">(null);
    const [linkUrl, setLinkUrl] = createSignal("");
    let linkRange: { from: number; to: number } | null = null;
    // The selection captured when a color/highlight popover opens — reused for every apply, so the
    // native color well (which moves focus off the contenteditable) still targets the right range.
    let markRange: { from: number; to: number } | null = null;

    const is = (type: MarkType): boolean => activeMarks().includes(type);

    const openPicker = (which: "color" | "hl"): void => {
        setPop((p) => {
            const next = p === which ? null : which;
            if (next) markRange = textSelection();
            return next;
        });
    };
    const applyMark = (type: "color" | "hl", value: string | undefined): void => {
        if (value) setTextMark(type, value, markRange ?? undefined);
        else clearTextMark(type, markRange ?? undefined);
    };

    const openLink = (): void => {
        linkRange = textSelection();
        setLinkUrl(activeValues().link ?? "");
        setPop((p) => (p === "link" ? null : "link"));
    };
    const applyLink = (): void => {
        const url = linkUrl().trim();
        if (url) setTextMark("link", url, linkRange ?? undefined);
        else clearTextMark("link", linkRange ?? undefined);
        setPop(null);
    };

    return (
        <>
            <For each={BOOL}>
                {(m) => (
                    <IconButton
                        auto
                        size="md"
                        rounded="md"
                        tone="ink"
                        active={is(m.type)}
                        title={m.title}
                        onMouseDown={noBlur}
                        onClick={() => toggleTextMark(m.type)}
                    >
                        <Icon name={m.icon} size={15} />
                    </IconButton>
                )}
            </For>
            <IconButton
                auto
                size="md"
                rounded="md"
                tone="ink"
                active={is("code")}
                title="Inline code"
                onMouseDown={noBlur}
                onClick={() => toggleTextMark("code")}
            >
                <Icon name="code" size={15} />
            </IconButton>
            <Separator vertical class="mx-0.5" />

            {/* text color */}
            <div class="relative">
                <IconButton
                    auto
                    size="md"
                    rounded="md"
                    tone="ink"
                    active={is("color")}
                    title="Text color"
                    onMouseDown={noBlur}
                    onClick={() => openPicker("color")}
                >
                    <span class="flex flex-col items-center gap-[3px]">
                        <Icon name="letterA" size={14} />
                        <span
                            class="h-[3px] w-3.5 rounded-full"
                            style={{ background: activeValues().color ?? "currentColor" }}
                        />
                    </span>
                </IconButton>
                <Show when={pop() === "color"}>
                    <FloatingPanel rounded="xl" pad="none" class={popCls}>
                        <ColorPicker
                            value={activeValues().color}
                            swatches={textColorSwatches(editorTokens())}
                            onChange={(v) => applyMark("color", v)}
                            onPick={() => setPop(null)}
                            clearLabel="Remove color"
                            clearWhenEmpty
                            keepFocus
                        />
                    </FloatingPanel>
                </Show>
            </div>

            {/* highlight */}
            <div class="relative">
                <IconButton
                    auto
                    size="md"
                    rounded="md"
                    tone="ink"
                    active={is("hl")}
                    title="Highlight"
                    onMouseDown={noBlur}
                    onClick={() => openPicker("hl")}
                >
                    <span class="flex flex-col items-center gap-[3px]">
                        <Icon name="highlighter" size={14} />
                        <span
                            class="h-[3px] w-3.5 rounded-full"
                            style={{ background: activeValues().hl ?? "transparent" }}
                        />
                    </span>
                </IconButton>
                <Show when={pop() === "hl"}>
                    <FloatingPanel rounded="xl" pad="none" class={popCls}>
                        <ColorPicker
                            value={activeValues().hl}
                            swatches={highlightSwatches(editorTokens())}
                            onChange={(v) => applyMark("hl", v)}
                            onPick={() => setPop(null)}
                            clearLabel="Remove highlight"
                            clearWhenEmpty
                            keepFocus
                        />
                    </FloatingPanel>
                </Show>
            </div>

            {/* link */}
            <div class="relative">
                <IconButton
                    auto
                    size="md"
                    rounded="md"
                    tone="ink"
                    active={is("link")}
                    title="Link"
                    onMouseDown={noBlur}
                    onClick={openLink}
                >
                    <Icon name="link" size={15} />
                </IconButton>
                <Show when={pop() === "link"}>
                    <FloatingPanel
                        rounded="xl"
                        pad="none"
                        class="absolute left-1/2 top-full z-overlay mt-2 flex w-[248px] -translate-x-1/2 items-center gap-1.5 p-2"
                    >
                        <TextField
                            compact
                            class="min-w-0 flex-1"
                            placeholder="https://…"
                            value={linkUrl()}
                            onChange={setLinkUrl}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    applyLink();
                                }
                            }}
                        />
                        <Button variant="primary" size="sm" class="flex-none" onClick={applyLink}>
                            {activeValues().link ? "Save" : "Add"}
                        </Button>
                    </FloatingPanel>
                </Show>
            </div>
        </>
    );
};
