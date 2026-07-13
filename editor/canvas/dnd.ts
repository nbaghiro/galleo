import type { Rect, Region } from "@engine/node";
import type { ElementAddress } from "@model/target";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { createSignal } from "solid-js";
import { DROP_GHOST } from "@elements/dropghost";
import {
    addColumn,
    collapseSection,
    getElementAt,
    insertChild,
    insertSection,
    removeAt,
    replaceAt,
    wrapWith,
} from "@elements/ops";
import { getElement } from "@elements/spec";

export type DragPayload = { kind: "new"; type: string } | { kind: "move"; from: ElementAddress };

// Per op: replace/wrap use `path`; insert uses `path`+`index`; column/newSection use `index` (newSection
// ignores section/path). `before` places a wrap's new element first.
export interface DropTarget {
    section: string;
    op: "replace" | "insert" | "wrap" | "column" | "newSection";
    path: number[];
    index: number;
    before: boolean;
    direction: "row" | "col";
}

const newSectionId = (): string => `s-${crypto.randomUUID().slice(0, 8)}`;

export interface DragState {
    payload: DragPayload;
    x: number;
    y: number;
    label: string;
    target: DropTarget | null;
}

export const [drag, setDrag] = createSignal<DragState | null>(null);

export function startDrag(payload: DragPayload, x: number, y: number, label: string): void {
    setDrag({ payload, x, y, label, target: null });
}

const inside = (b: Rect, px: number, py: number): boolean =>
    px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

const EDGE = 24; // column-boundary drop band

const isContainer = (inst?: ElementInstance): boolean =>
    !!inst && !!getElement(inst.type)?.container;

const childCount = (inst?: ElementInstance): number => {
    if (!inst) return 0;
    const spec = getElement(inst.type);
    return spec?.container ? spec.container.children(inst.data).length : 0;
};

const groupAxis = (inst?: ElementInstance): "row" | "col" =>
    inst?.type === "group" && (inst.data as { direction?: string }).direction === "row"
        ? "row"
        : "col";

// { path, box } per element region in the section, deepest first.
function elementsUnder(
    regions: Region[],
    sid: string,
    px: number,
    py: number,
): { path: number[]; box: Rect }[] {
    const out: { path: number[]; box: Rect }[] = [];
    for (const r of regions) {
        const p = r.id.split(":");
        if (p[0] !== "el" || p[1] !== sid || !inside(r.box, px, py)) continue;
        out.push({ path: p[2] ? p[2].split(".").map(Number) : [], box: r.box });
    }
    return out.sort((a, b) => b.path.length - a.path.length);
}

// Child boxes one level under `parentPath`, sorted along `axis`.
function childBoxes(
    regions: Region[],
    sid: string,
    parentPath: number[],
    axis: "row" | "col",
): { index: number; box: Rect }[] {
    const depth = parentPath.length + 1;
    const out: { index: number; box: Rect }[] = [];
    for (const r of regions) {
        const p = r.id.split(":");
        if (p[0] !== "el" || p[1] !== sid || !p[2]) continue;
        const path = p[2].split(".").map(Number);
        if (path.length !== depth || parentPath.some((v, i) => v !== path[i])) continue;
        out.push({ index: path[depth - 1]!, box: r.box });
    }
    return out.sort((a, b) => (axis === "row" ? a.box.x - b.box.x : a.box.y - b.box.y));
}

// Insertion index for the cursor: first child whose midpoint it hasn't passed, else the end. Monotonic — no oscillation while dragging.
function gapIndex(kids: { box: Rect }[], axis: "row" | "col", px: number, py: number): number {
    const pos = axis === "row" ? px : py;
    for (let i = 0; i < kids.length; i++) {
        const c = kids[i]!.box;
        const mid = axis === "row" ? c.x + c.w / 2 : c.y + c.h / 2;
        if (pos < mid) return i;
    }
    return kids.length;
}

// Top-level columns: the root row's children, else the whole root as one column.
function sectionColumns(regions: Region[], sid: string): Rect[] {
    const cols = childBoxes(regions, sid, [], "row");
    if (cols.length) return cols.map((c) => c.box);
    const root = regions.find((r) => r.id === `el:${sid}`)?.box;
    return root ? [root] : [];
}

// A drop in the band around a column boundary (incl. outer edges) → new column there.
function columnDropZone(sid: string, columns: Rect[], px: number, py: number): DropTarget | null {
    if (!columns.length) return null;
    const top = Math.min(...columns.map((c) => c.y));
    const bottom = Math.max(...columns.map((c) => c.y + c.h));
    if (py < top || py > bottom) return null;
    const boundaries: { x: number; index: number }[] = [{ x: columns[0]!.x, index: 0 }];
    for (let i = 0; i < columns.length - 1; i++)
        boundaries.push({
            x: (columns[i]!.x + columns[i]!.w + columns[i + 1]!.x) / 2,
            index: i + 1,
        });
    const last = columns[columns.length - 1]!;
    boundaries.push({ x: last.x + last.w, index: columns.length });
    for (const b of boundaries) {
        if (Math.abs(px - b.x) > EDGE) continue;
        return {
            section: sid,
            op: "column",
            path: [],
            index: b.index,
            before: false,
            direction: "row",
        };
    }
    return null;
}

const NEW_SECTION = (index: number): DropTarget => ({
    section: "",
    op: "newSection",
    path: [],
    index,
    before: false,
    direction: "col",
});

const SECTION_EDGE = 44; // reach of the above-first / below-last new-section bands

// A drop between sections (or above first / below last) → a new section there. Checked before per-section
// logic so dragging OUT suggests "new section", not a destructive "replace".
function sectionGapZone(
    regions: Region[],
    art: ArtifactContent,
    px: number,
    py: number,
): DropTarget | null {
    const boxes = art.sections.map((s) => regions.find((r) => r.id === `el:${s.id}`)?.box ?? null);
    if (boxes.some((b) => b === null)) return null; // some section not laid out — skip gap zones
    const bs = boxes as Rect[];
    const left = Math.min(...bs.map((b) => b.x));
    const right = Math.max(...bs.map((b) => b.x + b.w));
    if (px < left || px > right) return null; // ignore the page gutters flanking the stack

    const first = bs[0]!;
    if (py < first.y && py >= first.y - SECTION_EDGE) return NEW_SECTION(0);
    const last = bs[bs.length - 1]!;
    if (py > last.y + last.h && py <= last.y + last.h + SECTION_EDGE) return NEW_SECTION(bs.length);
    for (let i = 0; i < bs.length - 1; i++)
        if (py > bs[i]!.y + bs[i]!.h && py < bs[i + 1]!.y) return NEW_SECTION(i + 1);
    return null;
}

export function computeDropTarget(
    art: ArtifactContent,
    regions: Region[],
    px: number,
    py: number,
): DropTarget | null {
    // Between/around sections → new section (priority over per-section logic below).
    const gap = sectionGapZone(regions, art, px, py);
    if (gap) return gap;

    const sectionReg = regions.find((r) => r.id.startsWith("section:") && inside(r.box, px, py));
    if (!sectionReg) return null;
    const sid = sectionReg.id.split(":")[1]!;

    // Column-boundary band takes priority — how you make a new column.
    const columns = sectionColumns(regions, sid);
    const colZone = columnDropZone(sid, columns, px, py);
    if (colZone) return colZone;

    const hits = elementsUnder(regions, sid, px, py);
    const hit = hits[0];
    if (!hit) {
        // Bare side padding: fill only if the section is genuinely empty — a non-empty one is not a
        // "replace everything" target.
        const root = getElementAt(art, { section: sid, path: [] });
        if (isContainer(root) && childCount(root) === 0)
            return {
                section: sid,
                op: "replace",
                path: [],
                index: 0,
                before: false,
                direction: "col",
            };
        return null;
    }
    const addr: ElementAddress = { section: sid, path: hit.path };
    const inst = getElementAt(art, addr);

    if (isContainer(inst) && childCount(inst) === 0)
        return {
            section: sid,
            op: "replace",
            path: hit.path,
            index: 0,
            before: false,
            direction: "col",
        };

    // On a container → insert among its children at the nearest gap.
    if (isContainer(inst)) {
        const axis = groupAxis(inst);
        return {
            section: sid,
            op: "insert",
            path: hit.path,
            index: gapIndex(childBoxes(regions, sid, hit.path, axis), axis, px, py),
            before: false,
            direction: axis,
        };
    }

    // Leaf inside a container → insert into the parent at the nearest sibling gap. Purely the monotonic
    // gap index (no center flip — that flickered).
    const parentPath = hit.path.slice(0, -1);
    const parentInst = hit.path.length
        ? getElementAt(art, { section: sid, path: parentPath })
        : undefined;
    if (parentInst && isContainer(parentInst)) {
        const axis = groupAxis(parentInst);
        return {
            section: sid,
            op: "insert",
            path: parentPath,
            index: gapIndex(childBoxes(regions, sid, parentPath, axis), axis, px, py),
            before: false,
            direction: axis,
        };
    }

    // Leaf that IS the section root → wrap into a new row/col; axis + side from the cursor's position in its box.
    const b = hit.box;
    const horizontal =
        Math.abs((px - (b.x + b.w / 2)) / b.w) > Math.abs((py - (b.y + b.h / 2)) / b.h);
    const direction: "row" | "col" = horizontal ? "row" : "col";
    const before = horizontal ? px < b.x + b.w / 2 : py < b.y + b.h / 2;
    return {
        section: sid,
        op: "wrap",
        path: hit.path,
        index: 0,
        before,
        direction,
    };
}

const result = (
    content: ArtifactContent,
    address: ElementAddress | null,
): { content: ArtifactContent; address: ElementAddress | null } => ({ content, address });

// Land `element` at a `DropTarget`, dispatching to the width-aware ops. Also used by paste (clipboard.ts)
// so paste uses the same layout logic as a drop.
export function place(
    art: ArtifactContent,
    target: DropTarget,
    element: ElementInstance,
): { content: ArtifactContent; address: ElementAddress | null } {
    const s = target.section;
    switch (target.op) {
        case "replace":
            return result(replaceAt(art, { section: s, path: target.path }, element), {
                section: s,
                path: target.path,
            });
        case "insert":
            return result(
                insertChild(art, { section: s, path: target.path }, target.index, element),
                {
                    section: s,
                    path: [...target.path, target.index],
                },
            );
        case "wrap":
            return result(
                wrapWith(
                    art,
                    { section: s, path: target.path },
                    element,
                    target.before,
                    target.direction,
                ),
                { section: s, path: [...target.path, target.before ? 0 : 1] },
            );
        case "column": {
            const added = addColumn(art, s, target.index, element);
            return result(added.art, { section: s, path: added.path });
        }
        case "newSection": {
            const sec: Section = { id: newSectionId(), root: element };
            return result(insertSection(art, target.index, sec), { section: sec.id, path: [] });
        }
    }
}

// Rebase a path captured against the pre-op tree: a removal shifts later siblings down one, an insert shifts them up one.
function adjustAfterRemoval(path: number[], removed: number[]): number[] {
    if (!removed.length || path.length < removed.length) return path;
    const d = removed.length - 1;
    if (removed.slice(0, d).some((v, i) => v !== path[i]) || path[d]! <= removed[d]!) return path;
    const next = [...path];
    next[d] = next[d]! - 1;
    return next;
}
function adjustAfterInsert(path: number[], parent: number[], index: number): number[] {
    if (
        path.length <= parent.length ||
        parent.some((v, i) => v !== path[i]) ||
        path[parent.length]! < index
    )
        return path;
    const next = [...path];
    next[parent.length] = next[parent.length]! + 1;
    return next;
}

// Move: remove the element, re-aim the target against the post-removal tree, place it, then collapse the
// emptied source column. Shared by the real drop + preview so the ghost matches.
function moveInto(
    art: ArtifactContent,
    from: ElementAddress,
    target: DropTarget,
    element: ElementInstance,
): { content: ArtifactContent; address: ElementAddress | null } {
    const base = removeAt(art, from);
    const insParent = target.op === "insert" ? target.path : target.op === "column" ? [] : null;
    const sameParentBefore =
        insParent !== null &&
        from.path.length === insParent.length + 1 &&
        insParent.every((v, i) => v === from.path[i]) &&
        from.path[from.path.length - 1]! < target.index;
    const aimed: DropTarget = {
        ...target,
        path: adjustAfterRemoval(target.path, from.path),
        index: sameParentBefore ? target.index - 1 : target.index,
    };
    const placed = place(base, aimed, element);
    // Collapse the emptied source column, mapping its parent path through the insertion.
    const srcParent =
        insParent !== null
            ? adjustAfterInsert(from.path.slice(0, -1), insParent, aimed.index)
            : from.path.slice(0, -1);
    const content = collapseSection(placed.content, from.section, srcParent);
    // If the source column collapsed away, shift the landed selection past it.
    const src = getElementAt(placed.content, { section: from.section, path: srcParent });
    const srcEmptied = !!src && isContainer(src) && childCount(src) === 0;
    const address =
        placed.address && srcEmptied
            ? { ...placed.address, path: adjustAfterRemoval(placed.address.path, srcParent) }
            : placed.address;
    return result(content, address);
}

function resolveDrop(
    art: ArtifactContent,
    target: DropTarget,
    payload: DragPayload,
): { content: ArtifactContent; address: ElementAddress | null } {
    if (payload.kind === "move") {
        const element = getElementAt(art, payload.from);
        if (!element) return result(art, null);
        return moveInto(art, payload.from, target, structuredClone(element));
    }
    const spec = getElement(payload.type);
    if (!spec) return result(art, null);
    return place(art, target, { type: payload.type, data: spec.create() });
}

export function applyDrop(
    art: ArtifactContent,
    target: DropTarget,
    payload: DragPayload,
): { content: ArtifactContent; address: ElementAddress | null } {
    return resolveDrop(art, target, payload);
}

// Remove the dragged element + collapse its emptied column — the base a move drag shows for the whole gesture (source leaves immediately, never snaps back).
function liftOut(art: ArtifactContent, from: ElementAddress): ArtifactContent {
    return collapseSection(removeAt(art, from), from.section, from.path.slice(0, -1));
}

// The artifact painted mid-drag. A move lifts the source first, then splices a ghost where it lands; a
// new-from-palette drag ghosts only once it has a target. Mirrors applyDrop so the reflow matches.
export function previewDrop(
    art: ArtifactContent,
    target: DropTarget | null,
    payload: DragPayload,
): ArtifactContent {
    if (payload.kind === "move") {
        const src = getElementAt(art, payload.from);
        if (!src) return art;
        if (!target) return liftOut(art, payload.from);
        const ghost: ElementInstance = {
            type: DROP_GHOST,
            data: { type: src.type, data: src.data },
        };
        return moveInto(art, payload.from, target, ghost).content;
    }
    if (!target) return art;
    const ghost: ElementInstance = { type: DROP_GHOST, data: { type: payload.type } };
    return place(art, target, ghost).content;
}
