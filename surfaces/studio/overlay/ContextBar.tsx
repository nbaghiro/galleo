import type { Rect } from "@engine/node";
import type { ControlField } from "@elements/spec";
import type { Component, JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";
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
import { commit, editing, editor, regions, selection, setSelection, stageEl } from "../editor";
import { drag } from "../editing/dnd";
import { Field } from "../controls/fields";
import { MarkControls } from "./MarkControls";
import { Icon } from "../icons";

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
