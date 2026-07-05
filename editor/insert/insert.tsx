// Insert affordances: cell-add, the element picker/palette item, context menu, and the drag/drop ghosts.

import type { Rect } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, Show, For } from "solid-js";
import { setCellElement, duplicateAt, duplicatedAddr, removeAt } from "@elements/ops";
import {
    commit,
    editor,
    regions,
    selection,
    setSelection,
    addSectionAfter,
    duplicateSectionAt,
    moveSectionBy,
    removeSectionAt,
    editorAccent,
} from "../editor";
import { Icon } from "../icons";
import { PRESETS } from "@elements/compose";
import { getElement } from "@elements/spec";
import { previewSvg } from "./element-previews";
import { startDrag, drag } from "./dnd";
import type { Target } from "@model/target";

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

// A compact insert picker: smart-layout presets first, then the common element types. Each entry builds
// a full ElementInstance and hands it to `onInsert` — shared by the empty-cell add + the add-beside gap.
const QUICK = [
    "text",
    "image",
    "bullets",
    "stat",
    "quote",
    "callout",
    "button",
    "divider",
    "chart",
    "table",
];

const tile = (label: string, preview: string, onClick: () => void): JSX.Element => (
    <button class="flex select-none flex-col gap-1.5" onClick={onClick}>
        <div
            class="h-14 overflow-hidden rounded-lg border border-line bg-canvas p-2 transition-colors hover:border-accent"
            innerHTML={preview}
        />
        <span class="text-center text-[11px] font-medium text-muted">{label}</span>
    </button>
);

export const ElementPicker: Component<{ onInsert: (inst: ElementInstance) => void }> = (props) => (
    <div class="grid grid-cols-2 gap-2">
        <For each={PRESETS}>
            {(p) => tile(p.label, previewSvg(p.previewType), () => props.onInsert(p.build()))}
        </For>
        <For each={QUICK}>
            {(type) =>
                tile(getElement(type)?.label ?? type, previewSvg(type), () =>
                    props.onInsert({ type, data: getElement(type)!.create() }),
                )
            }
        </For>
    </div>
);

// One draggable element: a designed, theme-driven SVG preview (recolors with the active theme) + label.
export const PaletteItem: Component<{ type: string }> = (props) => {
    const spec = getElement(props.type);
    return (
        <div
            class="flex cursor-grab select-none flex-col gap-1.5"
            onPointerDown={(e) => {
                e.preventDefault();
                startDrag(
                    { kind: "new", type: props.type },
                    e.clientX,
                    e.clientY,
                    spec?.label ?? props.type,
                );
            }}
        >
            <div
                class="h-16 overflow-hidden rounded-lg border border-line bg-canvas p-2 transition-colors hover:border-accent"
                innerHTML={previewSvg(props.type)}
            />
            <span class="text-center text-[11px] font-medium text-muted">
                {spec?.label ?? props.type}
            </span>
        </div>
    );
};

// The right-click menu. Opened from the canvas with a hit-tested target; its items depend on what was
// clicked (element · section · empty cell · bare canvas). State lives here so the canvas can open it.
type MenuState = { x: number; y: number; target: Target | null };
const [menu, setMenu] = createSignal<MenuState | null>(null);

export function openContextMenu(x: number, y: number, target: Target | null): void {
    setMenu({ x, y, target });
}
export function closeContextMenu(): void {
    setMenu(null);
}

interface Item {
    label: string;
    run: () => void;
    danger?: boolean;
}

function itemsFor(t: Target | null): Item[] {
    if (t?.kind === "element") {
        return [
            {
                label: "Duplicate",
                run: () => {
                    commit(duplicateAt(editor.artifact, t.address));
                    setSelection({ kind: "element", address: duplicatedAddr(t.address) });
                },
            },
            {
                label: "Delete",
                danger: true,
                run: () => {
                    commit(removeAt(editor.artifact, t.address));
                    setSelection(null);
                },
            },
        ];
    }
    if (t?.kind === "section") {
        const id = t.section;
        return [
            { label: "Add section below", run: () => addSectionAfter(id) },
            { label: "Duplicate", run: () => duplicateSectionAt(id) },
            { label: "Move up", run: () => moveSectionBy(id, -1) },
            { label: "Move down", run: () => moveSectionBy(id, 1) },
            { label: "Delete", danger: true, run: () => removeSectionAt(id) },
        ];
    }
    if (t?.kind === "cell") {
        // Route to the cell so its "+ Add element" affordance appears where the deep picker lives.
        return [{ label: "Add element…", run: () => setSelection(t) }];
    }
    return [{ label: "Add section", run: () => addSectionAfter(null) }];
}

export const ContextMenu: Component = () => (
    <Show when={menu()}>
        {(m) => {
            const items = itemsFor(m().target);
            const left = Math.min(m().x, window.innerWidth - 200);
            const top = Math.min(m().y, window.innerHeight - (items.length * 34 + 12));
            const onPick = (run: () => void): void => {
                run();
                closeContextMenu();
            };
            return (
                <>
                    <div class="fixed inset-0 z-[60]" onPointerDown={() => closeContextMenu()} />
                    <div
                        class="fixed z-[61] min-w-[180px] rounded-xl border border-line bg-panel/95 p-1.5 text-ink shadow-2xl backdrop-blur-md"
                        style={{ left: `${left}px`, top: `${top}px` }}
                    >
                        <For each={items}>
                            {(it): JSX.Element => (
                                <button
                                    class={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-canvas ${
                                        it.danger ? "text-accent" : "text-ink"
                                    }`}
                                    onClick={() => onPick(it.run)}
                                >
                                    {it.label}
                                </button>
                            )}
                        </For>
                    </div>
                </>
            );
        }}
    </Show>
);

// A small label pill trailing the cursor — cursor-level feedback while dragging (the in-place skeleton
// at the drop slot, drawn by DropIndicator, shows what/where it lands). Always mounted; visibility toggled.
export const DragGhost: Component = () => (
    <div
        class="pointer-events-none fixed z-50 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-lg backdrop-blur-md"
        style={{
            display: drag() ? "block" : "none",
            left: `${(drag()?.x ?? 0) + 14}px`,
            top: `${(drag()?.y ?? 0) + 14}px`,
        }}
    >
        {drag()?.label}
    </div>
);

// Lives inside the canvas stage (canvas coords). For a "between" drop (hovering an existing element) it
// draws a thin accent insertion line at the target boundary. For a "reflow" drop (open space) it shows
// nothing here — the ghost skeleton is painted inline in the preview artifact, which auto-sizes the
// section around it.
export const DropIndicator: Component = () => {
    const line = createMemo(() => {
        const t = drag()?.target;
        return t && !t.reflow ? t.slot : null;
    });

    return (
        <Show when={line()}>
            {(b) => (
                <div
                    class="pointer-events-none absolute rounded-full"
                    style={{
                        left: `${b().x}px`,
                        top: `${b().y}px`,
                        width: `${b().w}px`,
                        height: `${b().h}px`,
                        background: editorAccent(),
                    }}
                />
            )}
        </Show>
    );
};
