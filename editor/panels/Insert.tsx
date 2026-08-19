import type { Rect } from "@engine/node";
import type { ElementAddress, ElementInstance, Target } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, onMount, Show, For } from "solid-js";
import { layout } from "@engine/layout";
import { measureText } from "@canvas/render/commands";
import { paint } from "@canvas/render/backends";
import { paintedNodeFor } from "@editor/core/leaf";
import { deleteElement, duplicateAt, duplicatedAddr, getElementAt, replaceAt } from "@elements/ops";
import { elementRegionId } from "@model/artifact";
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
} from "@editor/core/store";
import { leaseHolder, say } from "@editor/core/collab";
import { Icon } from "@ui/icons";
import { FloatingPanel, Popover } from "@ui/overlay";
import { PRESETS } from "@elements/compose";
import { getElement } from "@elements/spec";
import { previewSvg } from "@elements/previews";
import { startDrag, drag } from "@editor/core/dnd";
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
                        class="flex items-center gap-1.5 rounded-lg border border-dashed border-accent/60 bg-panel/95 px-3 py-2 text-[12.5px] font-semibold text-accent shadow-lg backdrop-blur-md transition hover:bg-accent hover:text-onaccent"
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

// shared by the empty-cell add and the add-beside gap
const QUICK = [
    "text",
    "image",
    "bullets",
    "stat",
    "quote",
    "callout",
    "button",
    "divider",
    "barChart",
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

const ElementPicker: Component<{ onInsert: (inst: ElementInstance) => void }> = (props) => (
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
        return [
            {
                label: "Duplicate",
                run: () => {
                    commit(duplicateAt(editor.artifact, t.address));
                    setSelection({ kind: "element", address: duplicatedAddr(t.address) });
                },
            },
            ...commentItem(t.address),
            {
                label: "Delete",
                danger: true,
                run: () => {
                    // courtesy: the server never refuses a delete for lease reasons, this only
                    // stops the accidental one while someone is visibly typing in it
                    const holder = leaseHolder(t.address);
                    if (holder) {
                        say(`${holder.user.name || "Someone"} is editing this`);
                        return;
                    }
                    commit(deleteElement(editor.artifact, t.address));
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

// a move drag's cursor ghost: the element exactly as painted, dimmed, laid out once per gesture
const MoveGhost: Component<{ from: ElementAddress; w: number; h: number }> = (props) => {
    let host!: HTMLDivElement;
    onMount(() => {
        const node = paintedNodeFor(props.from);
        if (!node) return;
        const { commands } = layout(node, { x: 0, y: 0, w: props.w, h: props.h }, measureText);
        paint(commands, host);
    });
    return <div ref={host} class="relative h-full w-full" />;
};

// always mounted; only visibility toggles
export const DragGhost: Component = () => {
    // a new-element drag carries its palette tile along; section drags keep the label pill
    const newType = (): string | null => {
        const p = drag()?.payload;
        return p?.kind === "new" ? p.type : null;
    };
    const moveSrc = createMemo(() => {
        const p = drag()?.payload;
        if (p?.kind !== "move") return null;
        const box = regions().find((r) => r.id === elementRegionId(p.from))?.box;
        return box ? { from: p.from, w: box.w, h: box.h } : null;
    });
    return (
        <Show
            when={moveSrc()}
            fallback={
                <div
                    data-testid="drag-ghost"
                    class="pointer-events-none fixed z-overlay flex items-center gap-2 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-lg backdrop-blur-md"
                    style={{
                        display: drag() ? "flex" : "none",
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
            }
        >
            {(src) => (
                <div
                    data-testid="drag-ghost"
                    class="pointer-events-none fixed z-overlay opacity-55"
                    style={{
                        left: `${(drag()?.x ?? 0) + 10}px`,
                        top: `${(drag()?.y ?? 0) + 10}px`,
                        width: `${src().w}px`,
                        height: `${src().h}px`,
                    }}
                >
                    <MoveGhost from={src().from} w={src().w} h={src().h} />
                </div>
            )}
        </Show>
    );
};
