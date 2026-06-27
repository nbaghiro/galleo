import type { Component } from "solid-js";
import { For } from "solid-js";
import { addSectionAfter, editor, setLeftOpen } from "./editor";
import { Thumb } from "./Thumb";

// Floating left rail: a live thumbnail per section; click to jump-scroll. "+ Section" appends one.
export const Minimap: Component = () => (
    <aside class="absolute left-3 top-1/2 z-20 flex max-h-[calc(100%-24px)] w-[182px] -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur-md">
        <div class="flex items-center justify-between pl-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Sections</span>
            <button
                class="flex h-5 w-5 items-center justify-center rounded text-[11px] text-muted hover:text-ink"
                title="Hide"
                onClick={() => setLeftOpen(false)}
            >
                ✕
            </button>
        </div>
        <For each={editor.artifact.sections}>
            {(section, i) => <Thumb section={section} index={i()} />}
        </For>
        <button
            onClick={() => addSectionAfter(null)}
            class="mt-1 rounded-lg border border-dashed border-line py-2 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"
        >
            + Section
        </button>
    </aside>
);
