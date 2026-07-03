import type { Component } from "solid-js";
import { drag } from "../editing/dnd";

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
