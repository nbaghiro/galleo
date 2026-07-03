import type { Target } from "@model/address";
import type { Component, JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { duplicateAt, duplicatedAddr, removeAt } from "@elements/ops";
import {
    addSectionAfter,
    commit,
    duplicateSectionAt,
    editor,
    moveSectionBy,
    removeSectionAt,
    setSelection,
} from "../editor";

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
