// The floating format bar: the contextual control bar + rich-text mark controls shown for the selection.

import type { Rect } from "@engine/node";
import type { ControlField } from "@elements/spec";
import type { Component, JSX } from "solid-js";
import { createMemo, For, Show, createSignal } from "solid-js";
import { elementRegionId } from "@model/target";
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
import { drag } from "../insert/dnd";
import { Field } from "./fields";
import { Icon } from "../icons";
import type { MarkType } from "@model/text";
import { ColorPicker, highlightSwatches, textColorSwatches } from "./widgets";
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
    // Cross-axis self-align (how the element sits in its cell) — universal, moved off the panel.
    const align = createMemo((): string => inst()?.layout?.align ?? "start");
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

    const iconBtn = (active: boolean): string =>
        `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            active ? "bg-accent text-onaccent" : "text-ink hover:bg-canvas"
        }`;
    const sep = (): JSX.Element => <span class="mx-0.5 h-5 w-px bg-line" />;

    return (
        <Show when={pos()}>
            {(p) => (
                <div
                    data-galleo-toolbar="true"
                    class="absolute z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-panel/95 p-1 shadow-2xl backdrop-blur-md"
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
                        {sep()}
                    </Show>
                    <Show when={editing() && spec()?.richText}>
                        <MarkControls />
                        {sep()}
                    </Show>
                    <For each={ALIGNS}>
                        {([v, ic]) => (
                            <button
                                class={iconBtn(align() === v)}
                                title={`Align ${v}`}
                                onClick={() => setAlign(v)}
                            >
                                <Icon name={ic} size={15} />
                            </button>
                        )}
                    </For>
                    {sep()}
                    <button class={iconBtn(false)} title="Duplicate" onClick={dup}>
                        <Icon name="duplicate" size={15} />
                    </button>
                    <button
                        class={`${iconBtn(false)} hover:text-accent`}
                        title="Delete"
                        onClick={del}
                    >
                        <Icon name="trash" size={15} />
                    </button>
                </div>
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

const btn = (active: boolean): string =>
    `flex h-7 min-w-7 items-center justify-center rounded-md px-1 transition-colors ${
        active ? "bg-accent text-onaccent" : "text-ink hover:bg-canvas"
    }`;
const sep = (): JSX.Element => <span class="mx-0.5 h-5 w-px bg-line" />;
const noBlur = (e: MouseEvent): void => e.preventDefault();
const popCls =
    "absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 rounded-xl border border-line bg-panel/95 p-2.5 shadow-2xl backdrop-blur-md";

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
                    <button
                        title={m.title}
                        class={btn(is(m.type))}
                        onMouseDown={noBlur}
                        onClick={() => toggleTextMark(m.type)}
                    >
                        <Icon name={m.icon} size={15} />
                    </button>
                )}
            </For>
            <button
                title="Inline code"
                class={btn(is("code"))}
                onMouseDown={noBlur}
                onClick={() => toggleTextMark("code")}
            >
                <Icon name="code" size={15} />
            </button>
            {sep()}

            {/* text color */}
            <div class="relative">
                <button
                    title="Text color"
                    class={btn(is("color"))}
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
                </button>
                <Show when={pop() === "color"}>
                    <div class={popCls}>
                        <ColorPicker
                            value={activeValues().color}
                            swatches={textColorSwatches(editorTokens())}
                            onChange={(v) => applyMark("color", v)}
                            onPick={() => setPop(null)}
                            clearLabel="Remove color"
                            clearWhenEmpty
                            keepFocus
                        />
                    </div>
                </Show>
            </div>

            {/* highlight */}
            <div class="relative">
                <button
                    title="Highlight"
                    class={btn(is("hl"))}
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
                </button>
                <Show when={pop() === "hl"}>
                    <div class={popCls}>
                        <ColorPicker
                            value={activeValues().hl}
                            swatches={highlightSwatches(editorTokens())}
                            onChange={(v) => applyMark("hl", v)}
                            onPick={() => setPop(null)}
                            clearLabel="Remove highlight"
                            clearWhenEmpty
                            keepFocus
                        />
                    </div>
                </Show>
            </div>

            {/* link */}
            <div class="relative">
                <button
                    title="Link"
                    class={btn(is("link"))}
                    onMouseDown={noBlur}
                    onClick={openLink}
                >
                    <Icon name="link" size={15} />
                </button>
                <Show when={pop() === "link"}>
                    <div class="absolute left-1/2 top-full z-50 mt-2 flex w-[248px] -translate-x-1/2 items-center gap-1.5 rounded-xl border border-line bg-panel/95 p-2 shadow-2xl backdrop-blur-md">
                        <input
                            class="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                            placeholder="https://…"
                            value={linkUrl()}
                            onInput={(e) => setLinkUrl(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    applyLink();
                                }
                            }}
                        />
                        <button
                            class="flex-none rounded-md bg-accent px-2 py-1 text-[12px] font-semibold text-onaccent"
                            onClick={applyLink}
                        >
                            {activeValues().link ? "Save" : "Add"}
                        </button>
                    </div>
                </Show>
            </div>
        </>
    );
};
