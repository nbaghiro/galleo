import type { Component } from "solid-js";
import { getElement } from "@elements/registry";
import { startDrag } from "./dnd";
import { previewSvg } from "./element-previews";

// One draggable element: a designed, theme-driven SVG preview (recolors with the active theme) + label.
export const PaletteItem: Component<{ type: string }> = (props) => {
    const spec = getElement(props.type);
    return (
        <div
            class="flex cursor-grab select-none flex-col gap-1.5"
            onPointerDown={(e) => {
                e.preventDefault();
                startDrag({ kind: "new", type: props.type }, e.clientX, e.clientY, spec?.label ?? props.type);
            }}
        >
            <div
                class="h-16 overflow-hidden rounded-lg border border-line bg-canvas p-2 transition-colors hover:border-accent"
                innerHTML={previewSvg(props.type)}
            />
            <span class="text-center text-[11px] font-medium text-muted">{spec?.label ?? props.type}</span>
        </div>
    );
};
