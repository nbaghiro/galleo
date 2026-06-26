import type { Component } from "solid-js";
import { For } from "solid-js";
import { PaletteItem } from "./PaletteItem";

// Right panel: the element palette (drag source). Later swaps to inspector/layout-picker on select.
const TYPES = ["text", "image", "stat", "bullets", "quote", "button", "card", "divider"];

export const Panel: Component = () => (
    <aside class="overflow-y-auto border-l border-line bg-panel p-[18px]">
        <div class="mb-3 font-mono text-[11px] font-semibold tracking-wider text-muted">
            ELEMENTS · drag onto a section
        </div>
        <div class="grid grid-cols-2 gap-3">
            <For each={TYPES}>{(t) => <PaletteItem type={t} />}</For>
        </div>
    </aside>
);
