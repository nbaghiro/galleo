import type { Component } from "solid-js";
import { createEffect, createMemo } from "solid-js";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { skeletonFor } from "@elements/skeleton";
import { paint } from "./dom-backend";
import { drag } from "./dnd";
import { editor } from "./editor";
import { measureText } from "./measure";
import { ctxFor, layoutNode } from "./render";

// The element's skeleton follows the cursor while dragging — a live preview of what's being placed.
// Always mounted (visibility toggled) so the paint target ref is reliable.
export const DragGhost: Component = () => {
    let box!: HTMLDivElement;

    const draggedType = createMemo(() => {
        const d = drag();
        if (!d) return null;
        if (d.payload.kind === "new") return d.payload.type;
        return getElementAt(editor.artifact, d.payload.from)?.type ?? null;
    });

    createEffect(() => {
        const t = draggedType();
        if (!t || !box) return;
        const spec = getElement(t);
        if (!spec) return;
        const { commands } = layoutNode(skeletonFor(spec, ctxFor(150)), 150, measureText);
        paint(commands, box);
    });

    return (
        <div
            class="pointer-events-none fixed z-50 w-[184px] rounded-lg border border-line bg-white/95 p-3 shadow-xl"
            style={{
                display: drag() ? "block" : "none",
                left: `${(drag()?.x ?? 0) + 14}px`,
                top: `${(drag()?.y ?? 0) + 14}px`,
            }}
        >
            <div ref={box} class="w-[150px]" />
            <div class="mt-2 text-[12px] font-semibold text-ink">{drag()?.label}</div>
        </div>
    );
};
