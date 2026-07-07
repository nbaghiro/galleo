import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register, getElement, skeletonize, GHOST } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { mix } from "@themes/theme";

// The palette-hidden type inserted into a *preview* artifact while dragging over open space.
export const DROP_GHOST = "__dropghost";

interface GhostData {
    type: string; // the dragged element's type, whose skeleton this mirrors
}

// Retint a hand-authored skeleton's GHOST fills to a theme-derived tone, so custom skeletons (charts,
// diagrams, …) match the themed drop preview instead of a fixed light grey.
function retint(node: EngineNode, to: string): EngineNode {
    const out: EngineNode = { ...node };
    if (out.fill?.color === GHOST) out.fill = { ...out.fill, color: to };
    if (out.children) out.children = out.children.map((c) => retint(c, to));
    return out;
}

// Internal, palette-hidden element rendered ONLY as the live drop preview. It lays out the dragged
// element's own structural skeleton inline, so when spliced into a preview artifact the section reflows
// and auto-sizes to the post-drop state — instead of squishing a fixed overlay into the current gap. A
// dashed accent outline + theme-toned ghost mark it as a pending drop. An element that declares a custom
// `skeleton` (chart/diagram shapes) uses it verbatim; everything else auto-skeletonizes its real layout.
export const dropGhostElement: ElementSpec<GhostData> = {
    type: DROP_GHOST,
    label: "Drop preview",
    category: "basic",
    tier: "primitive",
    create: () => ({ type: "text" }),
    layout: (data: GhostData, ctx: LayoutCtx): EngineNode => {
        const spec = getElement(data.type);
        const colors = {
            bar: mix(ctx.theme.surface, ctx.theme.ink, 0.2),
            panel: ctx.theme.surface,
            line: ctx.theme.line,
        };
        const ghost: EngineNode =
            spec && spec.type !== DROP_GHOST
                ? spec.skeleton
                    ? retint(spec.skeleton(ctx), colors.bar)
                    : skeletonize(spec.layout(spec.create(), ctx), colors)
                : skeletonize({ w: grow(), h: fit(28) }, colors);
        return {
            w: grow(),
            h: fit(),
            padding: { top: 8, right: 8, bottom: 8, left: 8 },
            fill: {
                color: `color-mix(in srgb, ${ctx.theme.accent} 8%, transparent)`,
                radius: 10,
                border: { color: ctx.theme.accent, width: 2, style: "dashed" },
            },
            children: [ghost],
        };
    },
    controls: [],
};

register(dropGhostElement);
