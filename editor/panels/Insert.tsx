import type { Rect } from "@engine/node";
import type { ElementAddress, ElementInstance, Target } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, Show, For } from "solid-js";
import { getElementAt, replaceAt } from "@elements/ops";
import { elementRegionId } from "@model/artifact";
import {
    addSectionAfter,
    commit,
    duplicateSectionAt,
    editor,
    moveSectionBy,
    noteElementAdded,
    regions,
    removeSectionAt,
    selection,
    setSelection,
} from "@editor/core/store";
import {
    deleteSelectedElements,
    duplicateSelectedElements,
    insertFromPalette,
} from "@editor/core/commands";
import { Icon } from "@ui/icons";
import { TextField } from "@ui/inputs";
import { rankItems } from "@ui/fuzzy";
import { FloatingPanel, Popover } from "@ui/overlay";
import { PRESETS } from "@elements/compose";
import { getElement, listElements } from "@elements/spec";
import { previewSvg } from "@elements/previews";
import { startDrag, drag } from "@editor/core/dnd";
import { pinnable } from "@editor/core/pin";
import {
    captureAnchor,
    commentableAt,
    commentsAvailable,
    startCommentDraft,
} from "@editor/core/comments";

export const EmptyRegionAdd: Component = () => {
    const [open, setOpen] = createSignal(false);
    const target = createMemo(() => {
        const s = selection();
        if (s?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, s.address);
        if (!inst) return null;
        const spec = getElement(inst.type);
        const c = spec?.container;
        const isEmpty = !!c && !c.closed && c.children(inst.data).length === 0;
        return isEmpty ? s.address : null;
    });
    const box = createMemo((): Rect | null => {
        const a = target();
        return a ? (regions().find((r) => r.id === elementRegionId(a))?.box ?? null) : null;
    });

    const insert = (inst: ElementInstance): void => {
        const a = target();
        if (!a) return;
        commit(replaceAt(editor.artifact, a, inst));
        noteElementAdded(inst.type, "palette");
        setOpen(false);
        setSelection({ kind: "element", address: a });
    };

    return (
        <Show when={box()}>
            {(b) => (
                <div
                    class="absolute z-menu -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${b().x + b().w / 2}px`, top: `${b().y + b().h / 2}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        class="flex icon-row gap-1.5 rounded-lg border border-dashed border-accent/60 bg-panel/95 px-3 py-2 text-[12.5px] font-semibold text-accent shadow-lg backdrop-blur-md transition hover:bg-accent hover:text-onaccent"
                        onClick={() => setOpen((v) => !v)}
                    >
                        <Icon name="plus" size={14} /> Add element
                    </button>
                    <Show when={open()}>
                        <FloatingPanel
                            rounded="xl"
                            pad="none"
                            class="absolute left-1/2 top-full mt-2 w-62 -translate-x-1/2 p-2"
                        >
                            <ElementPicker onInsert={insert} />
                        </FloatingPanel>
                    </Show>
                </div>
            )}
        </Show>
    );
};

const tile = (label: string, preview: string, onClick: () => void): JSX.Element => (
    <button class="flex select-none flex-col gap-1.5" onClick={onClick}>
        <div
            class="h-14 overflow-hidden rounded-lg border border-line bg-canvas p-2 transition-colors hover:border-accent"
            innerHTML={preview}
        />
        <span class="text-center text-[11px] font-medium text-muted">{label}</span>
    </button>
);

// the whole registry, searched the way the palette searches it; presets lead an empty query
const ElementPicker: Component<{ onInsert: (inst: ElementInstance) => void }> = (props) => {
    const [q, setQ] = createSignal("");
    const specs = createMemo(() => {
        const all = listElements().filter((sp) => !sp.hidden);
        const query = q().trim();
        return query ? rankItems(query, all, (sp) => `${sp.label} ${sp.type}`) : all;
    });
    return (
        <div class="flex max-h-80 w-62 flex-col gap-2">
            <TextField
                value={q()}
                onChange={setQ}
                placeholder="Find an element"
                compact
                autofocus
            />
            <div class="grid grid-cols-2 gap-2 overflow-y-auto">
                <Show when={!q().trim()}>
                    <For each={PRESETS}>
                        {(p) =>
                            tile(p.label, previewSvg(p.previewType), () =>
                                props.onInsert(p.build()),
                            )
                        }
                    </For>
                </Show>
                <For each={specs()}>
                    {(sp) =>
                        tile(sp.label, previewSvg(sp.type), () =>
                            props.onInsert({ type: sp.type, data: sp.create() }),
                        )
                    }
                </For>
            </div>
        </div>
    );
};

const CLICK_SLOP = 4; // px of travel below which a tile press is an insert, not a drag

export const PaletteItem: Component<{ type: string }> = (props) => {
    const spec = getElement(props.type);
    let down: { x: number; y: number } | null = null;
    return (
        <div
            class="flex cursor-grab select-none flex-col gap-1.5"
            onPointerDown={(e) => {
                e.preventDefault();
                down = { x: e.clientX, y: e.clientY };
                startDrag(
                    { kind: "new", type: props.type },
                    e.clientX,
                    e.clientY,
                    spec?.label ?? props.type,
                );
            }}
            onPointerUp={(e) => {
                const d = down;
                down = null;
                if (!d || !spec) return;
                if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
                insertFromPalette({ type: props.type, data: spec.create() });
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

// state lives here so the canvas can open it
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

// Element targets only: a comment always hangs on an element, never on a whole section, and never
// on a part of a composite (the comment belongs to the card, not to a line inside it).
const commentItem = (address: ElementAddress): Item[] => {
    if (!commentsAvailable() || !commentableAt(editor.artifact, address)) return [];
    return [
        {
            label: "Add comment",
            run: () => {
                const draft = captureAnchor(address);
                if (draft) startCommentDraft(draft);
            },
        },
    ];
};

function itemsFor(t: Target | null): Item[] {
    if (t?.kind === "element") {
        // the canvas selects the target before opening the menu, so the shared selection ops apply
        return [
            { label: "Duplicate", run: () => duplicateSelectedElements() },
            ...commentItem(t.address),
            { label: "Delete", danger: true, run: () => deleteSelectedElements() },
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
    return [{ label: "Add section", run: () => addSectionAfter(null) }];
}

export const ContextMenu: Component = () => (
    <Show when={menu()}>
        {(m) => {
            const items = itemsFor(m().target);
            const onPick = (run: () => void): void => {
                run();
                closeContextMenu();
            };
            return (
                <Popover
                    open={true}
                    at={() => ({ x: m().x, y: m().y })}
                    onClose={closeContextMenu}
                    estHeight={items.length * 34 + 12}
                    minWidth={180}
                    toolbar
                    panelClass="min-w-45 p-1.5"
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
                </Popover>
            );
        }}
    </Show>
);

// always mounted; only visibility toggles. Under the constrained slide the element lives at its
// slot (the SlotCard), so the cursor carries only a section drag's label pill and the pin hint.
export const DragGhost: Component = () => {
    const newType = (): string | null => {
        const p = drag()?.payload;
        return p?.kind === "new" ? p.type : null;
    };
    const pinHint = (): boolean => {
        const p = drag()?.payload;
        return p?.kind === "move" && pinnable(editor.artifact, p.from);
    };
    const pill = (): boolean => drag()?.payload.kind === "section";
    return (
        <>
            <div
                data-testid="drag-ghost"
                class="pointer-events-none fixed z-overlay flex items-center gap-2 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-lg backdrop-blur-md"
                style={{
                    display: drag() && pill() ? "flex" : "none",
                    left: `${(drag()?.x ?? 0) + 14}px`,
                    top: `${(drag()?.y ?? 0) + 14}px`,
                }}
            >
                <Show when={newType()}>
                    {(t) => (
                        <span
                            class="-my-0.5 block h-5 w-9 overflow-hidden rounded border border-line bg-canvas"
                            innerHTML={previewSvg(t())}
                        />
                    )}
                </Show>
                {drag()?.label}
            </div>
            <Show when={drag() && pinHint()}>
                <div
                    class="pointer-events-none fixed z-overlay rounded-full border border-line bg-panel/95 px-2.5 py-1 text-[11px] font-medium text-muted shadow-md"
                    style={{
                        left: `${(drag()?.x ?? 0) + 14}px`,
                        top: `${(drag()?.y ?? 0) - 26}px`,
                    }}
                >
                    Space places it freely
                </div>
            </Show>
        </>
    );
};
