import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { addSectionAfter, editor, moveSectionBy, setLeftOpen } from "../editor";
import { Thumb } from "../canvas/Canvas";
import { Icon } from "../icons";

// Floating left rail: a live thumbnail per section; click to jump-scroll, drag the grip to reorder.
// "+ Section" appends one.
export const Minimap: Component = () => {
    const [dragIx, setDragIx] = createSignal<number | null>(null);
    const [overIx, setOverIx] = createSignal<number | null>(null);
    const rowEls: (HTMLElement | undefined)[] = [];

    const startReorder = (ix: number, e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDragIx(ix);
        setOverIx(ix);
        const move = (ev: PointerEvent): void => {
            const n = editor.artifact.sections.length;
            let over = n;
            for (let i = 0; i < n; i++) {
                const el = rowEls[i];
                if (!el) continue;
                const r = el.getBoundingClientRect();
                if (ev.clientY < r.top + r.height / 2) {
                    over = i;
                    break;
                }
            }
            setOverIx(over);
        };
        const up = (): void => {
            const from = dragIx();
            const over = overIx();
            if (from !== null && over !== null) {
                // `over` is the gap to drop before (0..n); removing `from` first shifts later slots.
                const final = over > from ? over - 1 : over;
                const id = editor.artifact.sections[from]?.id;
                if (id && final !== from) moveSectionBy(id, final - from);
            }
            setDragIx(null);
            setOverIx(null);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <aside class="absolute left-3 top-1/2 z-20 flex max-h-[calc(100%-24px)] w-[182px] -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur-md">
            <div class="flex items-center justify-between pl-1">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Sections
                </span>
                <button
                    class="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-ink"
                    title="Hide"
                    onClick={() => setLeftOpen(false)}
                >
                    <Icon name="close" size={12} />
                </button>
            </div>
            <For each={editor.artifact.sections}>
                {(section, i) => (
                    <div class="group relative" ref={(el) => (rowEls[i()] = el)}>
                        <Show when={dragIx() !== null && overIx() === i()}>
                            <div class="absolute -top-1.5 left-0 right-0 h-0.5 rounded bg-accent" />
                        </Show>
                        <div class={dragIx() === i() ? "opacity-40" : ""}>
                            <Thumb section={section} index={i()} />
                        </div>
                        <button
                            class="absolute left-0 top-1/2 z-10 flex h-6 w-4 -translate-y-1/2 cursor-grab items-center justify-center rounded text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                            title="Drag to reorder"
                            onPointerDown={(e) => startReorder(i(), e)}
                        >
                            <Icon name="grip" size={14} />
                        </button>
                    </div>
                )}
            </For>
            <Show when={dragIx() !== null && overIx() === editor.artifact.sections.length}>
                <div class="h-0.5 rounded bg-accent" />
            </Show>
            <button
                onClick={() => addSectionAfter(null)}
                class="mt-1 rounded-lg border border-dashed border-line py-2 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"
            >
                + Section
            </button>
        </aside>
    );
};
