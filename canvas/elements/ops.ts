import type { ElementAddress } from "@model/artifact";
import type {
    ArtifactContent,
    ElementInstance,
    Id,
    Section,
    SectionBackground,
    SectionNotes,
    ArtifactMusic,
} from "@model/artifact";
import type { ElementLayout } from "@model/geometry";
import { getElement } from "@elements/spec";
import {
    LAYOUT_PRESETS,
    colGroup,
    elementRegionId,
    emptyRegion,
    parseTarget,
    rowGroup,
    withFreshElementIds,
    withWidth,
} from "@model/artifact";

// Elements are addressed by index path into `section.root` (`[]` = the root); every op returns a
// fresh tree, never mutating the input.

const clamp = (i: number, len: number): number => Math.max(0, Math.min(i, len));

function mapSection(art: ArtifactContent, id: Id, fn: (s: Section) => Section): ArtifactContent {
    return { ...art, sections: art.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

const putRoot = (art: ArtifactContent, id: Id, root: ElementInstance): ArtifactContent =>
    mapSection(art, id, (s) => ({ ...s, root }));

/**
 * A container's children, asked of the registry rather than read off `data.children`.
 *
 * Not every container stores them under that key: a grid keeps cells, a diagram keeps nodes. The raw
 * walk in @model/artifact misses both, so anything counting or summing a subtree uses this.
 */
export function childrenOf(inst: ElementInstance): ElementInstance[] | null {
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
    inst.type === "container" && (inst.data as { direction?: string }).direction === "row";

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

/**
 * Every stamped element's id to where it currently sits. Registry-aware, so a path here is the same
 * one compose tags its region with; an id that no longer appears means the element was replaced,
 * and whatever pointed at it has nothing on the canvas to hang on.
 */
export function elementIdMap(art: ArtifactContent): Map<Id, ElementAddress> {
    const out = new Map<Id, ElementAddress>();
    const walk = (inst: ElementInstance, addr: ElementAddress): void => {
        if (inst.id && !out.has(inst.id)) out.set(inst.id, addr);
        childrenOf(inst)?.forEach((kid, i) =>
            walk(kid, { section: addr.section, path: [...addr.path, i] }),
        );
    };
    for (const section of art.sections) walk(section.root, { section: section.id, path: [] });
    return out;
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

// after a container lost a child: unwrap a redundant single-child group, else rebalance widths
function fixContainer(node: ElementInstance): ElementInstance {
    const kids = childrenOf(node);
    if (!kids) return node;
    if (node.type === "container" && kids.length === 1) {
        // the survivor's column width died with its row: full width, or the group's own slot
        const only = stripWidth(kids[0]!);
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

export function insertChild(
    art: ArtifactContent,
    parentAddr: ElementAddress,
    index: number,
    element: ElementInstance,
): ArtifactContent {
    return updateElementAt(art, parentAddr, (parent) => {
        const kids = childrenOf(parent);
        if (!kids) return parent;
        // width invariant: a row's columns are all width-less (even split) or all summing to 100%
        const row = isRow(parent);
        const next = [...kids];
        next.splice(clamp(index, next.length), 0, row ? stripWidth(element) : element);
        return withChildren(parent, row ? renormalizeWidths(next) : next);
    });
}

// used when dropping beside a leaf, where there is no container yet
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
    // a copy is a new node, so it must not answer to the original's id
    const clone = withFreshElementIds(structuredClone(inst));
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

function currentColumns(root: ElementInstance): ElementInstance[] {
    return isRow(root) ? (childrenOf(root) ?? []) : [root];
}

// wraps a non-row root into a row first; columns drop widths → even split
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

// pad with empty regions when growing; merge overflow into the last kept column when shrinking
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

// shared by applyLayoutPreset + @elements/layouts
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

// for the inspector's active-preset match
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

export function clearBackgroundImage(bg: SectionBackground): SectionBackground {
    return {
        ...bg,
        image: undefined,
        kind: bg.gradient ? "gradient" : bg.color ? "color" : "none",
    };
}

export function setSectionBleed(
    art: ArtifactContent,
    section: Id,
    bleed: boolean,
): ArtifactContent {
    return mapSection(art, section, (s) => ({ ...s, bleed }));
}

/** null clears the notes entirely, so an emptied panel leaves no key behind on the row. */
export function setSectionNotes(
    art: ArtifactContent,
    section: Id,
    notes: SectionNotes | null,
): ArtifactContent {
    return mapSection(art, section, (s) => {
        if (!notes) {
            const { notes: _dropped, ...rest } = s;
            return rest;
        }
        return { ...s, notes };
    });
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
    const source = structuredClone(art.sections[i]!);
    const copy: Section = { ...source, id: newId, root: withFreshElementIds(source.root) };
    return insertSection(art, i + 1, copy);
}

export function setArtifactTheme(art: ArtifactContent, theme: Id): ArtifactContent {
    return { ...art, theme };
}

export function setArtifactFormat(art: ArtifactContent, format: Id): ArtifactContent {
    return { ...art, format };
}

/** The bed this piece plays while it is presented. */
export function setArtifactMusic(art: ArtifactContent, music: ArtifactMusic): ArtifactContent {
    return { ...art, music };
}

/** null clears the override, so the piece follows the workspace default again. */
export function setArtifactVoice(art: ArtifactContent, voice: Id | null): ArtifactContent {
    if (!voice) {
        const { voice: _dropped, ...rest } = art;
        return rest;
    }
    return { ...art, voice };
}

// Viewer state and the affordances that move it. A `hit:` region means one thing in the editor (the
// author is setting the stored default) and another in playback (this reader, this session), so what
// an action does to the data is defined once here and written by whichever surface pressed it.

const asData = (inst: ElementInstance): Record<string, unknown> =>
    inst.data as Record<string, unknown>;

/** Per-viewer overrides, keyed by the `elementRegionId` of the element each one patches. */
export type ViewerPatches = ReadonlyMap<string, Record<string, unknown>>;

function patchSection(section: Section, patches: ViewerPatches): Section {
    const walk = (inst: ElementInstance, addr: ElementAddress): ElementInstance => {
        let next = inst;
        const kids = childrenOf(inst);
        if (kids) {
            let moved = false;
            const mapped = kids.map((kid, i) => {
                const k = walk(kid, { section: addr.section, path: [...addr.path, i] });
                if (k !== kid) moved = true;
                return k;
            });
            if (moved) next = withChildren(inst, mapped);
        }
        const patch = patches.get(elementRegionId(addr));
        return patch ? { ...next, data: { ...asData(next), ...patch } } : next;
    };
    const root = walk(section.root, { section: section.id, path: [] });
    return root === section.root ? section : { ...section, root };
}

/**
 * Stored content with a viewer's overrides folded in. Fresh objects only along the touched paths,
 * so the section paint cache (keyed on section identity) misses exactly the sections that moved.
 */
export function withViewerPatches(art: ArtifactContent, patches: ViewerPatches): ArtifactContent {
    if (patches.size === 0) return art;
    const touched = new Set<Id>();
    for (const key of patches.keys()) {
        const t = parseTarget(key);
        if (t?.kind === "element") touched.add(t.address.section);
    }
    let moved = false;
    const sections = art.sections.map((s) => {
        if (!touched.has(s.id)) return s;
        const next = patchSection(s, patches);
        if (next !== s) moved = true;
        return next;
    });
    return moved ? { ...art, sections } : art;
}

export interface AffordanceEdit {
    address: ElementAddress; // whose data moves, which is not always the addressed element
    patch: Record<string, unknown>;
}

/** What pressing a `hit:<action>` region does. Unknown actions are inert rather than an error. */
export function affordanceEdit(
    art: ArtifactContent,
    action: string,
    address: ElementAddress,
): AffordanceEdit | null {
    if (action === "checkbox" || action === "disclose") {
        const inst = getElementAt(art, address);
        if (!inst) return null;
        const key = action === "checkbox" ? "checked" : "open";
        return { address, patch: { [key]: asData(inst)[key] !== true } };
    }
    if (action === "tab") {
        // the strip addresses the panel; what changes is its container's active index
        const index = address.path[address.path.length - 1];
        if (index === undefined) return null;
        const parent = { section: address.section, path: address.path.slice(0, -1) };
        return getElementAt(art, parent) ? { address: parent, patch: { active: index } } : null;
    }
    return null;
}

/** The affordance written into the document, which is what pressing one means in the editor. */
export function applyAffordance(
    art: ArtifactContent,
    action: string,
    address: ElementAddress,
): ArtifactContent {
    const edit = affordanceEdit(art, action, address);
    const inst = edit && getElementAt(art, edit.address);
    if (!edit || !inst) return art;
    return updateDataAt(art, edit.address, { ...asData(inst), ...edit.patch });
}

// Live overlays: the elements a playback surface mounts real DOM over, and the static reduction
// every other surface renders instead.

export interface LiveElement {
    id: string; // the region id its paint carries, which is how the overlay finds its box
    type: string;
    data: Record<string, unknown>;
}

const isLive = (type: string): boolean => {
    const spec = getElement(type);
    return spec?.tier === "interactive" || spec?.live === true;
};

/** Every element a playback surface mounts real DOM over, in paint order. */
export function liveElements(art: ArtifactContent): LiveElement[] {
    const out: LiveElement[] = [];
    const walk = (inst: ElementInstance, addr: ElementAddress): void => {
        if (isLive(inst.type))
            out.push({ id: elementRegionId(addr), type: inst.type, data: asData(inst) });
        childrenOf(inst)?.forEach((kid, i) =>
            walk(kid, { section: addr.section, path: [...addr.path, i] }),
        );
    };
    for (const s of art.sections) walk(s.root, { section: s.id, path: [] });
    return out;
}

/**
 * The overrides a playback surface starts with: a live element's disclosure is chrome the reader
 * opens, so it begins shut however the author stored it. Only the ones actually left open are
 * patched, since a no-op override would rebuild that section's data on every repaint.
 */
export function seedViewerPatches(art: ArtifactContent): Map<string, Record<string, unknown>> {
    const out = new Map<string, Record<string, unknown>>();
    const walk = (inst: ElementInstance, addr: ElementAddress): void => {
        if (isLive(inst.type) && asData(inst).open === true)
            out.set(elementRegionId(addr), { open: false });
        childrenOf(inst)?.forEach((kid, i) =>
            walk(kid, { section: addr.section, path: [...addr.path, i] }),
        );
    };
    for (const s of art.sections) walk(s.root, { section: s.id, path: [] });
    return out;
}

/**
 * Interactive elements reduced to what a surface with no live layer should show (`ElementSpec
 * .fallback`). Identity when nothing declares one, so an export path can call it unconditionally.
 */
export function applyFallbacks(art: ArtifactContent): ArtifactContent {
    const fix = (inst: ElementInstance): ElementInstance => {
        let next = inst;
        const kids = childrenOf(inst);
        if (kids) {
            let moved = false;
            const mapped = kids.map((kid) => {
                const k = fix(kid);
                if (k !== kid) moved = true;
                return k;
            });
            if (moved) next = withChildren(inst, mapped);
        }
        const data = getElement(inst.type)?.fallback?.(next.data);
        return data === undefined || data === next.data ? next : { ...next, data };
    };
    let moved = false;
    const sections = art.sections.map((s) => {
        const root = fix(s.root);
        if (root === s.root) return s;
        moved = true;
        return { ...s, root };
    });
    return moved ? { ...art, sections } : art;
}

export { isContainer };
