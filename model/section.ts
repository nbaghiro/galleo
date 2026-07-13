import type { ElementInstance } from "@model/artifact";

// column fractions per named starter layout
export const LAYOUT_PRESETS: Record<string, number[]> = {
    full: [1],
    "split-6040": [0.6, 0.4],
    "split-4060": [0.4, 0.6],
    "two-col": [0.5, 0.5],
    "three-up": [1 / 3, 1 / 3, 1 / 3],
};

// column-width share (percent 0..100)
export const withWidth = (el: ElementInstance, pct: number): ElementInstance => ({
    ...el,
    layout: { ...el.layout, width: { pct } },
});

export const COLUMN_GAP = 28; // gutter between columns of a section row

// widths (fractions ~1) set each column's share; omitted → even split
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

export const colGroup = (children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { direction: "col", children },
});

// childless group; compose paints it as the dashed drop placeholder
export const emptyRegion = (): ElementInstance => ({ type: "group", data: { children: [] } });

// registry-free tree navigation over the data.children convention

export function childrenRaw(inst: ElementInstance): ElementInstance[] | undefined {
    const kids = (inst.data as { children?: ElementInstance[] }).children;
    return Array.isArray(kids) ? kids : undefined;
}

const withChildrenRaw = (inst: ElementInstance, children: ElementInstance[]): ElementInstance => ({
    ...inst,
    data: { ...(inst.data as Record<string, unknown>), children },
});

// replace the node at path; [] targets the root
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

// remove the node at path; removing the root clears to an empty region
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
