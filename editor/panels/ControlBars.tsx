import type { Rect } from "@engine/node";
import type { ControlField } from "@elements/spec";
import type { Component } from "solid-js";
import { createEffect, createMemo, For, Show, createSignal } from "solid-js";
import { elementRegionId, parentTarget } from "@model/artifact";
import { profileFor } from "@engine/profile";
import { isPhone } from "@ui/viewport";
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
} from "@editor/core/store";
import { drag } from "@editor/core/dnd";
import { canRegenerate, elementGenBusy, regenerateElement } from "@editor/core/ai";
import {
    canAssistText,
    LANGUAGES,
    REWRITE_PRESETS,
    runRegenerate,
    runRewrite,
    runTranslate,
    textAssist,
} from "@editor/core/ai";
import { Field } from "./SharedControlFields";
import { Icon } from "@ui/icons";
import type { MarkType } from "@model/text";
import { ColorPicker, highlightSwatches, textColorSwatches } from "@ui/color";
import { Button, Chip, Eyebrow, IconButton, Spinner } from "@ui/button";
import { FloatingBar, FloatingPanel } from "@ui/overlay";
import { Separator, TextField } from "@ui/inputs";
import {
    activeMarks,
    activeValues,
    clearTextMark,
    setTextMark,
    textSelection,
    toggleTextMark,
} from "@editor/core/text";

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
        // slider/color drag continuously; coalesce the stream into one undo step
        const control = barFields().find((c) => c.key === key)?.control;
        const coalesce =
            control === "slider" || control === "color"
                ? `bar:${elementRegionId(a)}:${key}`
                : undefined;
        commit(updateDataAt(editor.artifact, a, { ...data(), [key]: value }), { coalesce });
    };
    const align = createMemo((): string => inst()?.layout?.align ?? "start");
    // `layout.align` is alignSelf: it only moves a column child with horizontal slack (in a row it
    // would act vertically). Rich text aligns through its own data control.
    const canAlign = createMemo((): boolean => {
        const a = addr();
        const i = inst();
        const s = spec();
        if (!a || !i || !s || s.richText) return false;
        const parent = parentTarget({ kind: "element", address: a });
        if (parent?.kind === "element") {
            const pInst = getElementAt(editor.artifact, parent.address);
            if ((pInst?.data as { direction?: string } | undefined)?.direction === "row")
                return false;
        }
        const w = i.layout?.width;
        if (w === "fill") return false;
        if (w === "fit") return true;
        if (w && typeof w === "object") return w.pct < 100;
        // no explicit width: fit/fixed nodes (button, badge, icon) have slack, growing ones don't
        const probe = s.layout(i.data, {
            box: { x: 0, y: 0, w: 800, h: 600 },
            availWidth: 800,
            format: profileFor(editor.artifact),
            theme: editorTokens(),
        });
        return probe.w.mode !== "grow";
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
                    // phone: docked as a scrollable strip just under the 52px topbar — anchored to
                    // the element it would sit under a finger or behind the keyboard, and clip at
                    // 390px; fixed, so scrolling and the keyboard can't carry it away
                    class={
                        isPhone()
                            ? "fixed inset-x-2 top-15 z-chrome overflow-x-auto"
                            : "absolute z-chrome -translate-x-1/2"
                    }
                    style={isPhone() ? undefined : { left: `${p().left}px`, top: `${p().top}px` }}
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
                                    onWrite={(k, v) => setData(k, v)}
                                />
                            )}
                        </For>
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
                    {/* one ✨: text intake while editing rich text, else whole-element regenerate */}
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

const BOOL: { type: MarkType; icon: string; title: string }[] = [
    { type: "b", icon: "bold", title: "Bold (⌘B)" },
    { type: "i", icon: "italic", title: "Italic (⌘I)" },
    { type: "u", icon: "underline", title: "Underline (⌘U)" },
    { type: "s", icon: "strike", title: "Strikethrough" },
];

const noBlur = (e: MouseEvent): void => e.preventDefault();
const popCls = "absolute left-1/2 top-full z-overlay mt-2 w-60 -translate-x-1/2 p-2.5";

export const MarkControls: Component = () => {
    const [pop, setPop] = createSignal<null | "color" | "hl" | "link">(null);
    const [linkUrl, setLinkUrl] = createSignal("");
    let linkRange: { from: number; to: number } | null = null;
    // captured at popover open, since the native color well steals focus and loses the selection
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
                    <span class="flex flex-col items-center gap-0.75">
                        <Icon name="letterA" size={14} />
                        <span
                            class="h-0.75 w-3.5 rounded-full"
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
                    <span class="flex flex-col items-center gap-0.75">
                        <Icon name="highlighter" size={14} />
                        <span
                            class="h-0.75 w-3.5 rounded-full"
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
                        class="absolute left-1/2 top-full z-overlay mt-2 flex w-62 -translate-x-1/2 items-center gap-1.5 p-2"
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

type Range = { from: number; to: number };

const TextAiMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const [prompt, setPrompt] = createSignal("");
    // selection snapshot at open; a plain ref, read at action time, not reactive
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
                    class="absolute right-0 top-full z-overlay mt-2 max-h-100 w-72 overflow-y-auto"
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

                    {/* block wrapper: Separator is inline and drops vertical margins */}
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
