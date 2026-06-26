import type { ElementAddress } from "@model/address";
import type { ArtifactContent, Cell, ElementInstance, Id, Section } from "@model/content";
import { getElement } from "@elements/registry";

// Pure, immutable content ops over an artifact. Container traversal/editing goes through the
// `container` contract (children/withChildren), so they work for any container, not just groups.
// v1 is snapshot-style: every op returns a fresh tree (cheap for JSONB-sized artifacts).

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
    return { type: inst.type, data: spec.container.withChildren(inst.data, children) };
}

function wrapGroup(children: ElementInstance[]): ElementInstance {
    const g = getElement("group");
    if (!g?.container) throw new Error("group element not registered");
    return { type: "group", data: g.container.withChildren(g.create(), children) };
}

export function getElementAt(art: ArtifactContent, addr: ElementAddress): ElementInstance | undefined {
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
// cell can hold several elements.
export function insertInCell(
    art: ArtifactContent,
    section: Id,
    cell: string,
    index: number,
    element: ElementInstance,
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
        return putCell(s, cell, { element: wrapGroup(next) });
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
        return s; // deeper nesting: no-op in v1
    });
}

function updateInTree(inst: ElementInstance, path: number[], fn: (i: ElementInstance) => ElementInstance): ElementInstance {
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

export function updateElementAt(
    art: ArtifactContent,
    addr: ElementAddress,
    fn: (inst: ElementInstance) => ElementInstance,
): ArtifactContent {
    return mapSection(art, addr.section, (s) => {
        const root = s.cells[addr.cell]?.element;
        return root ? putCell(s, addr.cell, { element: updateInTree(root, addr.path, fn) }) : s;
    });
}

export function updateDataAt(art: ArtifactContent, addr: ElementAddress, data: unknown): ArtifactContent {
    return updateElementAt(art, addr, (inst) => ({ type: inst.type, data }));
}

export function setSectionGrid(art: ArtifactContent, section: Id, grid: string): ArtifactContent {
    return mapSection(art, section, (s) => ({ ...s, grid }));
}

export function setArtifactTheme(art: ArtifactContent, theme: Id): ArtifactContent {
    return { ...art, theme };
}
