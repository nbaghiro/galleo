import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { getElement } from "@elements/registry";
import { skeletonFor } from "@elements/skeleton";
import { startDrag } from "./dnd";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { ctxFor, layoutNode } from "./render";

// One draggable element in the palette: its structural skeleton (engine-painted) + a label.
export const PaletteItem: Component<{ type: string }> = (props) => {
    let box!: HTMLDivElement;
    const spec = getElement(props.type);

    createEffect(() => {
        if (!spec) return;
        const w = box.clientWidth || 110;
        const node = skeletonFor(spec, ctxFor(w));
        const { commands, height } = layoutNode(node, w, measureText);
        box.style.height = `${Math.max(52, height)}px`;
        paint(commands, box);
    });

    return (
        <div
            class="flex cursor-grab select-none flex-col gap-2"
            onPointerDown={(e) => {
                e.preventDefault();
                startDrag({ kind: "new", type: props.type }, e.clientX, e.clientY, spec?.label ?? props.type);
            }}
        >
            <div class="flex items-center rounded-lg border border-line bg-canvas p-3">
                <div ref={box} class="w-full" />
            </div>
            <span class="text-[12px] font-semibold text-ink">{spec?.label ?? props.type}</span>
        </div>
    );
};
