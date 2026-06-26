import type { Component } from "solid-js";
import { For } from "solid-js";
import { editor } from "./editor";
import { Thumb } from "./Thumb";

// Left rail: a live thumbnail per section; click to jump-scroll the canvas.
export const Minimap: Component = () => (
    <aside class="flex flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3.5">
        <For each={editor.artifact.sections}>{(section, i) => <Thumb section={section} index={i()} />}</For>
    </aside>
);
