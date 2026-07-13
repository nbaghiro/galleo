import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register, getElement, skeletonize, GHOST } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { mix } from "@themes";

// palette-hidden type spliced into a preview artifact while dragging over open space
export const DROP_GHOST = "__dropghost";

interface GhostData {
    type: string; // the dragged element's type, whose skeleton this mirrors
    data?: unknown; // dragged element's real data → a MOVE ghost matches it (not a default)
}

// retint hand-authored GHOST fills to a theme tone so custom skeletons match the themed preview
function retint(node: EngineNode, to: string): EngineNode {
    const out: EngineNode = { ...node };
    if (out.fill?.color === GHOST) out.fill = { ...out.fill, color: to };
    if (out.children) out.children = out.children.map((c) => retint(c, to));
    return out;
}

// the live drop preview, spliced inline so the section reflows to the post-drop state. MOVE (has data) →
// the real element dimmed; NEW → the element's skeleton (custom `skeleton`, else auto-skeletonized).
const DIM = 0.45; // opacity of the real element at the drop target

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
        const inner: EngineNode = ((): EngineNode => {
            if (!spec || spec.type === DROP_GHOST)
                return skeletonize({ w: grow(), h: fit(28) }, colors);
            if (data.data !== undefined) return { ...spec.layout(data.data, ctx), opacity: DIM };
            return spec.skeleton
                ? retint(spec.skeleton(ctx), colors.bar)
                : skeletonize(spec.layout(spec.create(), ctx), colors);
        })();
        return {
            w: grow(),
            h: fit(),
            padding: { top: 8, right: 8, bottom: 8, left: 8 },
            fill: {
                color: `color-mix(in srgb, ${ctx.theme.accent} 8%, transparent)`,
                radius: 10,
                border: { color: ctx.theme.accent, width: 2, style: "dashed" },
            },
            children: [inner],
        };
    },
    controls: [],
};

register(dropGhostElement);
