import type { ElementAddress } from "@model/target";
import type {
    ArtifactContent,
    Cell,
    ElementInstance,
    ElementLayout,
    Id,
    Section,
    SectionBackground,
} from "@model/artifact";
import { getElement } from "@elements/registry";

// Pure, immutable content ops over an artifact. Container traversal/editing goes through the
// `container` contract (children/withChildren), so they work for any container, not just groups.
// Snapshot-style: every op returns a fresh tree (cheap for JSONB-sized artifacts).

const clamp = (i: number, len: number): number => Math.max(0, Math.min(i, len));

function mapSection(art: ArtifactContent, id: Id, fn: (s: Section) => Section): ArtifactContent {
    return { ...art, sections: art.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

function putCell(section: Section, cellKey: string, cell: Cell): Section {
    return { ...section, cells: { ...section.cells, [cellKey]: cell } };
}

function childrenOf(inst: ElementInstance): ElementInstance[] | null {
    const spec = getElement(inst.type);
    return spec?.container ? spec.container.children(inst.data) : null;
}

function withChildren(inst: ElementInstance, children: ElementInstance[]): ElementInstance {
    const spec = getElement(inst.type);
    if (!spec?.container) throw new Error(`not a container: ${inst.type}`);
    return { ...inst, data: spec.container.withChildren(inst.data, children) };
}

function wrapGroup(children: ElementInstance[], direction: "row" | "col" = "col"): ElementInstance {
    const g = getElement("group");
    if (!g?.container) throw new Error("group element not registered");
    const data = g.container.withChildren(g.create(), children) as Record<string, unknown>;
    return { type: "group", data: { ...data, direction } };
}

export function getElementAt(
    art: ArtifactContent,
    addr: ElementAddress,
): ElementInstance | undefined {
    let inst = art.sections.find((s) => s.id === addr.section)?.cells[addr.cell]?.element;
    for (const i of addr.path) {
        if (!inst) return undefined;
        inst = childrenOf(inst)?.[i];
    }
    return inst;
}

export function setCellElement(
    art: ArtifactContent,
    section: Id,
    cell: string,
    element: ElementInstance | undefined,
): ArtifactContent {
    return mapSection(art, section, (s) => putCell(s, cell, element ? { element } : {}));
}

// Insert at top-level index within a cell, wrapping a lone non-container element into a group so the
// cell can hold several elements. `direction` sets the wrap orientation (row = side-by-side, col =
// stacked) when a lone element gets wrapped; inserting into an existing container keeps its own layout.
export function insertInCell(
    art: ArtifactContent,
    section: Id,
    cell: string,
    index: number,
    element: ElementInstance,
    direction: "row" | "col" = "col",
): ArtifactContent {
    return mapSection(art, section, (s) => {
        const current = s.cells[cell]?.element;
        if (!current) return putCell(s, cell, { element });
        const kids = childrenOf(current);
        if (kids) {
            const next = [...kids];
            next.splice(clamp(index, next.length), 0, element);
            return putCell(s, cell, { element: withChildren(current, next) });
        }
        const next = [current];
        next.splice(clamp(index, 1), 0, element);
        return putCell(s, cell, { element: wrapGroup(next, direction) });
    });
}

// Remove the element at `addr`: top-level clears the cell; a direct container child is spliced out.
export function removeAt(art: ArtifactContent, addr: ElementAddress): ArtifactContent {
    return mapSection(art, addr.section, (s) => {
        const root = s.cells[addr.cell]?.element;
        if (!root) return s;
        if (addr.path.length === 0) return putCell(s, addr.cell, {});
        if (addr.path.length === 1) {
            const kids = childrenOf(root);
            if (!kids) return s;
            const next = kids.filter((_, i) => i !== addr.path[0]);
            if (next.length === 0) return putCell(s, addr.cell, {});
            return putCell(s, addr.cell, { element: withChildren(root, next) });
        }
        return s; // deeper nesting: not handled yet
    });
}

// Duplicate the element at `addr`, inserting the copy as its next sibling. A lone top-level element is
// wrapped with its copy into a group (a cell holds one element); a container child is spliced in place.
export function duplicateAt(art: ArtifactContent, addr: ElementAddress): ArtifactContent {
    const inst = getElementAt(art, addr);
    if (!inst) return art;
    const clone = structuredClone(inst);
    if (addr.path.length === 0) {
        return mapSection(art, addr.section, (s) => {
            const current = s.cells[addr.cell]?.element;
            return current ? putCell(s, addr.cell, { element: wrapGroup([current, clone]) }) : s;
        });
    }
    const parentPath = addr.path.slice(0, -1);
    const idx = addr.path[addr.path.length - 1]!;
    return updateElementAt(
        art,
        { section: addr.section, cell: addr.cell, path: parentPath },
        (parent) => {
            const kids = childrenOf(parent);
            if (!kids) return parent;
            const next = [...kids];
            next.splice(idx + 1, 0, clone);
            return withChildren(parent, next);
        },
    );
}

// The address the duplicate lands at (its new sibling slot), so callers can reselect the copy.
export function duplicatedAddr(addr: ElementAddress): ElementAddress {
    if (addr.path.length === 0) return { ...addr, path: [1] };
    const path = [...addr.path];
    path[path.length - 1] = path[path.length - 1]! + 1;
    return { ...addr, path };
}

function updateInTree(
    inst: ElementInstance,
    path: number[],
    fn: (i: ElementInstance) => ElementInstance,
): ElementInstance {
    if (path.length === 0) return fn(inst);
    const kids = childrenOf(inst);
    if (!kids) return inst;
    const i = path[0]!;
    const rest = path.slice(1);
    return withChildren(
        inst,
        kids.map((c, idx) => (idx === i ? updateInTree(c, rest, fn) : c)),
    );
}

function updateElementAt(
    art: ArtifactContent,
    addr: ElementAddress,
    fn: (inst: ElementInstance) => ElementInstance,
): ArtifactContent {
    return mapSection(art, addr.section, (s) => {
        const root = s.cells[addr.cell]?.element;
        return root ? putCell(s, addr.cell, { element: updateInTree(root, addr.path, fn) }) : s;
    });
}

export function updateDataAt(
    art: ArtifactContent,
    addr: ElementAddress,
    data: unknown,
): ArtifactContent {
    return updateElementAt(art, addr, (inst) => ({ ...inst, data }));
}

export function setElementLayout(
    art: ArtifactContent,
    addr: ElementAddress,
    layout: ElementLayout,
): ArtifactContent {
    return updateElementAt(art, addr, (inst) => ({ ...inst, layout }));
}

export function setSectionGrid(art: ArtifactContent, section: Id, grid: string): ArtifactContent {
    // Changing the grid preset invalidates any custom column fractions (different cell count).
    return mapSection(art, section, (s) => ({ ...s, grid, widths: undefined }));
}

export function setSectionWidths(
    art: ArtifactContent,
    section: Id,
    widths: number[],
): ArtifactContent {
    return mapSection(art, section, (s) => ({ ...s, widths }));
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
