import type { Rect, Region } from "@engine/node";
import type { ElementAddress, ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { createSignal } from "solid-js";
import {
    addColumn,
    collapseSection,
    getElementAt,
    insertChild,
    insertSection,
    moveChildrenTo,
    moveSection,
    removeAt,
    replaceAt,
    sharedParent,
    wrapWith,
} from "@elements/ops";
import { addressesEqual } from "@model/artifact";
import { getElement } from "@elements/spec";
import { gridColumnsOf as gridColumns } from "@elements/composite/container";
import { setRightTab } from "./store";

// reordering co-parented siblings as one block; cross-parent multi-move is deferred
export interface MoveManyPayload {
    kind: "moveMany";
    parent: ElementAddress;
    indices: number[];
}

export type DragPayload =
    | { kind: "new"; type: string }
    | { kind: "move"; from: ElementAddress }
    | MoveManyPayload
    | { kind: "section"; id: string };

// per op: replace/wrap use path; insert path+index; column/newSection index; before = wrap first
export interface DropTarget {
    section: string;
    op: "replace" | "insert" | "wrap" | "column" | "newSection";
    path: number[];
    index: number;
    before: boolean;
    direction: "row" | "col";
}

const newSectionId = (): string => `s-${crypto.randomUUID().slice(0, 8)}`;

// The canvas never reflows during a drag, so the regions captured at drag start stay valid for the
// whole gesture: every droppable place is enumerated ONCE into slots, and per-move work is a
// hitbox lookup. Indicators are what the overlay draws; the active slot's target is what drops.
export type SlotIndicator =
    | { kind: "line"; axis: "v" | "h"; x: number; y: number; length: number }
    | { kind: "region"; box: Rect };

export interface DropSlot {
    target: DropTarget;
    priority: 0 | 1 | 2; // element-level < column < newSection — the old resolution order
    indicator: SlotIndicator;
    hitbox: Rect;
}

export interface DragState {
    payload: DragPayload;
    x: number;
    y: number;
    sx: number; // the grab point, for gestures that re-derive the travelled delta
    sy: number;
    label: string;
    target: DropTarget | null;
}

export const [drag, setDrag] = createSignal<DragState | null>(null);
export const [dragSlots, setDragSlots] = createSignal<DropSlot[]>([]);

export function startDrag(payload: DragPayload, x: number, y: number, label: string): void {
    // the flyout sits over the right of the canvas, which is where a drop target often is
    setRightTab(null);
    setDrag({ payload, x, y, sx: x, sy: y, label, target: null });
}

export function endDrag(): void {
    setDrag(null);
    setDragSlots([]);
}

const inside = (b: Rect, px: number, py: number): boolean =>
    px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

const EDGE = 24; // column-boundary band, each side
const SECTION_EDGE = 44; // reach of the above-first / below-last new-section bands
const LINE_INSET = 4; // indicator lines tuck inside their container's box
const HYST = 6; // the active slot wins ties within this margin, so boundaries don't flap

// a closed container owns its own slots, so dropping never reaches into it
const isContainer = (inst?: ElementInstance): boolean => {
    const c = inst ? getElement(inst.type)?.container : undefined;
    return !!c && !c.closed;
};

// The drag-out mirror of that seal: a closed container's children select and edit in place but
// never move out (a diagram label torn off its cell is a hole in the diagram, not a move). The
// grip and every move entry point gate on this.
export function movable(art: ArtifactContent, addr: ElementAddress): boolean {
    if (addr.path.length === 0) return true;
    const parent = getElementAt(art, { section: addr.section, path: addr.path.slice(0, -1) });
    if (!parent) return true;
    // only a real layout container hands its children out; a unit owns them, so its parts move with
    // it rather than on their own
    return getElement(parent.type)?.tier === "container";
}

// A unit with an open children facet (bullets and kin) arranges its own items: they reorder
// inside it and nowhere else. The seal against foreign drops and drag-out stays intact; this
// names the item a grab within such a unit reorders.
export function unitItem(art: ArtifactContent, addr: ElementAddress): ElementAddress | null {
    for (let n = addr.path.length; n >= 1; n--) {
        const parent = getElementAt(art, {
            section: addr.section,
            path: addr.path.slice(0, n - 1),
        });
        const spec = parent && getElement(parent.type);
        if (spec && spec.tier === "unit" && spec.container && !spec.container.closed)
            return { section: addr.section, path: addr.path.slice(0, n) };
    }
    return null;
}

// the nearest self-or-ancestor that structural ops may act on (a paste beside a diagram label
// lands beside the diagram)
export function movableAncestor(art: ArtifactContent, addr: ElementAddress): ElementAddress {
    let out = addr;
    while (out.path.length > 0 && !movable(art, out))
        out = { section: out.section, path: out.path.slice(0, -1) };
    return out;
}

const childCount = (inst?: ElementInstance): number => {
    if (!inst) return 0;
    const spec = getElement(inst.type);
    return spec?.container ? spec.container.children(inst.data).length : 0;
};

const groupAxis = (inst?: ElementInstance): "row" | "col" =>
    inst?.type === "container" && (inst.data as { direction?: string }).direction === "row"
        ? "row"
        : "col";

// A container whose children paint outside its own box (a popup's floating panel) publishes the box
// they actually occupy; slots follow the children, not the trigger they hang off.
const regionBox = (regions: Region[], sid: string, path: number[]): Rect | null => {
    const p = path.join(".");
    const id = path.length ? `el:${sid}:${p}` : `el:${sid}`;
    const content = regions.find((r) => r.id === `content:${sid}:${p}`);
    return (content ?? regions.find((r) => r.id === id))?.box ?? null;
};

// sorted along the axis; groups lay out in order, so sorted order is tree order. A grid sorts by
// index instead: placement is row-major, so storage order is the geometry.
function childBoxes(
    regions: Region[],
    sid: string,
    parentPath: number[],
    axis: "row" | "col" | "grid",
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
    return out.sort((a, b) =>
        axis === "row" ? a.box.x - b.box.x : axis === "col" ? a.box.y - b.box.y : a.index - b.index,
    );
}

const instKids = (inst?: ElementInstance): ElementInstance[] =>
    (inst && getElement(inst.type)?.container?.children(inst.data)) ?? [];

// pinned children sit out of the flow, so no slot geometry may derive from their boxes
const flowOnly = (
    boxes: { index: number; box: Rect }[],
    kids: ElementInstance[],
): { index: number; box: Rect }[] => boxes.filter((b) => !kids[b.index]?.layout?.pin);

// the root row's flow children, else the whole root as one column; a grid root's cells are
// tracks, not section columns, so it counts as one
function sectionColumns(regions: Region[], sid: string, root?: ElementInstance): Rect[] {
    const cols =
        gridColumns(root) === null
            ? flowOnly(childBoxes(regions, sid, [], "row"), instKids(root))
            : [];
    if (cols.length) return cols.map((c) => c.box);
    const box = regions.find((r) => r.id === `el:${sid}`)?.box;
    return box ? [box] : [];
}

const NEW_SECTION = (index: number): DropTarget => ({
    section: "",
    op: "newSection",
    path: [],
    index,
    before: false,
    direction: "col",
});

const hLine = (x: number, y: number, length: number): SlotIndicator => ({
    kind: "line",
    axis: "h",
    x,
    y,
    length,
});
const vLine = (x: number, y: number, length: number): SlotIndicator => ({
    kind: "line",
    axis: "v",
    x,
    y,
    length,
});

// Gaps between sections (and the bands above the first / below the last) make a new section —
// or, for a section drag, the place the section lands. The stack is windowed, so off-screen
// sections have no regions: each gap needs only its own neighbours materialized, and gaps that
// are scrolled out of view (both neighbours missing) aren't reachable anyway.
function sectionGapSlots(
    art: ArtifactContent,
    regions: Region[],
    payload: DragPayload,
): DropSlot[] {
    // the painted card (`section:`), not the content root (`el:`), so lines span the full card
    // width and the gap band is the true inter-card gap, not the cards' own padding
    const boxes = art.sections.map(
        (s) =>
            (
                regions.find((r) => r.id === `section:${s.id}`) ??
                regions.find((r) => r.id === `el:${s.id}`)
            )?.box ?? null,
    );
    const present = boxes.filter((b): b is Rect => b !== null);
    if (!present.length) return [];
    const src =
        payload.kind === "section" ? art.sections.findIndex((s) => s.id === payload.id) : -1;
    const left = Math.min(...present.map((b) => b.x));
    const right = Math.max(...present.map((b) => b.x + b.w));
    const w = right - left;
    const out: DropSlot[] = [];
    const slot = (index: number, y0: number, y1: number): void => {
        // reinserting a section beside itself is a no-op
        if (src >= 0 && (index === src || index === src + 1)) return;
        out.push({
            target: NEW_SECTION(index),
            priority: 2,
            indicator: hLine(left, (y0 + y1) / 2, w),
            hitbox: { x: left, y: y0, w, h: y1 - y0 },
        });
    };
    const first = boxes[0];
    if (first) slot(0, first.y - SECTION_EDGE, first.y);
    for (let i = 0; i < boxes.length - 1; i++) {
        const a = boxes[i];
        const b = boxes[i + 1];
        if (!a || !b) continue;
        const y0 = a.y + a.h;
        const y1 = b.y;
        if (y1 > y0) slot(i + 1, y0, y1);
    }
    const last = boxes[boxes.length - 1];
    if (last) slot(boxes.length, last.y + last.h, last.y + last.h + SECTION_EDGE);
    return out;
}

// bands around the root row's column boundaries (outer edges included) make a new column
function columnSlots(art: ArtifactContent, regions: Region[], payload: DragPayload): DropSlot[] {
    const out: DropSlot[] = [];
    for (const s of art.sections) {
        const root = getElementAt(art, { section: s.id, path: [] });
        if (isContainer(root) && childCount(root) === 0) continue; // replace owns an empty root
        const columns = sectionColumns(regions, s.id, root);
        if (!columns.length) continue;
        const srcCol =
            payload.kind === "move" && payload.from.section === s.id
                ? payload.from.path.length === 0
                    ? -2 // dragging the root: every column slot here is a no-op or self-target
                    : payload.from.path.length === 1
                      ? payload.from.path[0]!
                      : null
                : null;
        if (srcCol === -2) continue;
        const top = Math.min(...columns.map((c) => c.y));
        const bottom = Math.max(...columns.map((c) => c.y + c.h));
        const boundaries: { x: number; index: number }[] = [{ x: columns[0]!.x, index: 0 }];
        for (let i = 0; i < columns.length - 1; i++)
            boundaries.push({
                x: (columns[i]!.x + columns[i]!.w + columns[i + 1]!.x) / 2,
                index: i + 1,
            });
        const last = columns[columns.length - 1]!;
        boundaries.push({ x: last.x + last.w, index: columns.length });
        for (const b of boundaries) {
            // moving a column beside itself is a no-op
            if (srcCol !== null && (b.index === srcCol || b.index === srcCol + 1)) continue;
            out.push({
                target: {
                    section: s.id,
                    op: "column",
                    path: [],
                    index: b.index,
                    before: false,
                    direction: "row",
                },
                priority: 1,
                indicator: vLine(b.x, top + LINE_INSET, Math.max(0, bottom - top - LINE_INSET * 2)),
                hitbox: { x: b.x - EDGE, y: top, w: EDGE * 2, h: bottom - top },
            });
        }
    }
    return out;
}

// gap slot k of a container: hitboxes tile the container split at child midpoints (hovering
// anywhere over a child maps to the adjacent gap), the indicator sits in the gap itself
function gapSlot(
    sid: string,
    path: number[],
    axis: "row" | "col",
    k: number,
    kids: { index: number; box: Rect }[],
    container: Rect,
    end: number, // the append index: the parent's full child count, pinned siblings included
): DropSlot {
    const main = (b: Rect): [number, number] =>
        axis === "row" ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    const mid = (b: Rect): number => (axis === "row" ? b.x + b.w / 2 : b.y + b.h / 2);
    const [c0, c1] = main(container);
    const lo = k === 0 ? c0 : mid(kids[k - 1]!.box);
    const hi = k === kids.length ? c1 : mid(kids[k]!.box);
    const linePos =
        k === 0
            ? main(kids[0]!.box)[0] - 6
            : k === kids.length
              ? main(kids[k - 1]!.box)[1] + 6
              : (main(kids[k - 1]!.box)[1] + main(kids[k]!.box)[0]) / 2;
    const pos = Math.min(Math.max(linePos, c0 + LINE_INSET), c1 - LINE_INSET);
    const cross =
        axis === "row"
            ? { start: container.y + LINE_INSET, len: container.h - LINE_INSET * 2 }
            : { start: container.x + LINE_INSET, len: container.w - LINE_INSET * 2 };
    // before the flow child at position k, at that child's real array index; pinned siblings hold
    // array positions without holding flow positions, so k itself is not the index
    const index = k === kids.length ? end : kids[k]!.index;
    return {
        target: { section: sid, op: "insert", path, index, before: false, direction: axis },
        priority: 0,
        indicator:
            axis === "row"
                ? vLine(pos, cross.start, Math.max(0, cross.len))
                : hLine(cross.start, pos, Math.max(0, cross.len)),
        hitbox:
            axis === "row"
                ? { x: lo, y: container.y, w: hi - lo, h: container.h }
                : { x: container.x, y: lo, w: container.w, h: hi - lo },
    };
}

// A grid's slots: one band of vertical gaps per visual row. The flow list chunked by the column
// count IS the geometry (placement is row-major), so no banding inference is needed; each band is
// handed to gapSlot as its own row. Gap g flanks flow positions g-1 and g, so `skip` suppresses
// the no-op gaps beside a dragged member exactly as the axis path does.
function gridGapSlots(
    sid: string,
    path: number[],
    flow: { index: number; box: Rect }[],
    cols: number,
    container: Rect,
    end: number,
    skip: (gap: number) => boolean,
): DropSlot[] {
    const rows: { index: number; box: Rect }[][] = [];
    for (let r = 0; r * cols < flow.length; r++) rows.push(flow.slice(r * cols, (r + 1) * cols));
    const tops = rows.map((row) => Math.min(...row.map((b) => b.box.y)));
    const bottoms = rows.map((row) => Math.max(...row.map((b) => b.box.y + b.box.h)));
    const out: DropSlot[] = [];
    for (let r = 0; r < rows.length; r++) {
        // bands meet at the row-gap midpoints so no point between rows is a dead zone
        const lo = r === 0 ? container.y : (bottoms[r - 1]! + tops[r]!) / 2;
        const hi =
            r === rows.length - 1 ? container.y + container.h : (bottoms[r]! + tops[r + 1]!) / 2;
        const band = { x: container.x, y: lo, w: container.w, h: hi - lo };
        // appending past this row inserts before the next row's first cell
        const rowEnd = rows[r + 1] ? rows[r + 1]![0]!.index : end;
        for (let k = 0; k <= rows[r]!.length; k++) {
            if (skip(r * cols + k)) continue;
            out.push(gapSlot(sid, path, "row", k, rows[r]!, band, rowEnd));
        }
    }
    return out;
}

// a leaf that is the section root wraps into a new row/col; four edge slots share the leaf's box
// and the nearest indicator wins, reproducing the old axis-from-cursor-offset behavior
function wrapSlots(sid: string, box: Rect): DropSlot[] {
    const mk = (direction: "row" | "col", before: boolean, indicator: SlotIndicator): DropSlot => ({
        target: { section: sid, op: "wrap", path: [], index: 0, before, direction },
        priority: 0,
        indicator,
        hitbox: box,
    });
    const h = Math.max(0, box.h - LINE_INSET * 2);
    const w = Math.max(0, box.w - LINE_INSET * 2);
    return [
        mk("row", true, vLine(box.x + 2, box.y + LINE_INSET, h)),
        mk("row", false, vLine(box.x + box.w - 2, box.y + LINE_INSET, h)),
        mk("col", true, hLine(box.x + LINE_INSET, box.y + 2, w)),
        mk("col", false, hLine(box.x + LINE_INSET, box.y + box.h - 2, w)),
    ];
}

// walk the tree of every section, emitting element-level slots from the frozen regions
function elementSlots(art: ArtifactContent, regions: Region[], payload: DragPayload): DropSlot[] {
    const out: DropSlot[] = [];
    for (const s of art.sections) {
        const sid = s.id;
        const srcPath =
            payload.kind === "move" && payload.from.section === sid ? payload.from.path : null;
        const inSrcSubtree = (p: number[]): boolean =>
            srcPath !== null && srcPath.length <= p.length && srcPath.every((v, i) => v === p[i]);

        const visit = (path: number[]): void => {
            if (inSrcSubtree(path)) return; // never target the dragged element or its interior
            const inst = getElementAt(art, { section: sid, path });
            if (!inst) return;
            const spec = getElement(inst.type);
            // tier, not the container facet: a unit (table, bullets, a composite) has children to
            // organise its own content, which is not an invitation to drop arbitrary elements into it
            const open = spec?.tier === "container";
            const box = regionBox(regions, sid, path);
            if (!box) return;

            if (!open) {
                if (path.length === 0) out.push(...wrapSlots(sid, box));
                return; // leaves are covered by their parent's gap slots; closed stay sealed
            }

            const kids = spec!.container!.children(inst.data);
            if (kids.length === 0) {
                // an empty region fills in place; the root's reach extends to the bare padding
                const hitbox =
                    path.length === 0
                        ? (regions.find((r) => r.id === `section:${sid}`)?.box ?? box)
                        : box;
                out.push({
                    target: {
                        section: sid,
                        op: "replace",
                        path,
                        index: 0,
                        before: false,
                        direction: "col",
                    },
                    priority: 0,
                    indicator: { kind: "region", box },
                    hitbox,
                });
                return;
            }

            const cols = gridColumns(inst);
            const axis = groupAxis(inst);
            const boxes = childBoxes(regions, sid, path, cols !== null ? "grid" : axis);
            const flow = flowOnly(boxes, kids);
            if (!flow.length) {
                // every child pinned: the reserved band is one droppable region, appending in flow
                out.push({
                    target: {
                        section: sid,
                        op: "insert",
                        path,
                        index: kids.length,
                        before: false,
                        direction: "col",
                    },
                    priority: 0,
                    indicator: { kind: "region", box },
                    hitbox: box,
                });
            } else {
                const srcIndex =
                    srcPath !== null && srcPath.length === path.length + 1
                        ? srcPath[path.length]!
                        : null;
                const srcPos = srcIndex !== null ? flow.findIndex((b) => b.index === srcIndex) : -1;
                // the gaps flanking the source in its own parent are no-op moves
                const noop = (k: number): boolean =>
                    srcPos >= 0 && (k === srcPos || k === srcPos + 1);
                if (cols !== null) {
                    out.push(...gridGapSlots(sid, path, flow, cols, box, kids.length, noop));
                } else {
                    for (let k = 0; k <= flow.length; k++) {
                        if (noop(k)) continue;
                        out.push(gapSlot(sid, path, axis, k, flow, box, kids.length));
                    }
                }
            }
            for (const kb of boxes) visit([...path, kb.index]);
        };
        visit([]);
    }
    return out;
}

/**
 * The set drags as one block only when the grip is a member and every member sits under the same
 * parent; otherwise the grip drags its own element and the caller collapses the set.
 */
export function moveManyPayload(
    grip: ElementAddress,
    members: ElementAddress[],
): MoveManyPayload | null {
    if (members.length < 2 || !members.some((a) => addressesEqual(a, grip))) return null;
    const parent = sharedParent(members);
    if (!parent) return null;
    return { kind: "moveMany", parent, indices: members.map((a) => a.path[a.path.length - 1]!) };
}

// A block drag reorders inside its own parent and nowhere else, so only that parent's gaps are
// enumerated: no section gaps, no columns, no foreign containers.
function parentGapSlots(
    art: ArtifactContent,
    regions: Region[],
    parent: ElementAddress,
    indices: number[],
): DropSlot[] {
    const inst = getElementAt(art, parent);
    const spec = inst && getElement(inst.type);
    // any open children facet may reorder its own items; the container tier is not the bar here
    if (!spec?.container || spec.container.closed) return [];
    const box = regionBox(regions, parent.section, parent.path);
    if (!box) return [];
    const cols = gridColumns(inst);
    const axis = groupAxis(inst);
    const children = instKids(inst);
    const kids = flowOnly(
        childBoxes(regions, parent.section, parent.path, cols !== null ? "grid" : axis),
        children,
    );
    if (!kids.length) return [];
    const sorted = [...indices].sort((a, b) => a - b);
    const pos = (i: number): number => kids.findIndex((b) => b.index === i);
    const lo = pos(sorted[0]!);
    const hi = pos(sorted[sorted.length - 1]!);
    const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1]! + 1);
    // the block already sits there
    const noop = (k: number): boolean => contiguous && lo >= 0 && k >= lo && k <= hi + 1;
    if (cols !== null)
        return gridGapSlots(parent.section, parent.path, kids, cols, box, children.length, noop);
    const out: DropSlot[] = [];
    for (let k = 0; k <= kids.length; k++) {
        if (noop(k)) continue;
        out.push(gapSlot(parent.section, parent.path, axis, k, kids, box, children.length));
    }
    return out;
}

// enumerate every droppable place once, at drag start
export function computeDropSlots(
    art: ArtifactContent,
    regions: Region[],
    payload: DragPayload,
): DropSlot[] {
    if (payload.kind === "moveMany")
        return parentGapSlots(art, regions, payload.parent, payload.indices);
    if (payload.kind === "move" && unitItem(art, payload.from)) {
        const parent = { section: payload.from.section, path: payload.from.path.slice(0, -1) };
        return parentGapSlots(art, regions, parent, [payload.from.path.at(-1)!]);
    }
    const gaps = sectionGapSlots(art, regions, payload);
    if (payload.kind === "section") return gaps; // a section only lands in the stack gaps
    return [...gaps, ...columnSlots(art, regions, payload), ...elementSlots(art, regions, payload)];
}

export const sameTarget = (a: DropTarget, b: DropTarget): boolean =>
    a.section === b.section &&
    a.op === b.op &&
    a.index === b.index &&
    a.before === b.before &&
    a.direction === b.direction &&
    a.path.length === b.path.length &&
    a.path.every((v, i) => v === b.path[i]);

export function indicatorDistance(ind: SlotIndicator, px: number, py: number): number {
    if (ind.kind === "region") return 0; // its hitbox is the region itself
    if (ind.axis === "v") {
        const dy = py < ind.y ? ind.y - py : py > ind.y + ind.length ? py - ind.y - ind.length : 0;
        return Math.hypot(px - ind.x, dy);
    }
    const dx = px < ind.x ? ind.x - px : px > ind.x + ind.length ? px - ind.x - ind.length : 0;
    return Math.hypot(dx, py - ind.y);
}

const expand = (b: Rect, m: number): Rect => ({
    x: b.x - m,
    y: b.y - m,
    w: b.w + m * 2,
    h: b.h + m * 2,
});

// Highest priority class containing the pointer wins; within it the deepest container is the most
// specific claim, ties by nearest indicator (that's how wrap's four edge slots share one hitbox).
// The current target holds while the pointer stays within HYST of its hitbox, so neither tile
// boundaries nor the outer edge flap under a wobbling pointer.
export function activeSlot(
    slots: DropSlot[],
    px: number,
    py: number,
    current: DropTarget | null,
): DropSlot | null {
    let priority = -1;
    for (const s of slots) if (inside(s.hitbox, px, py)) priority = Math.max(priority, s.priority);
    if (current) {
        const held = slots.find((s) => sameTarget(s.target, current));
        if (
            held &&
            held.priority >= priority &&
            !inside(held.hitbox, px, py) &&
            inside(expand(held.hitbox, HYST), px, py)
        )
            return held;
    }
    if (priority < 0) return null;
    let best: DropSlot | null = null;
    let bestDepth = -1;
    let bestD = Infinity;
    for (const s of slots) {
        if (s.priority !== priority || !inside(s.hitbox, px, py)) continue;
        const depth = s.target.path.length;
        let d = indicatorDistance(s.indicator, px, py);
        if (current && sameTarget(s.target, current)) d -= HYST;
        if (depth > bestDepth || (depth === bestDepth && d < bestD)) {
            bestDepth = depth;
            bestD = d;
            best = s;
        }
    }
    return best;
}

const result = (
    content: ArtifactContent,
    address: ElementAddress | null,
): { content: ArtifactContent; address: ElementAddress | null } => ({ content, address });

// also used by paste (clipboard.ts), so a paste lands with the same layout logic as a drop
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

// rebase a path captured against the pre-op tree: a removal shifts later siblings down, an insert up
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

// re-aims the target against the post-removal tree: targets are computed on the intact tree
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
    // map the source parent path through the insertion before collapsing
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
    if (payload.kind === "section") {
        // a reorder, not a new section: the gap index re-aims across the section's own removal
        const i = art.sections.findIndex((s) => s.id === payload.id);
        if (i < 0 || target.op !== "newSection") return result(art, null);
        const delta = (target.index > i ? target.index - 1 : target.index) - i;
        if (delta === 0) return result(art, null);
        return result(moveSection(art, payload.id, delta), { section: payload.id, path: [] });
    }
    if (payload.kind === "moveMany") {
        const { parent, indices } = payload;
        const here =
            target.op === "insert" &&
            target.section === parent.section &&
            target.path.length === parent.path.length &&
            target.path.every((v, i) => v === parent.path[i]);
        if (!here) return result(art, null);
        const moved = moveChildrenTo(art, parent, indices, target.index);
        return result(moved.content, {
            section: parent.section,
            path: [...parent.path, moved.at],
        });
    }
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
