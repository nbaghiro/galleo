import type { Rect } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { Component } from "solid-js";
import { createMemo, createSignal, Show } from "solid-js";
import { setCellElement } from "@elements/ops";
import { commit, editor, regions, selection, setSelection } from "../editor";
import { ElementPicker } from "./ElementPicker";
import { Icon } from "../icons";

// The empty-cell affordance: a centered "+ Add element" that opens the shared picker and drops the
// chosen element (or a smart-layout preset) into the cell — no drag required.
export const CellAdd: Component = () => {
    const [open, setOpen] = createSignal(false);
    const cell = createMemo(() => {
        const s = selection();
        return s?.kind === "cell" ? s : null;
    });
    const empty = createMemo((): boolean => {
        const c = cell();
        if (!c) return false;
        const sec = editor.artifact.sections.find((s) => s.id === c.section);
        return !sec?.cells[c.cell]?.element;
    });
    const box = createMemo((): Rect | null => {
        const c = cell();
        if (!c || !empty()) return null;
        return regions().find((r) => r.id === `cell:${c.section}:${c.cell}`)?.box ?? null;
    });

    const insert = (inst: ElementInstance): void => {
        const c = cell();
        if (!c) return;
        commit(setCellElement(editor.artifact, c.section, c.cell, inst));
        setOpen(false);
        setSelection({ kind: "element", address: { section: c.section, cell: c.cell, path: [] } });
    };

    return (
        <Show when={box()}>
            {(b) => (
                <div
                    class="absolute z-30 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${b().x + b().w / 2}px`, top: `${b().y + b().h / 2}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        class="flex items-center gap-1.5 rounded-lg border border-dashed border-accent/60 bg-panel/95 px-3 py-2 text-[12.5px] font-semibold text-accent shadow-lg backdrop-blur-md transition hover:bg-accent hover:text-onaccent"
                        onClick={() => setOpen((v) => !v)}
                    >
                        <Icon name="plus" size={14} /> Add element
                    </button>
                    <Show when={open()}>
                        <div class="absolute left-1/2 top-full mt-2 w-[248px] -translate-x-1/2 rounded-xl border border-line bg-panel/95 p-2 shadow-2xl backdrop-blur-md">
                            <ElementPicker onInsert={insert} />
                        </div>
                    </Show>
                </div>
            )}
        </Show>
    );
};
