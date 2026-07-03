import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { getElement, register } from "@elements/registry";
import { skeletonize } from "@elements/skeleton";
import { fit, grow } from "@model/size";
import { mix } from "@themes/color";

// The palette-hidden type inserted into a *preview* artifact while dragging over open space.
export const DROP_GHOST = "__dropghost";

interface GhostData {
    type: string; // the dragged element's type, whose skeleton this mirrors
}

// Internal, palette-hidden element rendered ONLY as the live drop preview. It lays out the dragged
// element's own structural skeleton inline, so when spliced into a preview artifact the section reflows
// and auto-sizes to the post-drop state — instead of squishing a fixed overlay into the current gap. A
// dashed accent outline + theme-toned ghost mark it as a pending drop.
export const dropGhostElement: ElementSpec<GhostData> = {
    type: DROP_GHOST,
    label: "Drop preview",
    category: "internal",
    tier: "primitive",
    create: () => ({ type: "text" }),
    layout: (data: GhostData, ctx: LayoutCtx): EngineNode => {
        const spec = getElement(data.type);
        const colors = {
            bar: mix(ctx.theme.surface, ctx.theme.ink, 0.2),
            panel: ctx.theme.surface,
            line: ctx.theme.line,
        };
        const base: EngineNode =
            spec && spec.type !== DROP_GHOST
                ? spec.layout(spec.create(), ctx)
                : { w: grow(), h: fit(28) };
        return {
            w: grow(),
            h: fit(),
            padding: { top: 8, right: 8, bottom: 8, left: 8 },
            fill: {
                color: `color-mix(in srgb, ${ctx.theme.accent} 8%, transparent)`,
                radius: 10,
                border: { color: ctx.theme.accent, width: 2, style: "dashed" },
            },
            children: [skeletonize(base, colors)],
        };
    },
    controls: [],
};

register(dropGhostElement);
