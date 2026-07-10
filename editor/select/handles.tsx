// Direct-manipulation drag handles: element height/aspect resize, the generic move grip, and the in-between
// region dividers that resize any row of side-by-side siblings — the section's top-level columns and every
// nested row group, one uniform mechanism at every depth.

import type { ElementLayout } from "@model/geometry";
import type { ElementAddress } from "@model/target";
import type { ArtifactContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { getElementAt, setElementLayout, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { elementRegionId, sectionRegionId } from "@model/target";
import {
    commit,
    editor,
    editorAccent,
    hover,
    moveSectionTo,
    regions,
    selection,
    setSelection,
    stageEl,
} from "../editor";
import { startDrag, drag } from "../canvas/dnd";
import { Icon } from "@ui/icons";
import type { Rect, Region } from "@engine/node";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const EDGE = 8; // draggable border thickness
const DRAG_THRESHOLD = 5; // px of pointer travel before a grip press becomes an actual drag (vs. a click)

// The section reorder target (a drop position 0..n) while a section is being dragged, else null.
export const [sectionDrop, setSectionDrop] = createSignal<number | null>(null);
// The id of the section being drag-reordered — the canvas dims it and reflows the stack to its drop slot (a
// section-level echo of the element drag preview), else null.
export const [sectionDragId, setSectionDragId] = createSignal<string | null>(null);

// Which section gap the cursor sits in, measured against the given (pre-drag) section tops.
function sectionTargetAt(clientY: number, tops: number[]): number {
    const stage = stageEl();
    if (!stage || !tops.length) return 0;
    const y = clientY - stage.getBoundingClientRect().top;
    for (let i = 0; i < tops.length; i++) {
        const next = tops[i + 1] ?? tops[i]! + 600;
        if (y < (tops[i]! + next) / 2) return i;
    }
    return tops.length;
}

// Begin a section drag-reorder (from the section grip); commits via moveSectionTo on release. The canvas
// paints a live preview — the dragged section dimmed and reflowed into its drop slot — so target detection
// runs against a snapshot of the pre-drag tops, staying stable while the stack reorders under the cursor.
export function startSectionDrag(id: string): void {
    const tops = [...editor.sectionTops];
    const start = editor.artifact.sections.findIndex((s) => s.id === id);
    setSectionDragId(id);
    setSectionDrop(Math.max(0, start)); // dim in place immediately (a no-op reorder) until the first move
    const move = (e: PointerEvent): void => {
        setSectionDrop(sectionTargetAt(e.clientY, tops));
    };
    const up = (): void => {
        const target = sectionDrop();
        setSectionDragId(null);
        setSectionDrop(null);
        if (target !== null) moveSectionTo(id, target);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
}

// The one generic move affordance: a small grip that appears on HOVER over whatever's under the cursor —
// any nested element/column, or the section itself. It sits in the left MARGIN (outside the element, never
// over its content); its hit-zone runs flush to the element's left edge and swallows pointer-move, so the
// region stays hovered while you reach across to grab it. A MOVE starts ONLY from here, so ordinary clicks /
// text editing never turn into an accidental drag. Element → move within the section; section → reorder.
export const DragHandle: Component = () => {
    const ctx = createMemo(() => {
        if (drag() || sectionDragId()) return null; // hide the grip while any drag is in flight
        const t = hover() ?? selection();
        if (t?.kind === "element") {
            const box = regions().find((r) => r.id === elementRegionId(t.address))?.box;
            return box ? { kind: "element" as const, box, address: t.address } : null;
        }
        if (t?.kind === "section") {
            const box = regions().find((r) => r.id === sectionRegionId(t.section))?.box;
            return box ? { kind: "section" as const, box, section: t.section } : null;
        }
        return null;
    });
    const onDown = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        if (!c) return;
        // Arm the drag but don't start it until the pointer travels past a small threshold: a plain click on
        // the grip (no movement) must NOT lift the element out of the layout — it should only select it. The
        // move listener is capture-phase so it fires even while the pointer is still over the grip (whose own
        // onPointerMove stops bubbling). startDrag → the lift + preview only happen once you actually drag.
        const sx = e.clientX;
        const sy = e.clientY;
        const begin = (): void => {
            if (c.kind === "element") {
                const inst = getElementAt(editor.artifact, c.address);
                const label = (inst && getElement(inst.type)?.label) || "Element";
                startDrag({ kind: "move", from: c.address }, sx, sy, label);
            } else {
                startSectionDrag(c.section);
            }
        };
        const done = (): void => {
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
        };
        const onMove = (ev: PointerEvent): void => {
            if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
            done();
            begin();
        };
        const onUp = (): void => {
            done();
            setSelection(
                c.kind === "element"
                    ? { kind: "element", address: c.address }
                    : { kind: "section", section: c.section },
            );
        };
        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onUp, true);
    };
    return (
        <Show when={ctx()}>
            {(c) => (
                // The hit-zone spans the margin AND runs flush to the element's left edge, so crossing from
                // the element onto it keeps the region hovered; `onPointerMove` stops the canvas from
                // recomputing hover while you're over it. The visible grip sits at its left, in the margin.
                <div
                    class="absolute z-30 flex cursor-grab items-center active:cursor-grabbing"
                    style={{
                        left: `${c().box.x - 26}px`,
                        top: `${c().box.y}px`,
                        width: "26px",
                        height: "26px",
                        "touch-action": "none",
                    }}
                    title="Drag to move"
                    onPointerDown={onDown}
                    onPointerMove={(e) => e.stopPropagation()}
                >
                    <div class="pointer-events-none flex h-5 w-4 items-center justify-center rounded-md border border-line bg-panel/90 text-muted shadow-sm backdrop-blur-md">
                        <Icon name="grip" size={12} />
                    </div>
                </div>
            )}
        </Show>
    );
};

// Height / aspect resize on the SELECTED element's bottom edge only. Width + corner handles were removed:
// they overlapped neighbouring elements' own affordances, and width is now sized via the in-between
// RegionDividers instead. An element only shows this edge when it declares a height or aspect field.
export const ResizeHandles: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        if (sel?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, sel.address);
        const spec = inst ? getElement(inst.type) : undefined;
        if (!inst || !spec) return null;
        const hCfg = spec.resize?.height;
        const aCfg = spec.resize?.aspect;
        if (!hCfg && !aCfg) return null;
        const box = regions().find((r) => r.id === elementRegionId(sel.address))?.box;
        if (!box) return null;
        return { address: sel.address, box, hCfg, aCfg };
    });

    const onDown = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        const stage = stageEl();
        if (!c || !stage) return;
        const rect = stage.getBoundingClientRect();
        const start = c.box;
        const move = (ev: PointerEvent): void => {
            const h = Math.max(8, ev.clientY - rect.top - start.y);
            const dataPatch: Record<string, unknown> = {};
            if (c.hCfg) {
                const step = c.hCfg.step ?? 1;
                dataPatch[c.hCfg.key] = Math.round(clamp(h, c.hCfg.min, c.hCfg.max) / step) * step;
            } else if (c.aCfg) {
                dataPatch.aspect =
                    Math.round(clamp(start.w / h, c.aCfg.min, c.aCfg.max) * 100) / 100;
            }
            setLiveEdit({ kind: "element", address: c.address, dataPatch });
        };
        const up = (): void => {
            const edit = liveEdit();
            setLiveEdit(null);
            if (edit) commit(applyLiveEdit(editor.artifact, edit));
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <Show when={ctx()}>
            {(c) => (
                <div
                    class="group absolute z-20"
                    style={{
                        left: `${c().box.x}px`,
                        top: `${c().box.y + c().box.h - EDGE / 2}px`,
                        width: `${c().box.w}px`,
                        height: `${EDGE}px`,
                        cursor: "ns-resize",
                        "touch-action": "none",
                    }}
                    onPointerDown={onDown}
                >
                    <div
                        class="absolute bottom-0 left-0 h-[3px] w-full rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </Show>
    );
};

// In-between region dividers — the primary width affordance. A bar between two side-by-side siblings
// reallocates their combined width on drag, writing each child's ElementLayout.width %. One mechanism at
// every depth (top-level columns + any nested row). Shown while the section is hovered.

interface Divider {
    key: string;
    x: number; // centre, canvas coords
    top: number;
    h: number;
    apply: (stageX: number) => LiveEdit; // stageX = clientX − stage.left
}

function siblingDividers(sid: string, regs: Region[]): Divider[] {
    // Group every element region in the section by its parent path → its sibling set. The root's children
    // (parent path []) are the section columns; deeper groups are nested rows — same code for both.
    const groups = new Map<
        string,
        { parentPath: number[]; members: { index: number; box: Rect }[] }
    >();
    for (const r of regs) {
        const parts = r.id.split(":");
        if (parts[0] !== "el" || parts[1] !== sid) continue;
        const pathStr = parts[2] ?? "";
        if (pathStr === "") continue; // the root has no sibling boundary
        const path = pathStr.split(".").map(Number);
        const key = path.slice(0, -1).join(".");
        let g = groups.get(key);
        if (!g) {
            g = { parentPath: path.slice(0, -1), members: [] };
            groups.set(key, g);
        }
        g.members.push({ index: path[path.length - 1]!, box: r.box });
    }
    const out: Divider[] = [];
    for (const g of groups.values()) {
        if (g.members.length < 2) continue;
        // Width can only be reallocated between siblings sitting side by side in one row. Skip any set
        // whose members don't share a common horizontal band — a column-stacked set, or a grid (e.g. a
        // table) whose rows sit fully below one another. Purely geometric, so it stays element-agnostic.
        const tops = g.members.map((m) => m.box.y);
        const bottoms = g.members.map((m) => m.box.y + m.box.h);
        if (Math.max(...tops) >= Math.min(...bottoms)) continue;
        const sorted = [...g.members].sort((a, b) => a.box.x - b.box.x);
        const rowLeft = sorted[0]!.box.x;
        const last = sorted[sorted.length - 1]!.box;
        const rowWidth = last.x + last.w - rowLeft;
        if (rowWidth <= 0) continue;
        const fractions = sorted.map((m) => m.box.w / rowWidth);
        const top = Math.min(...tops);
        const h = Math.max(...bottoms) - top;
        for (let i = 0; i < sorted.length - 1; i++) {
            const before = fractions.slice(0, i).reduce((a, x) => a + x, 0);
            const combined = fractions[i]! + fractions[i + 1]!;
            const idxL = sorted[i]!.index;
            const idxR = sorted[i + 1]!.index;
            const parent: ElementAddress = { section: sid, path: g.parentPath };
            out.push({
                key: `el:${sid}:${g.parentPath.join(".")}:${i}`,
                x: (sorted[i]!.box.x + sorted[i]!.box.w + sorted[i + 1]!.box.x) / 2,
                top,
                h,
                apply: (stageX) => {
                    const fi = clamp((stageX - rowLeft) / rowWidth - before, 0.1, combined - 0.1);
                    return {
                        kind: "siblings",
                        parent,
                        entries: [
                            { index: idxL, pct: Math.round(fi * 100) },
                            { index: idxR, pct: Math.round((combined - fi) * 100) },
                        ],
                    };
                },
            });
        }
    }
    return out;
}

export const RegionDividers: Component = () => {
    // The section whose dividers are shown: the hovered one, else the selected one. Hidden mid-drag — the
    // dragged element's region is stale, and resize affordances don't apply while a drop is in flight.
    const sid = createMemo<string | null>(() => {
        if (drag() || sectionDragId()) return null;
        const t = hover() ?? selection();
        if (!t) return null;
        return t.kind === "element" ? t.address.section : t.section;
    });

    const dividers = createMemo((): Divider[] => {
        const id = sid();
        return id ? siblingDividers(id, regions()) : [];
    });

    const onDown = (e: PointerEvent, d: Divider): void => {
        e.preventDefault();
        e.stopPropagation();
        const stage = stageEl();
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const move = (ev: PointerEvent): void => {
            setLiveEdit(d.apply(ev.clientX - rect.left));
        };
        const up = (): void => {
            const edit = liveEdit();
            setLiveEdit(null);
            if (edit) commit(applyLiveEdit(editor.artifact, edit));
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <For each={dividers()}>
            {(d) => (
                <div
                    class="group absolute z-10 flex justify-center"
                    style={{
                        left: `${d.x - 6}px`,
                        top: `${d.top}px`,
                        width: "12px",
                        height: `${d.h}px`,
                        cursor: "col-resize",
                        "touch-action": "none",
                    }}
                    onPointerDown={(e) => onDown(e, d)}
                >
                    <div
                        class="h-full w-[2px] rounded-full opacity-25 transition-opacity duration-150 group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </For>
    );
};

// A live, uncommitted direct-manipulation edit driven by a canvas handle. The canvas paints
// `applyLiveEdit(artifact, edit)` while a handle is dragged so the layout reflows in real time; the same
// op is committed on release. One signal covers every handle kind.
export type LiveEdit =
    | {
          kind: "element";
          address: ElementAddress;
          layoutPatch?: Partial<ElementLayout>; // cross-axis (ElementLayout)
          dataPatch?: Record<string, unknown>; // height / aspect / gap / padding (element data)
      }
    | { kind: "siblings"; parent: ElementAddress; entries: { index: number; pct: number }[] };

export const [liveEdit, setLiveEdit] = createSignal<LiveEdit | null>(null);

export function applyLiveEdit(art: ArtifactContent, edit: LiveEdit): ArtifactContent {
    if (edit.kind === "siblings") {
        let out = art;
        for (const e of edit.entries) {
            const addr: ElementAddress = {
                section: edit.parent.section,
                path: [...edit.parent.path, e.index],
            };
            const inst = getElementAt(out, addr);
            if (inst)
                out = setElementLayout(out, addr, {
                    ...(inst.layout ?? {}),
                    width: { pct: e.pct },
                });
        }
        return out;
    }
    const inst = getElementAt(art, edit.address);
    if (!inst) return art;
    let out = art;
    if (edit.layoutPatch)
        out = setElementLayout(out, edit.address, { ...(inst.layout ?? {}), ...edit.layoutPatch });
    if (edit.dataPatch)
        out = updateDataAt(out, edit.address, {
            ...(inst.data as Record<string, unknown>),
            ...edit.dataPatch,
        });
    return out;
}
