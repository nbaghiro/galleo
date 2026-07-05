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

// Hand-designed, theme-driven SVG previews per element type. Every color is a CSS variable the
// Studio root sets from the active theme (--color-accent/ink/muted/panel/canvas/line/onaccent), so a
// theme switch recolors them for free. Returned as a string so both the Solid studio (innerHTML) and
// the vanilla playground can use them.

const accent = "var(--color-accent)";
const ink = "var(--color-ink)";
const muted = "var(--color-muted)";
const surface = "var(--color-panel)";
const line = "var(--color-line)";
const onaccent = "var(--color-onaccent)";

const PREVIEWS: Record<string, string> = {
    text: `
        <rect x="14" y="15" width="78" height="11" rx="3.5" fill="${ink}"/>
        <rect x="14" y="34" width="112" height="6" rx="3" fill="${muted}" opacity="0.8"/>
        <rect x="14" y="46" width="98" height="6" rx="3" fill="${muted}" opacity="0.55"/>
        <rect x="14" y="58" width="62" height="6" rx="3" fill="${muted}" opacity="0.4"/>`,

    bullets: `
        <circle cx="18" cy="22" r="3.2" fill="${accent}"/>
        <rect x="28" y="19" width="98" height="6.5" rx="3" fill="${ink}" opacity="0.78"/>
        <circle cx="18" cy="38" r="3.2" fill="${accent}" opacity="0.6"/>
        <rect x="28" y="35" width="86" height="6.5" rx="3" fill="${ink}" opacity="0.6"/>
        <circle cx="18" cy="54" r="3.2" fill="${accent}" opacity="0.4"/>
        <rect x="28" y="51" width="74" height="6.5" rx="3" fill="${ink}" opacity="0.45"/>`,

    quote: `
        <rect x="16" y="18" width="4.5" height="38" rx="2.25" fill="${accent}"/>
        <rect x="30" y="20" width="96" height="8" rx="3" fill="${ink}" opacity="0.85"/>
        <rect x="30" y="34" width="80" height="8" rx="3" fill="${ink}" opacity="0.6"/>
        <rect x="30" y="52" width="46" height="5" rx="2.5" fill="${muted}"/>`,

    callout: `
        <rect x="14" y="14" width="112" height="44" rx="9" fill="${accent}" fill-opacity="0.1"/>
        <rect x="14" y="14" width="5" height="44" rx="2.5" fill="${accent}"/>
        <circle cx="34" cy="31" r="6.5" fill="${accent}"/>
        <circle cx="34" cy="28" r="1.1" fill="${onaccent}"/>
        <rect x="33" y="30.5" width="2" height="5" rx="1" fill="${onaccent}"/>
        <rect x="48" y="24" width="62" height="6" rx="3" fill="${ink}" opacity="0.8"/>
        <rect x="48" y="37" width="74" height="6" rx="3" fill="${muted}" opacity="0.7"/>`,

    cards: `
        <rect x="14" y="16" width="34" height="42" rx="6" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <rect x="20" y="23" width="20" height="6" rx="3" fill="${ink}" opacity="0.8"/>
        <rect x="20" y="34" width="22" height="4" rx="2" fill="${muted}" opacity="0.7"/>
        <rect x="20" y="42" width="15" height="4" rx="2" fill="${muted}" opacity="0.5"/>
        <rect x="53" y="16" width="34" height="42" rx="6" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <rect x="59" y="23" width="20" height="6" rx="3" fill="${ink}" opacity="0.8"/>
        <rect x="59" y="34" width="22" height="4" rx="2" fill="${muted}" opacity="0.7"/>
        <rect x="59" y="42" width="15" height="4" rx="2" fill="${muted}" opacity="0.5"/>
        <rect x="92" y="16" width="34" height="42" rx="6" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <rect x="98" y="23" width="20" height="6" rx="3" fill="${ink}" opacity="0.8"/>
        <rect x="98" y="34" width="22" height="4" rx="2" fill="${muted}" opacity="0.7"/>
        <rect x="98" y="42" width="15" height="4" rx="2" fill="${muted}" opacity="0.5"/>`,

    code: `
        <rect x="13" y="13" width="114" height="46" rx="8" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <circle cx="24" cy="22" r="1.8" fill="${muted}" opacity="0.55"/>
        <circle cx="31" cy="22" r="1.8" fill="${muted}" opacity="0.4"/>
        <circle cx="38" cy="22" r="1.8" fill="${muted}" opacity="0.28"/>
        <rect x="24" y="33" width="22" height="5" rx="2.5" fill="${accent}"/>
        <rect x="50" y="33" width="38" height="5" rx="2.5" fill="${ink}" opacity="0.5"/>
        <rect x="34" y="44" width="40" height="5" rx="2.5" fill="${ink}" opacity="0.7"/>
        <rect x="78" y="44" width="18" height="5" rx="2.5" fill="${accent}" opacity="0.8"/>`,

    image: `
        <rect x="13" y="12" width="114" height="48" rx="8" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <circle cx="40" cy="28" r="7" fill="${accent}"/>
        <path d="M22 58 L46 38 L66 52 L66 58 Z" fill="${ink}" opacity="0.2"/>
        <path d="M58 58 L92 32 L120 58 Z" fill="${ink}" opacity="0.28"/>`,

    video: `
        <rect x="13" y="12" width="114" height="48" rx="8" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <circle cx="70" cy="36" r="13" fill="${accent}"/>
        <path d="M65 29 L65 43 L78 36 Z" fill="${onaccent}"/>`,

    stat: `
        <text x="14" y="42" font-family="ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="800" fill="${accent}">98%</text>
        <rect x="15" y="52" width="74" height="6" rx="3" fill="${muted}" opacity="0.7"/>`,

    chart: `
        <line x1="14" y1="58" x2="126" y2="58" stroke="${line}" stroke-width="1.5"/>
        <rect x="20" y="40" width="14" height="18" rx="2.5" fill="${accent}" opacity="0.5"/>
        <rect x="42" y="26" width="14" height="32" rx="2.5" fill="${accent}" opacity="0.72"/>
        <rect x="64" y="34" width="14" height="24" rx="2.5" fill="${accent}" opacity="0.6"/>
        <rect x="86" y="18" width="14" height="40" rx="2.5" fill="${accent}"/>
        <rect x="108" y="30" width="14" height="28" rx="2.5" fill="${accent}" opacity="0.82"/>`,

    table: `
        <rect x="14" y="16" width="112" height="44" rx="7" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <path d="M14 31 H126 M14 45.5 H126 M51 16 V60 M89 16 V60" stroke="${line}" stroke-width="1.1"/>
        <rect x="22" y="21" width="20" height="5" rx="2" fill="${accent}" opacity="0.7"/>
        <rect x="60" y="21" width="20" height="5" rx="2" fill="${accent}" opacity="0.7"/>
        <rect x="98" y="21" width="18" height="5" rx="2" fill="${accent}" opacity="0.7"/>
        <rect x="22" y="35.5" width="20" height="4.5" rx="2" fill="${muted}" opacity="0.55"/>
        <rect x="60" y="35.5" width="20" height="4.5" rx="2" fill="${muted}" opacity="0.55"/>
        <rect x="98" y="35.5" width="16" height="4.5" rx="2" fill="${muted}" opacity="0.55"/>
        <rect x="22" y="50" width="20" height="4.5" rx="2" fill="${muted}" opacity="0.4"/>
        <rect x="60" y="50" width="20" height="4.5" rx="2" fill="${muted}" opacity="0.4"/>
        <rect x="98" y="50" width="16" height="4.5" rx="2" fill="${muted}" opacity="0.4"/>`,

    diagram: `
        <rect x="14" y="26" width="30" height="20" rx="5" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="1.5"/>
        <rect x="55" y="26" width="30" height="20" rx="5" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="1.5"/>
        <rect x="96" y="26" width="30" height="20" rx="5" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="1.5"/>
        <path d="M44 36 H55 M85 36 H96" stroke="${accent}" stroke-width="1.5"/>
        <path d="M52 33 L55 36 L52 39 M93 33 L96 36 L93 39" stroke="${accent}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,

    button: `
        <rect x="30" y="25" width="80" height="22" rx="11" fill="${accent}"/>
        <rect x="48" y="33" width="44" height="6" rx="3" fill="${onaccent}" opacity="0.92"/>`,

    badge: `
        <rect x="42" y="30" width="56" height="18" rx="9" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="1.3"/>
        <rect x="52" y="36.5" width="36" height="5" rx="2.5" fill="${accent}"/>`,

    divider: `
        <line x1="18" y1="36" x2="122" y2="36" stroke="${line}" stroke-width="2"/>
        <circle cx="70" cy="36" r="3" fill="${muted}"/>`,

    spacer: `
        <rect x="26" y="20" width="88" height="32" rx="7" fill="none" stroke="${line}" stroke-width="1.5" stroke-dasharray="4 4"/>
        <path d="M70 27 L66 32 H74 Z" fill="${muted}"/>
        <path d="M70 45 L66 40 H74 Z" fill="${muted}"/>
        <line x1="70" y1="32" x2="70" y2="40" stroke="${muted}" stroke-width="1.5"/>`,

    gradient: `
        <defs><linearGradient id="galleo-prev-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${accent}"/>
            <stop offset="1" stop-color="${surface}"/>
        </linearGradient></defs>
        <rect x="14" y="14" width="112" height="44" rx="9" fill="url(#galleo-prev-grad)"/>`,

    embed: `
        <rect x="14" y="18" width="112" height="40" rx="8" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <circle cx="34" cy="38" r="9" fill="none" stroke="${accent}" stroke-width="1.6"/>
        <line x1="25" y1="38" x2="43" y2="38" stroke="${accent}" stroke-width="1.2"/>
        <ellipse cx="34" cy="38" rx="4" ry="9" fill="none" stroke="${accent}" stroke-width="1.2"/>
        <rect x="50" y="30" width="58" height="6" rx="3" fill="${ink}" opacity="0.8"/>
        <rect x="50" y="42" width="42" height="5" rx="2.5" fill="${muted}" opacity="0.7"/>`,

    card: `
        <rect x="14" y="14" width="112" height="46" rx="9" fill="${surface}" stroke="${line}" stroke-width="1.5"/>
        <rect x="26" y="24" width="54" height="8" rx="3" fill="${ink}"/>
        <rect x="26" y="37" width="80" height="5.5" rx="2.5" fill="${muted}" opacity="0.7"/>
        <rect x="26" y="46" width="36" height="11" rx="5.5" fill="${accent}"/>`,

    group: `
        <rect x="20" y="18" width="100" height="10" rx="3" fill="${ink}" opacity="0.8"/>
        <rect x="20" y="33" width="84" height="7" rx="3" fill="${muted}" opacity="0.6"/>
        <rect x="20" y="44" width="92" height="7" rx="3" fill="${muted}" opacity="0.5"/>
        <rect x="20" y="55" width="58" height="7" rx="3" fill="${muted}" opacity="0.4"/>`,
};

const FALLBACK = `<rect x="20" y="20" width="100" height="32" rx="7" fill="${muted}" opacity="0.25"/>`;

export function previewSvg(type: string): string {
    return `<svg viewBox="0 0 140 72" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">${PREVIEWS[type] ?? FALLBACK}</svg>`;
}
