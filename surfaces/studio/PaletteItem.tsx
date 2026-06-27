import type { EngineNode } from "@engine/node";
import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { getElement } from "@elements/registry";
import { skeletonFor } from "@elements/skeleton";
import { fit, grow } from "@model/size";
import { startDrag } from "./dnd";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { ctxFor, layoutNode } from "./render";

const FRAME_H = 58;

// One draggable element: its structural skeleton, laid out at the frame width and centered, scaled
// down only if too tall — so every tile is uniform and the preview is centered.
export const PaletteItem: Component<{ type: string }> = (props) => {
    let inner!: HTMLDivElement;
    const spec = getElement(props.type);

    createEffect(() => {
        if (!spec) return;
        const frameW = inner.parentElement?.clientWidth ?? 120;
        const skel = skeletonFor(spec, ctxFor(frameW));
        skel.alignX = "center";
        const node: EngineNode = {
            w: grow(),
            h: fit(),
            direction: "col",
            alignX: "center",
            alignY: "center",
            children: [skel],
        };
        const { commands, height } = layoutNode(node, frameW, measureText);
        const scale = Math.min(1, (FRAME_H - 14) / Math.max(1, height));
        inner.style.width = `${frameW}px`;
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
                startDrag(
                    { kind: "new", type: props.type },
                    e.clientX,
                    e.clientY,
                    spec?.label ?? props.type,
                );
            }}
        >
            <div
                class="flex items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas transition-colors hover:border-accent"
                style={{ height: `${FRAME_H}px` }}
            >
                <div ref={inner} />
            </div>
            <span class="text-center text-[11px] font-medium text-muted">
                {spec?.label ?? props.type}
            </span>
        </div>
    );
};
