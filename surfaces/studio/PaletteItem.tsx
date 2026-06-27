import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { getElement } from "@elements/registry";
import { skeletonFor } from "@elements/skeleton";
import { startDrag } from "./dnd";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { ctxFor, layoutNode } from "./render";

const NOMINAL_W = 150; // skeletons are laid out at a fixed width, then scaled to fit the frame
const FRAME_H = 58;

// One draggable element: its structural skeleton, scaled to fit a fixed-size frame so every tile is
// uniform (and labels stay aligned), with a label underneath.
export const PaletteItem: Component<{ type: string }> = (props) => {
    let inner!: HTMLDivElement;
    const spec = getElement(props.type);

    createEffect(() => {
        if (!spec) return;
        const { commands, height } = layoutNode(skeletonFor(spec, ctxFor(NOMINAL_W)), NOMINAL_W, measureText);
        const frameW = inner.parentElement?.clientWidth ?? 120;
        const scale = Math.min(1, (frameW - 18) / NOMINAL_W, (FRAME_H - 16) / Math.max(1, height));
        inner.style.width = `${NOMINAL_W}px`;
        inner.style.height = `${height}px`;
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = "center center";
        paint(commands, inner);
    });

    return (
        <div
            class="flex cursor-grab select-none flex-col gap-1.5"
            onPointerDown={(e) => {
                e.preventDefault();
                startDrag({ kind: "new", type: props.type }, e.clientX, e.clientY, spec?.label ?? props.type);
            }}
        >
            <div
                class="flex items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas transition-colors hover:border-accent"
                style={{ height: `${FRAME_H}px` }}
            >
                <div ref={inner} />
            </div>
            <span class="text-center text-[11px] font-medium text-muted">{spec?.label ?? props.type}</span>
        </div>
    );
};
