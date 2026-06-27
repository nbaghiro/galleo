import type { Component } from "solid-js";
import { For } from "solid-js";
import { addSectionAfter, editor } from "./editor";
import { Thumb } from "./Thumb";

// Left rail: a live thumbnail per section; click to jump-scroll the canvas. "+ Section" appends one.
export const Minimap: Component = () => (
    <aside class="flex flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3.5">
        <For each={editor.artifact.sections}>{(section, i) => <Thumb section={section} index={i()} />}</For>
        <button
            onClick={() => addSectionAfter(null)}
            class="mt-1 rounded-lg border border-dashed border-line py-2 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"
        >
            + Section
        </button>
    </aside>
);
