import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { Rect, Region } from "@engine/node";
import type { ElementAddress, Target, ArtifactContent } from "@model/artifact";
import { elementRegionId, regionId, sectionRegionId } from "@model/artifact";
import type { ElementLayout } from "@model/geometry";
import {
    getElementAt,
    setElementLayout,
    updateDataAt,
    setSectionBackground,
    clearBackgroundImage,
} from "@elements/ops";
import { getElement, resizeOf } from "@elements/spec";
import { profileFor } from "@engine/profile";
import {
    addSectionAfter,
    clearExtras,
    commit,
    boardGutterL,
    datum,
    duplicateSectionAt,
    editor,
    editorAccent,
    extras,
    HANDLE_BRIDGE_H,
    HANDLE_GAP,
    handleTop,
    hover,
    moveSectionBy,
    noteElementResized,
    regions,
    removeSectionAt,
    sectionFitScale,
    selectedAddresses,
    selection,
    setSelection,
    stagePoint,
    stopEditing,
    zoom,
} from "@editor/core/store";
import {
    computeDropSlots,
    drag,
    indicatorDistance,
    movableAncestor,
    moveManyPayload,
    startDrag,
    unitItem,
    type DropSlot,
} from "@editor/core/dnd";
import {
    anchorPoint,
    nearestPinPlacement,
    parentAddress,
    pinGestureScale,
    pinnedAncestor,
    pinnedLayout,
    reflowPin,
    togglePin,
    type Pin,
} from "@editor/core/pin";
import { capture } from "@ui/analytics";
import { openSectionPrompt } from "@editor/core/ai";
import { pickMedia } from "@editor/core/media";
import { SectionLayoutPopup } from "./SectionLayoutPopup";
import { Icon } from "@ui/icons";
import {
    barAction,
    barDangerAction,
    barIconAction,
    barStepAction,
    FloatingBar,
    Popover,
} from "@ui/overlay";
import { Separator } from "@ui/inputs";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const EDGE = 8; // draggable border thickness
const DRAG_THRESHOLD = 5; // px of travel before a grip press becomes a drag, not a click

const GRIP_W = 16; // the visible pill (w-4); the rest of the geometry is shared, see @editor/core/store
const GRIP_GAP = HANDLE_GAP;
// A bleed section starts at 0, so its grip sits in the canvas's own left gutter: paintable (the
// scroll container clips at its padding box), just unreachable by scroll. Zoom scales the stage but
// not the gutter, so it divides back out; the slack keeps the pill off the clip edge. Every box
// with room outside itself never hits the clamp.
const GRIP_EDGE_SLACK = 2;

const gripX = (box: { x: number }): number =>
    Math.max(GRIP_EDGE_SLACK - boardGutterL() / zoom(), box.x - (GRIP_W + GRIP_GAP));

// Reaches from the pill to the box's own left edge so the two stay contiguous and crossing between
// them never drops the hover; just the pill when the clamp already put it on the box.
const gripW = (box: { x: number }): number => Math.max(GRIP_W, box.x - gripX(box));

interface PinDrag {
    parent: Rect;
    nearest: { x: Pin["x"]; y: Pin["y"] };
    snapped: boolean; // an axis sits flush on the nearest anchor, worth a feedback dot
    slot: DropSlot | null; // a flow gap close enough to take the element back
}
const [pinDrag, setPinDrag] = createSignal<PinDrag | null>(null);

// how close the pointer must come to a gap line before it offers the way back into the flow
const REFLOW_REACH = 16;

// A pinned element's grip moves it freely within its parent instead of re-slotting: live dx/dy on
// the preview, then one commit that re-anchors to the nearest of the nine parent anchors. Regions
// stay unpublished during a preview, so the release position is the start box ridden rigidly.
function beginPinMove(address: ElementAddress, sx: number, sy: number): void {
    const inst = getElementAt(editor.artifact, address);
    const pin = inst?.layout?.pin;
    const el0 = regions().find((r) => r.id === elementRegionId(address))?.box;
    const parent = regions().find((r) => r.id === elementRegionId(parentAddress(address)))?.box;
    if (!pin || !el0 || !parent) return;
    clearExtras();
    const z = zoom();
    const k = pinGestureScale(address.section) * z;
    const start = { dx: pin.dx ?? 0, dy: pin.dy ?? 0 };
    const last = { x: sx, y: sy };
    // the flow gaps this element could return to, enumerated once: the preview never reflows the
    // stack, so they hold for the whole gesture. Lines only: a region target would cover ground
    // the free move has to cross.
    const gaps = computeDropSlots(editor.artifact, regions(), {
        kind: "move",
        from: address,
    }).filter((g) => g.indicator.kind === "line");
    const at = (ev: PointerEvent): Rect => ({
        ...el0,
        x: el0.x + (ev.clientX - sx) / z,
        y: el0.y + (ev.clientY - sy) / z,
    });
    const onMove = (ev: PointerEvent): void => {
        last.x = ev.clientX;
        last.y = ev.clientY;
        setLiveEdit({
            kind: "element",
            address,
            layoutPatch: {
                pin: {
                    ...pin,
                    dx: start.dx + (ev.clientX - sx) / k,
                    dy: start.dy + (ev.clientY - sy) / k,
                },
            },
        });
        const placed = nearestPinPlacement(parent, at(ev));
        const sp = stagePoint(ev.clientX, ev.clientY);
        let slot: DropSlot | null = null;
        if (sp) {
            let least = REFLOW_REACH;
            for (const g of gaps) {
                const d = indicatorDistance(g.indicator, sp[0], sp[1]);
                if (d < least) {
                    least = d;
                    slot = g;
                }
            }
        }
        setPinDrag({
            parent,
            nearest: placed.anchors,
            snapped: placed.gap.x === 0 || placed.gap.y === 0,
            slot,
        });
    };
    const done = (): void => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", cancel, true);
        window.removeEventListener("keydown", onKey, true);
        setPinDrag(null);
    };
    // an OS edge-swipe or a second touch cancels the gesture; the preview must not outlive it
    const cancel = (): void => {
        done();
        setLiveEdit(null);
    };
    const onKey = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape") cancel();
        // Space converts the move: the element returns to the flow live, and the drag continues
        // as a reorder with the drop slots, so one gesture crosses between the two worlds
        if (ev.key === " ") {
            ev.preventDefault();
            cancel();
            togglePin(address, "drag");
            const label = getElement(getElementAt(editor.artifact, address)?.type ?? "")?.label;
            startDrag({ kind: "move", from: address }, last.x, last.y, label || "Element");
        }
    };
    const onUp = (ev: PointerEvent): void => {
        const landing = pinDrag()?.slot;
        done();
        if (!liveEdit()) return; // never crossed the threshold's first move
        setLiveEdit(null);
        if (landing) {
            // released on a gap line: the pin comes off and the element rejoins the flow there
            const inst2 = getElementAt(editor.artifact, address);
            const res = reflowPin(editor.artifact, address, landing.target);
            if (res.content !== editor.artifact) {
                commit(res.content);
                capture("element_unpinned", { element_type: inst2?.type ?? "", via: "drag" });
                if (res.address) setSelection({ kind: "element", address: res.address });
            }
            return;
        }
        const placed = nearestPinPlacement(parent, at(ev));
        const next = pinnedLayout(editor.artifact, address, placed.anchors, placed.gap, pin);
        if (next) commit(setElementLayout(editor.artifact, address, next));
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", onKey, true);
}

/**
 * One entry for every element move, from the grip or the body: a pinned self-or-ancestor moves
 * freely; anything else reorders through the drop slots, as a selected block when the grab is
 * part of one.
 */
export function beginElementMove(address: ElementAddress, sx: number, sy: number): void {
    stopEditing(); // a drag lifts the source out of the paint; an open text overlay would strand
    const pinned = pinnedAncestor(editor.artifact, address);
    if (pinned) {
        beginPinMove(pinned, sx, sy);
        return;
    }
    // an item of an open unit (a bullet line) reorders within its list and nowhere else
    const item = unitItem(editor.artifact, address);
    if (item) {
        clearExtras();
        startDrag({ kind: "move", from: item }, sx, sy, "Item");
        return;
    }
    const a = movableAncestor(editor.artifact, address);
    const inst = getElementAt(editor.artifact, a);
    const label = (inst && getElement(inst.type)?.label) || "Element";
    const block = moveManyPayload(a, selectedAddresses());
    if (block) {
        startDrag(block, sx, sy, `${block.indices.length} elements`);
        return;
    }
    clearExtras(); // the grab is dragging its own element, so the set is done
    startDrag({ kind: "move", from: a }, sx, sy, label);
}

/**
 * Free-move chrome: a single dot marks the anchor the element would snap flush to (feedback, not
 * a target), and a gap line lights up when releasing would return the element to the flow there.
 */
export const PinAnchors: Component = () => (
    <Show when={pinDrag()}>
        {(d) => (
            <>
                <div
                    class="pointer-events-none absolute z-30 rounded-full border border-line bg-panel/95 px-2.5 py-1 text-[11px] font-medium text-muted shadow-md"
                    style={{
                        left: `${d().parent.x + d().parent.w / 2 - 110}px`,
                        top: `${d().parent.y - 30}px`,
                    }}
                >
                    {d().slot ? "Release to return it to the flow" : "Drop on a gap line to reflow"}
                </div>
                <Show when={d().snapped && !d().slot}>
                    <div
                        class="pointer-events-none absolute z-30 rounded-full"
                        style={{
                            left: `${anchorPoint(d().parent, d().nearest.x, d().nearest.y)[0] - 3}px`,
                            top: `${anchorPoint(d().parent, d().nearest.x, d().nearest.y)[1] - 3}px`,
                            width: "6px",
                            height: "6px",
                            background: editorAccent(),
                        }}
                    />
                </Show>
                <Show when={d().slot}>
                    {(g) => {
                        const ind = (): { axis: "v" | "h"; x: number; y: number; length: number } =>
                            g().indicator as {
                                axis: "v" | "h";
                                x: number;
                                y: number;
                                length: number;
                            };
                        return (
                            <div
                                class="pointer-events-none absolute z-raised rounded-full"
                                style={{
                                    left: `${ind().axis === "v" ? ind().x - 1.5 : ind().x}px`,
                                    top: `${ind().axis === "v" ? ind().y : ind().y - 1.5}px`,
                                    width: `${ind().axis === "v" ? 3 : ind().length}px`,
                                    height: `${ind().axis === "v" ? ind().length : 3}px`,
                                    background: editorAccent(),
                                }}
                            />
                        );
                    }}
                </Show>
            </>
        )}
    </Show>
);

export const DragHandle: Component = () => {
    const ctx = createMemo(() => {
        if (drag()) return null;
        const t = hover() ?? selection();
        if (t?.kind === "element") {
            // a unit moves whole: grabbing a table cell or a composite's line drags the unit it
            // belongs to, so the grip aims at the nearest ancestor a structural op may act on
            const address = movableAncestor(editor.artifact, t.address);
            const box = regions().find((r) => r.id === elementRegionId(address))?.box;
            return box ? { kind: "element" as const, box, address } : null;
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
        // a plain click on the grip must only select, so wait for the threshold; the capture-phase
        // listener is needed because the grip's own onPointerMove stops bubbling
        const sx = e.clientX;
        const sy = e.clientY;
        const begin = (): void => {
            if (c.kind === "element") beginElementMove(c.address, sx, sy);
            else {
                stopEditing();
                startDrag({ kind: "section", id: c.section }, sx, sy, "Section");
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
                // A hover bridge, not a target: it runs from the pill to the box's own left edge so
                // crossing between them never leaves the region and drops the hover. Only the pill
                // takes the press, or a wide board's margin would swallow every backdrop click.
                <div
                    class="absolute z-menu flex items-start"
                    style={{
                        left: `${gripX(c().box)}px`,
                        top: `${handleTop(c().box)}px`,
                        width: `${gripW(c().box)}px`,
                        height: `${HANDLE_BRIDGE_H}px`,
                    }}
                    onPointerMove={(e) => e.stopPropagation()}
                >
                    <div
                        class="flex h-5 w-4 cursor-grab items-center justify-center rounded-md border border-line bg-panel/90 text-muted shadow-sm backdrop-blur-md active:cursor-grabbing"
                        style={{ "touch-action": "none" }}
                        title="Drag to move"
                        onPointerDown={onDown}
                    >
                        <Icon name="grip" size={12} />
                    </div>
                </div>
            )}
        </Show>
    );
};

export const ResizeHandles: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        if (sel?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, sel.address);
        const spec = inst ? getElement(inst.type) : undefined;
        if (!inst || !spec) return null;
        const rz = resizeOf(spec, inst.data);
        const hCfg = rz?.height;
        const aCfg = rz?.aspect;
        if (!hCfg && !aCfg) return null;
        const box = regions().find((r) => r.id === elementRegionId(sel.address))?.box;
        if (!box) return null;
        return { address: sel.address, box, hCfg, aCfg };
    });

    const onDown = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        if (!c) return;
        const start = c.box;
        const move = (ev: PointerEvent): void => {
            const at = stagePoint(ev.clientX, ev.clientY);
            if (!at) return;
            const h = Math.max(8, at[1] - start.y);
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
            if (edit) {
                commit(applyLiveEdit(editor.artifact, edit));
                noteElementResized(
                    getElementAt(editor.artifact, c.address)?.type ?? "",
                    c.hCfg ? "height" : "aspect",
                );
            }
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
                    class="group absolute z-panel"
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
                        class="absolute bottom-0 left-0 h-0.75 w-full rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </Show>
    );
};

interface Divider {
    key: string;
    x: number; // centre, canvas coords
    top: number;
    h: number;
    apply: (stageX: number) => LiveEdit; // stageX in stage layout coords, see stagePoint
}

export const union = (a: Rect, b: Rect): Rect => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
        x,
        y,
        w: Math.max(a.x + a.w, b.x + b.w) - x,
        h: Math.max(a.y + a.h, b.y + b.h) - y,
    };
};

function siblingDividers(sid: string, regs: Region[]): Divider[] {
    // group by parent path: root children (path []) are section columns, deeper groups are nested rows
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
        // a pinned sibling is out of the flow: it shares no row, so it offers no boundary to drag.
        // A polygon region paints rotated: its box is only a bounding box, so every axis-aligned
        // inference (row bands, width fractions) is meaningless inside the turned subtree.
        if (r.shape) continue;
        if (getElementAt(editor.artifact, { section: sid, path })?.layout?.pin) continue;
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
        // A closed container owns its slots: its dividers act only through the spec's `slots`
        // facet — child indices fold into slot unions (a cell's label + detail become one box) and
        // the drag writes the container's own data. No facet (or null for this data) = no dividers.
        let slotted = false;
        const parentAddr: ElementAddress = { section: sid, path: g.parentPath };
        const parentInst = getElementAt(editor.artifact, parentAddr);
        const container = parentInst ? getElement(parentInst.type)?.container : undefined;
        if (container?.closed) {
            const slots = container.slots?.(parentInst!.data);
            if (!slots) continue;
            const bySlot = new Map<number, Rect>();
            for (const m of g.members) {
                const s = slots.of(m.index);
                const prev = bySlot.get(s);
                bySlot.set(s, prev ? union(prev, m.box) : m.box);
            }
            g.members = [...bySlot.entries()].map(([index, box]) => ({ index, box }));
            slotted = true;
        }
        if (g.members.length < 2) continue;
        // only siblings sharing a horizontal band; skips column stacks and grids
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
                    const entries = [
                        { index: idxL, pct: Math.round(fi * 100) },
                        { index: idxR, pct: Math.round((combined - fi) * 100) },
                    ];
                    return slotted
                        ? {
                              kind: "slots",
                              parent,
                              entries: entries.map((e) => ({ slot: e.index, pct: e.pct })),
                          }
                        : { kind: "siblings", parent, entries };
                },
            });
        }
    }
    return out;
}

export const RegionDividers: Component = () => {
    // hovered section, else the selected one; hidden mid-drag, when the dragged region is stale
    const sid = createMemo<string | null>(() => {
        if (drag()) return null;
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
        const move = (ev: PointerEvent): void => {
            const at = stagePoint(ev.clientX, ev.clientY);
            if (at) setLiveEdit(d.apply(at[0]));
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
                    class="group absolute z-raised flex justify-center"
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
                        class="h-full w-0.5 rounded-full opacity-25 transition-opacity duration-150 group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </For>
    );
};

// uncommitted handle edit: painted live while dragging, committed as the same op on release
export type LiveEdit =
    | {
          kind: "element";
          address: ElementAddress;
          layoutPatch?: Partial<ElementLayout>;
          dataPatch?: Record<string, unknown>; // height / aspect / gap / padding (element data)
      }
    | { kind: "siblings"; parent: ElementAddress; entries: { index: number; pct: number }[] }
    // a closed container's divider drag: the spec's `slots` facet maps fractions onto its data
    | { kind: "slots"; parent: ElementAddress; entries: { slot: number; pct: number }[] };

export const [liveEdit, setLiveEdit] = createSignal<LiveEdit | null>(null);

export function applyLiveEdit(art: ArtifactContent, edit: LiveEdit): ArtifactContent {
    if (edit.kind === "slots") {
        const inst = getElementAt(art, edit.parent);
        const slots = inst ? getElement(inst.type)?.container?.slots?.(inst.data) : null;
        if (!slots) return art;
        return updateDataAt(art, edit.parent, slots.resize(edit.entries));
    }
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

// for nodes that paint no corner (text, groups): square in doc/web, slightly round on decks
const fallbackRadius = (): number => (profileFor(editor.artifact).kind === "continuous" ? 0 : 7);

// rings are box-shadow, so they cost no layout; the region's painted radius makes them hug

function regionFor(t: Target | null): Region | null {
    if (!t) return null;
    const id = regionId(t);
    return regions().find((r) => r.id === id) ?? null;
}

const ring = (r: Region, shadow: string) => ({
    left: `${r.box.x}px`,
    top: `${r.box.y}px`,
    width: `${r.box.w}px`,
    height: `${r.box.h}px`,
    "border-radius": `${r.radius ?? fallbackRadius()}px`,
    "box-shadow": shadow,
});

// Every mark carrying the hovered datum id, so a grouped bar's whole row lights at once.
const DatumOutline: Component = () => {
    const marks = createMemo((): Region[] => {
        const id = drag() ? null : datum();
        return id ? regions().filter((r) => r.id === id) : [];
    });
    return (
        <For each={marks()}>
            {(r) =>
                r.shape ? (
                    <svg class="pointer-events-none absolute inset-0 size-full overflow-visible">
                        <polygon
                            points={r.shape.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                            fill="none"
                            stroke={editorAccent()}
                            stroke-width="2"
                        />
                    </svg>
                ) : (
                    <div
                        data-testid="datum-outline"
                        class="pointer-events-none absolute"
                        style={ring(r, `0 0 0 2px ${editorAccent()}`)}
                    />
                )
            }
        </For>
    );
};

export const Overlay: Component = () => {
    // suppressed mid-drag so the rings don't compete with the drop indicators
    const sel = createMemo(() => (drag() ? null : regionFor(selection())));
    // the anchor keeps today's ring; the rest of the set gets a lighter one
    const rest = createMemo((): Region[] =>
        drag()
            ? []
            : extras()
                  .map((address) => regionFor({ kind: "element", address }))
                  .filter((r): r is Region => r !== null),
    );
    const hov = createMemo(() => {
        if (drag()) return null;
        const h = hover();
        if (!h) return null;
        const s = selection();
        if (s && regionId(s) === regionId(h)) return null;
        return regionFor(h);
    });
    return (
        <>
            <Show when={hov()}>
                {(r) => (
                    <div
                        class="pointer-events-none absolute opacity-50"
                        style={ring(r(), `0 0 0 1.5px ${editorAccent()}`)}
                    />
                )}
            </Show>
            <For each={rest()}>
                {(r) => (
                    <div
                        data-testid="selection-extra"
                        class="pointer-events-none absolute opacity-60"
                        style={ring(r, `0 0 0 2px ${editorAccent()}`)}
                    />
                )}
            </For>
            <Show when={sel()}>
                {(r) => (
                    <div
                        class="pointer-events-none absolute"
                        style={ring(r(), `0 0 0 2px ${editorAccent()}`)}
                    />
                )}
            </Show>
            <DatumOutline />
        </>
    );
};

function sectionOf(t: Target | null): string | null {
    if (!t) return null;
    if (t.kind === "element") return t.address.section;
    return t.section;
}

const action = barAction;
const iconAction = barIconAction;
const stepAction = barStepAction;
const dangerAction = barDangerAction;

// pinned to the open-popup section, so the anchor stays mounted if the cursor drifts away
const [layoutOpen, setLayoutOpen] = createSignal<string | null>(null);

export const SectionActions: Component = () => {
    const sid = createMemo(() => layoutOpen() ?? sectionOf(hover()));
    const box = createMemo(() => {
        const id = sid();
        return id ? (regions().find((r) => r.id === sectionRegionId(id))?.box ?? null) : null;
    });
    const sectionBg = createMemo(() => {
        const id = sid();
        return id ? editor.artifact.sections.find((s) => s.id === id)?.background : undefined;
    });
    const sectionIx = createMemo(() => editor.artifact.sections.findIndex((s) => s.id === sid()));
    // render-time only: the inspector still reads the authored sizes, which is what the author set
    const fitted = createMemo(() => {
        const id = sid();
        return id ? sectionFitScale(id) : 1;
    });
    const isFirst = (): boolean => sectionIx() <= 0;
    const isLast = (): boolean => sectionIx() === editor.artifact.sections.length - 1;
    let pillRef: HTMLDivElement | undefined;

    const pickSectionBg = (): void => {
        const id = sid()!;
        const bg = sectionBg();
        pickMedia(
            (url) =>
                commit(
                    setSectionBackground(editor.artifact, id, { ...bg, kind: "image", image: url }),
                ),
            "photo",
            bg?.image
                ? () => commit(setSectionBackground(editor.artifact, id, clearBackgroundImage(bg)))
                : undefined,
        );
    };

    return (
        <Show when={box()}>
            {(b) => (
                <>
                    <FloatingBar
                        ref={pillRef}
                        tone="panel"
                        rounded="full"
                        shadow="lg"
                        gap="0.5"
                        anchor="free"
                        class="absolute z-panel -translate-x-1/2"
                        style={{ left: `${b().x + b().w / 2}px`, top: `${b().y + b().h - 16}px` }}
                        onPointerMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div class="-my-1 flex flex-col justify-center">
                            <button
                                class={stepAction}
                                disabled={isFirst()}
                                title="Move section up"
                                onClick={() => moveSectionBy(sid()!, -1)}
                            >
                                <Icon name="chevronUp" size={13} />
                            </button>
                            <button
                                class={stepAction}
                                disabled={isLast()}
                                title="Move section down"
                                onClick={() => moveSectionBy(sid()!, 1)}
                            >
                                <Icon name="chevronDown" size={13} />
                            </button>
                        </div>
                        <Separator vertical size="sm" />
                        <button
                            class={action}
                            title="Add a blank section below"
                            onClick={() => addSectionAfter(sid()!)}
                        >
                            <Icon name="plus" size={13} /> Section
                        </button>
                        <Separator vertical size="sm" />
                        <button
                            class={action}
                            title="Generate a section here with AI"
                            onClick={() => openSectionPrompt(sid()!)}
                        >
                            <Icon name="sparkle" size={13} /> Generate
                        </button>
                        <Separator vertical size="sm" />
                        <button
                            class={action}
                            title="Section layout & background"
                            onClick={() => setLayoutOpen(sid())}
                        >
                            <Icon name="layout" size={13} /> Layout
                        </button>
                        <Separator vertical size="sm" />
                        <button
                            class={iconAction}
                            classList={{ "text-accent": !!sectionBg()?.image }}
                            title={
                                sectionBg()?.image
                                    ? "Replace or remove the background image"
                                    : "Set a background image for this section"
                            }
                            onClick={pickSectionBg}
                        >
                            <Icon name="media" size={14} />
                        </button>
                        <button
                            class={iconAction}
                            title="Duplicate section"
                            onClick={() => duplicateSectionAt(sid()!)}
                        >
                            <Icon name="duplicate" size={14} />
                        </button>
                        <button
                            class={dangerAction}
                            title="Delete section"
                            onClick={() => removeSectionAt(sid()!)}
                        >
                            <Icon name="trash" size={14} />
                        </button>
                        <Show when={fitted() < 1}>
                            <Separator vertical size="sm" />
                            <span
                                class="px-1 text-[11px] leading-none text-muted"
                                title="This section is taller than its slide, so it is drawn at a smaller type and spacing scale. The sizes you set are unchanged."
                            >
                                Fitted {Math.round(fitted() * 100)}%
                            </span>
                        </Show>
                    </FloatingBar>
                    <Popover
                        anchor={() => pillRef}
                        open={layoutOpen() !== null}
                        onClose={() => setLayoutOpen(null)}
                        fixedWidth={512}
                        estHeight={560}
                        align="center"
                        panelClass="p-3.5"
                    >
                        <SectionLayoutPopup section={sid()!} />
                    </Popover>
                </>
            )}
        </Show>
    );
};
