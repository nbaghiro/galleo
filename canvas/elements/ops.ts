import type { ElementAddress } from "@model/target";
import type {
    ArtifactContent,
    ElementInstance,
    Id,
    Section,
    SectionBackground,
} from "@model/artifact";
import type { ElementLayout } from "@model/geometry";
import { getElement } from "@elements/spec";
import { LAYOUT_PRESETS, colGroup, emptyRegion, rowGroup, withWidth } from "@model/section";

// A section's content is ONE recursive tree (`section.root`); an element is addressed by its index PATH —
// `[]` the root, `[0]` its first child. Every op returns a fresh tree, never mutating the input.

const clamp = (i: number, len: number): number => Math.max(0, Math.min(i, len));

function mapSection(art: ArtifactContent, id: Id, fn: (s: Section) => Section): ArtifactContent {
    return { ...art, sections: art.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

const putRoot = (art: ArtifactContent, id: Id, root: ElementInstance): ArtifactContent =>
    mapSection(art, id, (s) => ({ ...s, root }));

// container access via the spec `container` contract (registry-aware mirror of @model/section's raw walk)
function childrenOf(inst: ElementInstance): ElementInstance[] | null {
    const spec = getElement(inst.type);
    return spec?.container ? spec.container.children(inst.data) : null;
}

function withChildren(inst: ElementInstance, children: ElementInstance[]): ElementInstance {
    const spec = getElement(inst.type);
    if (!spec?.container) throw new Error(`not a container: ${inst.type}`);
    return { ...inst, data: spec.container.withChildren(inst.data, children) };
}

const isContainer = (inst: ElementInstance): boolean => !!getElement(inst.type)?.container;

const isEmptyContainer = (inst: ElementInstance): boolean => {
    const kids = childrenOf(inst);
    return kids !== null && kids.length === 0;
};

const isRow = (inst: ElementInstance): boolean =>
    inst.type === "group" && (inst.data as { direction?: string }).direction === "row";

const widthPct = (inst: ElementInstance): number | undefined => {
    const w = inst.layout?.width;
    return w && typeof w === "object" ? w.pct : undefined;
};

export const stripWidth = (inst: ElementInstance): ElementInstance => {
    if (!inst.layout || inst.layout.width === undefined) return inst;
    const { width: _width, ...rest } = inst.layout;
    return Object.keys(rest).length ? { ...inst, layout: rest } : { ...inst, layout: undefined };
};

function nodeAt(root: ElementInstance, path: number[]): ElementInstance | undefined {
    let inst: ElementInstance | undefined = root;
    for (const i of path) {
        if (!inst) return undefined;
        inst = childrenOf(inst)?.[i];
    }
    return inst;
}

function updateNodeAt(
    root: ElementInstance,
    path: number[],
    fn: (inst: ElementInstance) => ElementInstance,
): ElementInstance {
    if (path.length === 0) return fn(root);
    const kids = childrenOf(root);
    if (!kids) return root;
    const [i, ...rest] = path;
    return withChildren(
        root,
        kids.map((c, idx) => (idx === i ? updateNodeAt(c, rest, fn) : c)),
    );
}

export function getElementAt(
    art: ArtifactContent,
    addr: ElementAddress,
): ElementInstance | undefined {
    const section = art.sections.find((s) => s.id === addr.section);
    return section ? nodeAt(section.root, addr.path) : undefined;
}

function updateElementAt(
    art: ArtifactContent,
    addr: ElementAddress,
    fn: (inst: ElementInstance) => ElementInstance,
): ArtifactContent {
    return mapSection(art, addr.section, (s) => ({
        ...s,
        root: updateNodeAt(s.root, addr.path, fn),
    }));
}

export function updateDataAt(
    art: ArtifactContent,
    addr: ElementAddress,
    data: unknown,
): ArtifactContent {
    return updateElementAt(art, addr, (inst) => ({ ...inst, data }));
}

// used by the AI regenerate-element flow
export function setElementAt(
    art: ArtifactContent,
    addr: ElementAddress,
    element: ElementInstance,
): ArtifactContent {
    return updateElementAt(art, addr, () => element);
}

export function setElementLayout(
    art: ArtifactContent,
    addr: ElementAddress,
    layout: ElementLayout,
): ArtifactContent {
    return updateElementAt(art, addr, (inst) => ({ ...inst, layout }));
}

// remove the node at `addr` (no collapse); removing the root clears the section to an empty region
export function removeAt(art: ArtifactContent, addr: ElementAddress): ArtifactContent {
    const { path } = addr;
    if (path.length === 0) return putRoot(art, addr.section, emptyRegion());
    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1]!;
    return mapSection(art, addr.section, (s) => ({
        ...s,
        root: updateNodeAt(s.root, parentPath, (parent) => {
            const kids = childrenOf(parent);
            if (!kids) return parent;
            return withChildren(
                parent,
                kids.filter((_, i) => i !== idx),
            );
        }),
    }));
}

// renormalize a row's widths so survivors sum back to 100%; no-op for rows without explicit widths
function renormalizeWidths(children: ElementInstance[]): ElementInstance[] {
    const vals = children.map(widthPct);
    if (!vals.some((v) => v !== undefined)) return children;
    const filled = children.map((_, i) => vals[i] ?? 100 / children.length);
    const sum = filled.reduce((a, b) => a + b, 0) || 1;
    return children.map((c, i) => withWidth(c, Math.round((filled[i]! / sum) * 100)));
}

// after a container lost a child: unwrap a redundant single-child group (hoisting its width), else
// rebalance a row's widths
function fixContainer(node: ElementInstance): ElementInstance {
    const kids = childrenOf(node);
    if (!kids) return node;
    if (node.type === "group" && kids.length === 1) {
        const only = kids[0]!;
        const w = node.layout?.width;
        return w !== undefined ? { ...only, layout: { ...only.layout, width: w } } : only;
    }
    if (isRow(node) && kids.length > 1) return withChildren(node, renormalizeWidths(kids));
    return node;
}

// collapse ONLY along `parentPath` (the emptied container, cascading up) so unrelated empty regions stay put
function collapseAlong(node: ElementInstance, parentPath: number[]): ElementInstance {
    if (parentPath.length === 0) return fixContainer(node);
    const kids = childrenOf(node);
    const i = parentPath[0]!;
    if (!kids || i >= kids.length) return node;
    const child = collapseAlong(kids[i]!, parentPath.slice(1));
    const next = isEmptyContainer(child)
        ? kids.filter((_, idx) => idx !== i)
        : kids.map((c, idx) => (idx === i ? child : c));
    return fixContainer(withChildren(node, next));
}

export function collapseSection(
    art: ArtifactContent,
    id: Id,
    parentPath: number[],
): ArtifactContent {
    return mapSection(art, id, (s) => {
        let root = collapseAlong(s.root, parentPath);
        if (isEmptyContainer(root)) root = emptyRegion();
        return { ...s, root: stripWidth(root) };
    });
}

// user-facing delete: remove, then collapse the emptied column/region
export function deleteElement(art: ArtifactContent, addr: ElementAddress): ArtifactContent {
    return collapseSection(removeAt(art, addr), addr.section, addr.path.slice(0, -1));
}

// insert `element` as child `index` of the container at `parentAddr`; no-op if the target isn't a container
export function insertChild(
    art: ArtifactContent,
    parentAddr: ElementAddress,
    index: number,
    element: ElementInstance,
): ArtifactContent {
    return updateElementAt(art, parentAddr, (parent) => {
        const kids = childrenOf(parent);
        if (!kids) return parent;
        // width invariant: a row's columns are all width-less (even split) or all present summing to 100%.
        // Strip the newcomer's stale width + renormalize; non-row containers insert verbatim.
        const row = isRow(parent);
        const next = [...kids];
        next.splice(clamp(index, next.length), 0, row ? stripWidth(element) : element);
        return withChildren(parent, row ? renormalizeWidths(next) : next);
    });
}

// wrap `addr` + `element` into a group of `direction`; used when dropping beside a leaf (no container yet)
export function wrapWith(
    art: ArtifactContent,
    addr: ElementAddress,
    element: ElementInstance,
    before: boolean,
    direction: "row" | "col",
): ArtifactContent {
    return updateElementAt(art, addr, (inst) => {
        const children = before ? [element, stripWidth(inst)] : [stripWidth(inst), element];
        return direction === "row" ? rowGroup(children) : colGroup(children);
    });
}

// used to drop into an empty region (the placeholder becomes the dropped element)
export function replaceAt(
    art: ArtifactContent,
    addr: ElementAddress,
    element: ElementInstance,
): ArtifactContent {
    return updateElementAt(art, addr, () => element);
}

export function duplicateAt(art: ArtifactContent, addr: ElementAddress): ArtifactContent {
    const inst = getElementAt(art, addr);
    if (!inst) return art;
    const clone = structuredClone(inst);
    if (addr.path.length === 0) return putRoot(art, addr.section, colGroup([inst, clone]));
    const idx = addr.path[addr.path.length - 1]!;
    // via insertChild so duplicating a column renormalizes widths instead of over-committing past 100%
    return insertChild(
        art,
        { section: addr.section, path: addr.path.slice(0, -1) },
        idx + 1,
        clone,
    );
}

// where the duplicate lands (its new sibling slot), so callers can reselect the copy
export function duplicatedAddr(addr: ElementAddress): ElementAddress {
    if (addr.path.length === 0) return { section: addr.section, path: [1] };
    const path = [...addr.path];
    path[path.length - 1] = path[path.length - 1]! + 1;
    return { section: addr.section, path };
}

// the section's top-level columns: the root row's children, else the whole root as one column
function currentColumns(root: ElementInstance): ElementInstance[] {
    return isRow(root) ? (childrenOf(root) ?? []) : [root];
}

// insert a column at `index` (wrapping a non-row root into a row first); columns drop widths → even split
export function addColumn(
    art: ArtifactContent,
    sectionId: Id,
    index: number,
    element: ElementInstance,
): { art: ArtifactContent; path: number[] } {
    const section = art.sections.find((s) => s.id === sectionId);
    if (!section) return { art, path: [] };
    const cols = currentColumns(section.root).map(stripWidth);
    const at = clamp(index, cols.length);
    cols.splice(at, 0, element);
    const single = cols.length === 1;
    const root = single ? cols[0]! : rowGroup(cols);
    return { art: putRoot(art, sectionId, root), path: single ? [] : [at] };
}

// rebuild `fractions.length` columns: pad with empty regions when growing, merge overflow into the last
// kept column when shrinking
function splitRoot(cols: ElementInstance[], fractions: number[]): ElementInstance {
    const n = fractions.length;
    let next: ElementInstance[];
    if (n >= cols.length) {
        next = [...cols];
        while (next.length < n) next.push(emptyRegion());
    } else {
        next = cols.slice(0, n - 1);
        const rest = cols.slice(n - 1);
        next.push(rest.length === 1 ? rest[0]! : colGroup(rest));
    }
    return n === 1 ? stripWidth(next[0]!) : rowGroup(next, fractions);
}

// reflow a section into columns of the given fractions; shared by applyLayoutPreset + @elements/layouts
export function splitSection(section: Section, fractions: number[]): Section {
    return { ...section, root: splitRoot(currentColumns(section.root).map(stripWidth), fractions) };
}

export function applyLayoutPreset(
    art: ArtifactContent,
    sectionId: Id,
    presetId: string,
): ArtifactContent {
    return mapSection(art, sectionId, (s) => splitSection(s, LAYOUT_PRESETS[presetId] ?? [1]));
}

// width fractions of the current top-level columns (for the inspector's active-preset match)
export function columnFractions(section: Section): number[] {
    const cols = currentColumns(section.root);
    if (cols.length <= 1) return [1];
    const vals = cols.map((c) => widthPct(c));
    if (!vals.some((v) => v !== undefined)) return cols.map(() => 1 / cols.length);
    const filled = cols.map((_, i) => (vals[i] ?? 100 / cols.length) / 100);
    return filled;
}

export function setSectionBackground(
    art: ArtifactContent,
    section: Id,
    background: SectionBackground,
): ArtifactContent {
    return mapSection(art, section, (s) => ({ ...s, background }));
}

export function setSectionBleed(
    art: ArtifactContent,
    section: Id,
    bleed: boolean,
): ArtifactContent {
    return mapSection(art, section, (s) => ({ ...s, bleed }));
}

export function insertSection(
    art: ArtifactContent,
    index: number,
    section: Section,
): ArtifactContent {
    const sections = [...art.sections];
    sections.splice(clamp(index, sections.length), 0, section);
    return { ...art, sections };
}

export function removeSection(art: ArtifactContent, id: Id): ArtifactContent {
    if (art.sections.length <= 1) return art; // keep at least one section
    return { ...art, sections: art.sections.filter((s) => s.id !== id) };
}

export function moveSection(art: ArtifactContent, id: Id, delta: number): ArtifactContent {
    const i = art.sections.findIndex((s) => s.id === id);
    if (i < 0) return art;
    const j = clamp(i + delta, art.sections.length - 1);
    if (i === j) return art;
    const sections = [...art.sections];
    const [sec] = sections.splice(i, 1);
    sections.splice(j, 0, sec!);
    return { ...art, sections };
}

export function duplicateSection(art: ArtifactContent, id: Id, newId: Id): ArtifactContent {
    const i = art.sections.findIndex((s) => s.id === id);
    if (i < 0) return art;
    const copy: Section = { ...structuredClone(art.sections[i]!), id: newId };
    return insertSection(art, i + 1, copy);
}

export function setArtifactTheme(art: ArtifactContent, theme: Id): ArtifactContent {
    return { ...art, theme };
}

export function setArtifactFormat(art: ArtifactContent, format: Id): ArtifactContent {
    return { ...art, format };
}

export { isContainer };
