import type { Region } from "@engine/render-command";
import type { ElementAddress } from "@model/address";
import type { ArtifactContent, ElementInstance } from "@model/content";
import { createSignal } from "solid-js";
import { getElementAt, insertInCell, removeAt, setCellElement } from "@elements/ops";
import { getElement } from "@elements/registry";

// Pointer-based drag-and-drop. The drag signal carries what's being dragged, the cursor position
// (for the floating ghost), and the live drop target. Geometry comes from engine regions, so drop
// zones line up exactly with what's painted.

export type DragPayload = { kind: "new"; type: string } | { kind: "move"; from: ElementAddress };

export interface DropTarget {
    section: string;
    cell: string;
    mode: "place" | "insert"; // place = empty cell; insert = before/after items at `index`
    index: number;
    indicatorY: number; // canvas-coord y for the insertion line
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

export function computeDropTarget(regions: Region[], px: number, py: number): DropTarget | null {
    const c = cellAt(regions, px, py);
    if (!c) return null;
    const items = cellItems(regions, c.section, c.cell);
    if (items.length === 0) {
        return { section: c.section, cell: c.cell, mode: "place", index: 0, indicatorY: 0 };
    }
    let index = items.length;
    for (let i = 0; i < items.length; i++) {
        if (py < items[i]!.box.y + items[i]!.box.h / 2) {
            index = i;
            break;
        }
    }
    const last = items[items.length - 1]!;
    const indicatorY = index < items.length ? items[index]!.box.y - 5 : last.box.y + last.box.h + 5;
    return { section: c.section, cell: c.cell, mode: "insert", index, indicatorY };
}

export function applyDrop(
    art: ArtifactContent,
    target: DropTarget,
    payload: DragPayload,
): ArtifactContent {
    let element: ElementInstance;
    let base = art;
    let tgt = target;
    if (payload.kind === "move") {
        const found = getElementAt(art, payload.from);
        if (!found) return art;
        element = found;
        base = removeAt(art, payload.from);
        // Same-cell forward move: removing a top-level item before the target shifts indices by one.
        if (
            tgt.mode === "insert" &&
            payload.from.section === tgt.section &&
            payload.from.cell === tgt.cell &&
            payload.from.path.length === 1 &&
            payload.from.path[0]! < tgt.index
        ) {
            tgt = { ...tgt, index: tgt.index - 1 };
        }
    } else {
        const spec = getElement(payload.type);
        if (!spec) return art;
        element = { type: payload.type, data: spec.create() };
    }
    return tgt.mode === "place"
        ? setCellElement(base, tgt.section, tgt.cell, element)
        : insertInCell(base, tgt.section, tgt.cell, tgt.index, element);
}
