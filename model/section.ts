import type { ElementInstance } from "@model/artifact";

// Structural builders for a section's recursive content tree. A section's `root` is one of these: a
// container (a `group` laid out as a row or column, whose children each optionally carry a width) or a
// leaf content element. Columns are a row group's children; a stack is a col group; nesting is the same
// mechanism at every depth. The single source shared by authoring, the content ops, and the AI layer.

// The column fractions each named starter layout maps to — the "apply a layout preset" vocabulary.
export const LAYOUT_PRESETS: Record<string, number[]> = {
    full: [1],
    "split-6040": [0.6, 0.4],
    "split-4060": [0.4, 0.6],
    "two-col": [0.5, 0.5],
    "three-up": [1 / 3, 1 / 3, 1 / 3],
};

// Give an element an explicit column-width share (percent 0..100), preserving the rest of its layout.
export const withWidth = (el: ElementInstance, pct: number): ElementInstance => ({
    ...el,
    layout: { ...el.layout, width: { pct } },
});

export const COLUMN_GAP = 28; // gutter between columns of a section row (≈ the old per-cell padding)

// A row of children (columns), vertically centered with a column gutter. `widths` (fractions ~1, one per
// child) sets each column's share; omitted → the children split the row evenly (each grows).
export function rowGroup(children: ElementInstance[], widths?: number[]): ElementInstance {
    const kids =
        widths && widths.length === children.length
            ? children.map((c, i) => withWidth(c, Math.round((widths[i] ?? 0) * 100)))
            : children;
    return {
        type: "group",
        data: { direction: "row", align: "center", gap: COLUMN_GAP, children: kids },
    };
}

// A vertical stack of children.
export const colGroup = (children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { direction: "col", children },
});

// An empty region — a childless group. Compose paints it as the dashed "drop element" placeholder, so an
// empty column and an emptied container are the same thing.
export const emptyRegion = (): ElementInstance => ({ type: "group", data: { children: [] } });

// Raw, registry-free tree navigation over the `data.children` convention that every container element
// follows — for the edge-safe model layer (the AI patch protocol) which can't reach the element registry.
// The canvas ops mirror these through the spec `container` contract.

export function childrenRaw(inst: ElementInstance): ElementInstance[] | undefined {
    const kids = (inst.data as { children?: ElementInstance[] }).children;
    return Array.isArray(kids) ? kids : undefined;
}

const withChildrenRaw = (inst: ElementInstance, children: ElementInstance[]): ElementInstance => ({
    ...inst,
    data: { ...(inst.data as Record<string, unknown>), children },
});

// Replace the node at `path` (relative to root) with `fn(node)`. `[]` targets the root.
export function updateAtPath(
    root: ElementInstance,
    path: number[],
    fn: (inst: ElementInstance) => ElementInstance,
): ElementInstance {
    if (path.length === 0) return fn(root);
    const kids = childrenRaw(root);
    if (!kids) return root;
    const [i, ...rest] = path;
    return withChildrenRaw(
        root,
        kids.map((c, idx) => (idx === i ? updateAtPath(c, rest, fn) : c)),
    );
}

// Remove the node at `path`; removing the root clears the section to an empty region.
export function removeAtPath(root: ElementInstance, path: number[]): ElementInstance {
    if (path.length === 0) return emptyRegion();
    const parent = path.slice(0, -1);
    const idx = path[path.length - 1]!;
    return updateAtPath(root, parent, (p) => {
        const kids = childrenRaw(p);
        return kids
            ? withChildrenRaw(
                  p,
                  kids.filter((_, i) => i !== idx),
              )
            : p;
    });
}
