import type { Rect, Region } from "@engine/node";
import type { ElementAddress } from "@model/target";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { createSignal } from "solid-js";
import { DROP_GHOST } from "@elements/dropghost";
import { getElementAt, insertInCell, removeAt, setCellElement } from "@elements/ops";
import { getElement } from "@elements/spec";

// Pointer-based drag-and-drop. The drag signal carries what's being dragged, the cursor position
// (for the floating ghost), and the live drop target. Geometry comes from engine regions, so drop
// zones line up exactly with what's painted.

export type DragPayload = { kind: "new"; type: string } | { kind: "move"; from: ElementAddress };

export interface DropTarget {
    section: string;
    cell: string;
    mode: "place" | "insert"; // place = empty cell; insert = before/after items at `index`
    index: number;
    axis: "row" | "col"; // insert into a row (side-by-side) or column (stacked) group
    // reflow = dropping into open space → paint a preview with a ghost so the section auto-sizes to the
    // post-drop state. !reflow = hovering an existing element → a thin insertion line at `slot` (below),
    // so the drop is positioned precisely between/around neighbours without the layout jumping.
    reflow: boolean;
    slot: Rect; // the thin insertion line (only meaningful when !reflow)
}

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

const inside = (
    b: { x: number; y: number; w: number; h: number },
    px: number,
    py: number,
): boolean => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

function cellAt(
    regions: Region[],
    px: number,
    py: number,
): { section: string; cell: string } | null {
    for (const r of regions) {
        if (!r.id.startsWith("cell:") || !inside(r.box, px, py)) continue;
        const p = r.id.split(":");
        return { section: p[1]!, cell: p[2]! };
    }
    return null;
}

// The cell's top-level insertion items: its root container's direct children, else the lone element.
function cellItems(regions: Region[], section: string, cell: string): Region[] {
    const prefix = `el:${section}:${cell}:`;
    const direct = regions.filter((r) => {
        if (!r.id.startsWith(prefix)) return false;
        const tail = r.id.slice(prefix.length);
        return tail !== "" && !tail.includes(".");
    });
    if (direct.length) return [...direct].sort((a, b) => a.box.y - b.box.y);
    const root = regions.find((r) => r.id === prefix);
    return root ? [root] : [];
}

const cellBoxOf = (regions: Region[], section: string, cell: string): Rect | null =>
    regions.find((r) => r.id === `cell:${section}:${cell}`)?.box ?? null;

const LINE = 3; // insertion-line thickness

// A thin insertion line at the boundary for `index` — horizontal between stacked items (col), vertical
// between side-by-side items (row). Sits in the gap between neighbours, or just off the near/far edge at
// the ends.
function computeLine(items: Region[], index: number, axis: "row" | "col", cell: Rect | null): Rect {
    const before = index > 0 ? items[index - 1]!.box : null;
    const after = index < items.length ? items[index]!.box : null;
    if (axis === "row") {
        const y = Math.min(...items.map((i) => i.box.y));
        const h = Math.max(...items.map((i) => i.box.y + i.box.h)) - y;
        const x =
            before && after
                ? (before.x + before.w + after.x) / 2
                : after
                  ? after.x - 2
                  : before!.x + before!.w + 2;
        return { x: x - LINE / 2, y, w: LINE, h };
    }
    const x = cell?.x ?? items[0]!.box.x;
    const w = cell?.w ?? items[0]!.box.w;
    const y =
        before && after
            ? (before.y + before.h + after.y) / 2
            : after
              ? after.y - 2
              : before!.y + before!.h + 2;
    return { x, y: y - LINE / 2, w, h: LINE };
}

export function computeDropTarget(regions: Region[], px: number, py: number): DropTarget | null {
    const c = cellAt(regions, px, py);
    if (!c) return null;
    const cell = cellBoxOf(regions, c.section, c.cell);
    const items = cellItems(regions, c.section, c.cell);
    const empty: Rect = { x: px, y: py, w: 0, h: 0 };
    // Empty cell → reflow: the ghost fills the cell (no existing content to position against).
    if (items.length === 0) {
        return {
            section: c.section,
            cell: c.cell,
            mode: "place",
            index: 0,
            axis: "col",
            reflow: true,
            slot: cell ?? empty,
        };
    }
    // Axis: infer from the existing arrangement (multi-item), else from where the cursor sits on the
    // lone element — nearer a left/right edge → row (side-by-side); nearer top/bottom → column (stack).
    let axis: "row" | "col";
    if (items.length >= 2) {
        const xs = items.map((i) => i.box.x);
        const ys = items.map((i) => i.box.y);
        axis =
            Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "row" : "col";
    } else {
        const b = items[0]!.box;
        const dx = Math.abs(px - (b.x + b.w / 2)) / b.w;
        const dy = Math.abs(py - (b.y + b.h / 2)) / b.h;
        axis = dx > dy ? "row" : "col";
    }
    const sorted = [...items].sort((a, b) =>
        axis === "row" ? a.box.x - b.box.x : a.box.y - b.box.y,
    );
    let index = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
        const b = sorted[i]!.box;
        const mid = axis === "row" ? b.x + b.w / 2 : b.y + b.h / 2;
        if ((axis === "row" ? px : py) < mid) {
            index = i;
            break;
        }
    }
    // Over an existing element → position precisely with a thin line (no reflow). In the cell's open
    // space → reflow so the section auto-sizes around the ghost.
    const over = items.some((it) => inside(it.box, px, py));
    return {
        section: c.section,
        cell: c.cell,
        mode: "insert",
        index,
        axis,
        reflow: !over,
        slot: over ? computeLine(sorted, index, axis, cell) : (cell ?? empty),
    };
}

// Resolve a drop into the base artifact (with any moved element removed + index adjusted) and the
// element instance being placed. Shared by the real drop and the live preview.
function resolveDrop(
    art: ArtifactContent,
    target: DropTarget,
    payload: DragPayload,
): { base: ArtifactContent; tgt: DropTarget; element: ElementInstance } | null {
    if (payload.kind === "move") {
        const found = getElementAt(art, payload.from);
        if (!found) return null;
        const base = removeAt(art, payload.from);
        let tgt = target;
        // Same-cell forward move: removing a top-level item before the target shifts indices by one.
        if (
            target.mode === "insert" &&
            payload.from.section === target.section &&
            payload.from.cell === target.cell &&
            payload.from.path.length === 1 &&
            payload.from.path[0]! < target.index
        ) {
            tgt = { ...target, index: target.index - 1 };
        }
        return { base, tgt, element: found };
    }
    const spec = getElement(payload.type);
    if (!spec) return null;
    return { base: art, tgt: target, element: { type: payload.type, data: spec.create() } };
}

const placeInto = (
    art: ArtifactContent,
    tgt: DropTarget,
    element: ElementInstance,
): ArtifactContent =>
    tgt.mode === "place"
        ? setCellElement(art, tgt.section, tgt.cell, element)
        : insertInCell(art, tgt.section, tgt.cell, tgt.index, element, tgt.axis);

export function applyDrop(
    art: ArtifactContent,
    target: DropTarget,
    payload: DragPayload,
): ArtifactContent {
    const r = resolveDrop(art, target, payload);
    return r ? placeInto(r.base, r.tgt, r.element) : art;
}

// The post-drop artifact with a skeleton ghost (mirroring the dragged element) in the target slot —
// painted during a reflow drag so the section auto-sizes to how it will look after the drop.
export function previewDrop(
    art: ArtifactContent,
    target: DropTarget,
    payload: DragPayload,
): ArtifactContent {
    const r = resolveDrop(art, target, payload);
    if (!r) return art;
    return placeInto(r.base, r.tgt, { type: DROP_GHOST, data: { type: r.element.type } });
}
