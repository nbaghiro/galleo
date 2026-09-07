import type { Rect, Region } from "@engine/node";
import type { ElementAddress, ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { createSignal } from "solid-js";
import {
    addColumn,
    collapseSection,
    getElementAt,
    insertChild,
    insertSection,
    liftChildren,
    moveChildrenTo,
    moveSection,
    removeAt,
    replaceAt,
    sharedParent,
    wrapWith,
} from "@elements/ops";
import { addressesEqual, colGroup, elementRegionId, parseTarget, rowGroup } from "@model/artifact";
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

export interface DragState {
    payload: DragPayload;
    x: number;
    y: number;
    sx: number; // the grab point, for gestures that re-derive the travelled delta
    sy: number;
    px: number; // the pointer in stage coordinates, for chrome that lives on the stage
    py: number;
    label: string;
    slide: Slide | null;
    target: DropTarget | null;
    indicator: SlotIndicator | null; // the slot's line: where the lifted card sits
    receiver: Rect | null; // the scope's box, the highlight
    implicit: boolean;
}

export const [drag, setDrag] = createSignal<DragState | null>(null);

export function startDrag(payload: DragPayload, x: number, y: number, label: string): void {
    // the flyout sits over the right of the canvas, which is where a drop target often is
    setRightTab(null);
    setDrag({
        payload,
        x,
        y,
        sx: x,
        sy: y,
        px: 0,
        py: 0,
        label,
        slide: null,
        target: null,
        indicator: null,
        receiver: null,
        implicit: false,
    });
}

export function endDrag(): void {
    setDrag(null);
}

const inside = (b: Rect, px: number, py: number): boolean =>
    px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

const LINE_INSET = 4; // indicator lines tuck inside their container's box

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

// The sweep counterpart of the grip helpers: everything a marquee rectangle crosses, resolved to
// what a drag would grab. A container root never answers (it would make every sweep select the
// whole section); a swept branch answers as its depth-one ancestor, so a card is taken whole.
export function marqueeTargets(
    art: ArtifactContent,
    regions: Region[],
    box: Rect,
): ElementAddress[] {
    const crosses = (b: Rect): boolean =>
        b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y;
    const out: ElementAddress[] = [];
    const seen = new Set<string>();
    for (const r of regions) {
        const t = parseTarget(r.id);
        if (t?.kind !== "element" || !crosses(r.box)) continue;
        const root = getElementAt(art, { section: t.address.section, path: [] });
        const openRoot = getElement(root?.type ?? "")?.tier === "container";
        if (openRoot && t.address.path.length === 0) continue;
        const rep = movableAncestor(art, {
            section: t.address.section,
            path: t.address.path.slice(0, openRoot ? 1 : 0),
        });
        const key = elementRegionId(rep);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(rep);
    }
    return out;
}

const childCount = (inst?: ElementInstance): number => {
    if (!inst) return 0;
    const spec = getElement(inst.type);
    return spec?.container ? spec.container.children(inst.data).length : 0;
};

export const groupAxis = (inst?: ElementInstance): "row" | "col" =>
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
    // only a real row root has columns; a col root's stacked children sorted by x would mint a
    // phantom boundary at the section's centre (addColumn agrees: a non-row root is one column)
    const cols =
        groupAxis(root) === "row" && gridColumns(root) === null
            ? flowOnly(childBoxes(regions, sid, [], "row"), instKids(root))
            : [];
    if (cols.length) return cols.map((c) => c.box);
    const box = regions.find((r) => r.id === `el:${sid}`)?.box;
    return box ? [box] : [];
}

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

export const sectionCard = (regions: Region[], sid: string): Rect | null =>
    (regions.find((r) => r.id === `section:${sid}`) ?? regions.find((r) => r.id === `el:${sid}`))
        ?.box ?? null;

// The one precedence rule for a body grab: a multi-selection the grip belongs to drags as its
// block (else grabbing any unit's text silently collapses the set into an item reorder), then a
// unit item reorders within its unit, then the movable ancestor drags alone.
export function movePayloadFor(
    art: ArtifactContent,
    address: ElementAddress,
    selected: ElementAddress[],
): { payload: DragPayload; clear: boolean } {
    const a = movableAncestor(art, address);
    const block = moveManyPayload(a, selected);
    if (block) return { payload: block, clear: false };
    const item = unitItem(art, address);
    if (item) return { payload: { kind: "move", from: item }, clear: true };
    return { payload: { kind: "move", from: a }, clear: true };
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

// ————— Model 1: the constrained slide (controlled-canvas round) —————
// Targeting is two rules: which open container's box holds the pointer (boundary events, with
// the promotion margin as the hysteresis), and which 1-D slot along its axis. Nothing else is
// classified, so nothing else can be meant.

// pushing this far past the scope's box escalates the slide one level; inside it, the scope is
// sticky, which is what keeps a wobble at a container's edge from flapping
export const PROMOTE_PX = 32;

export type DragScope =
    | { kind: "container"; section: string; path: number[] }
    | { kind: "wrap"; section: string; path: number[] }
    | { kind: "stack" };

export interface Slide {
    scope: DragScope;
    slot: number;
    target: DropTarget | null; // null = home: releasing keeps the element where it lives
    receiver: Rect | null; // the scope's box, for the highlight
    line: SlotIndicator | null; // where the lifted card sits
    implicit: boolean; // the receiver is one the drop would create: dash it
}

const openContainer = (inst?: ElementInstance): boolean =>
    !!inst && getElement(inst.type)?.tier === "container";

// the payload's own subtree is never a scope and never a slot
function srcPaths(payload: DragPayload, section: string): number[][] {
    if (payload.kind === "move" && payload.from.section === section) return [payload.from.path];
    if (payload.kind === "moveMany" && payload.parent.section === section)
        return payload.indices.map((i) => [...payload.parent.path, i]);
    return [];
}

function scopeBox(regions: Region[], scope: DragScope): Rect | null {
    if (scope.kind === "stack") return null;
    if (scope.kind === "wrap") return regionBox(regions, scope.section, scope.path);
    return scope.path.length === 0
        ? (sectionCard(regions, scope.section) ?? regionBox(regions, scope.section, []))
        : regionBox(regions, scope.section, scope.path);
}

const slotLine = (
    axis: "row" | "col",
    flow: { index: number; box: Rect }[],
    k: number,
    box: Rect,
): SlotIndicator => {
    const main = (b: Rect): [number, number] =>
        axis === "row" ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    const raw =
        k === 0
            ? main(flow[0]!.box)[0] - 6
            : k === flow.length
              ? main(flow[k - 1]!.box)[1] + 6
              : (main(flow[k - 1]!.box)[1] + main(flow[k]!.box)[0]) / 2;
    const [c0, c1] = main(box);
    const pos = Math.min(Math.max(raw, c0 + LINE_INSET), c1 - LINE_INSET);
    return axis === "row"
        ? vLine(pos, box.y + LINE_INSET, Math.max(0, box.h - LINE_INSET * 2))
        : hLine(box.x + LINE_INSET, pos, Math.max(0, box.w - LINE_INSET * 2));
};

// the slide within one container: quantize the pointer to a flow slot, the old noop flanks as home
function containerSlide(
    art: ArtifactContent,
    regions: Region[],
    scope: { kind: "container"; section: string; path: number[] },
    payload: DragPayload,
    px: number,
    py: number,
): Slide {
    const sid = scope.section;
    const inst = getElementAt(art, { section: sid, path: scope.path });
    const box = scopeBox(regions, scope) ?? { x: px, y: py, w: 0, h: 0 };
    const receiver = regionBox(regions, sid, scope.path) ?? box;
    // any open children facet slides its own items (a unit given as the sealed scope included);
    // a true leaf root still receives: its two slots stack the section above or below it
    if (!isContainer(inst)) {
        const mid = receiver.y + receiver.h / 2;
        const before = py < mid;
        return {
            scope,
            slot: before ? 0 : 1,
            target: { section: sid, op: "wrap", path: [], index: 0, before, direction: "col" },
            receiver,
            line: hLine(
                receiver.x + LINE_INSET,
                before ? receiver.y + 2 : receiver.y + receiver.h - 2,
                Math.max(0, receiver.w - LINE_INSET * 2),
            ),
            implicit: true,
        };
    }
    const kids = instKids(inst);
    const cols = gridColumns(inst);
    const axis = cols !== null ? "row" : groupAxis(inst);
    const all = flowOnly(childBoxes(regions, sid, scope.path, cols !== null ? "grid" : axis), kids);
    if (!all.length)
        return {
            scope,
            slot: 0,
            target: {
                section: sid,
                op: kids.length ? "insert" : "replace",
                path: scope.path,
                index: kids.length,
                before: false,
                direction: "col",
            },
            receiver,
            line: null,
            implicit: false,
        };
    const src = srcPaths(payload, sid);
    const srcIdx = src
        .filter((p) => p.length === scope.path.length + 1 && scope.path.every((v, i) => v === p[i]))
        .map((p) => p[p.length - 1]!);
    let flow = all;
    let band = receiver;
    let end = kids.length;
    if (cols !== null) {
        // a grid slides row-major: pick the visual row band by y, then quantize by x inside it
        const rows: { index: number; box: Rect }[][] = [];
        for (let r = 0; r * cols < all.length; r++) rows.push(all.slice(r * cols, (r + 1) * cols));
        let r = rows.length - 1;
        for (let i = 0; i < rows.length - 1; i++) {
            const cut =
                (Math.max(...rows[i]!.map((b) => b.box.y + b.box.h)) +
                    Math.min(...rows[i + 1]!.map((b) => b.box.y))) /
                2;
            if (py < cut) {
                r = i;
                break;
            }
        }
        flow = rows[r]!;
        band = receiver;
        end = rows[r + 1] ? rows[r + 1]![0]!.index : kids.length;
    }
    const v = axis === "row" ? px : py;
    const mid = (b: Rect): number => (axis === "row" ? b.x + b.w / 2 : b.y + b.h / 2);
    let k = flow.length;
    for (let i = 0; i < flow.length; i++)
        if (v < mid(flow[i]!.box)) {
            k = i;
            break;
        }
    // the flanks of the source (or of a contiguous block) mean home
    const positions = srcIdx
        .map((i) => flow.findIndex((b) => b.index === i))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
    const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1]! + 1);
    const home =
        positions.length > 0 &&
        contiguous &&
        k >= positions[0]! &&
        k <= positions[positions.length - 1]! + 1;
    const index = k === flow.length ? end : flow[k]!.index;
    return {
        scope,
        slot: k,
        target: home
            ? null
            : {
                  section: sid,
                  op: "insert",
                  path: scope.path,
                  index,
                  before: false,
                  direction: axis,
              },
        receiver,
        line: home ? null : slotLine(axis, flow, k, band),
        implicit: false,
    };
}

function stackSlide(
    art: ArtifactContent,
    regions: Region[],
    payload: DragPayload,
    py: number,
): Slide {
    const cards = art.sections
        .map((sec) => ({ id: sec.id, box: sectionCard(regions, sec.id) }))
        .filter((c): c is { id: string; box: Rect } => c.box !== null);
    let k = cards.length;
    for (let i = 0; i < cards.length; i++)
        if (py < cards[i]!.box.y + cards[i]!.box.h / 2) {
            k = i;
            break;
        }
    const idx = art.sections.findIndex(
        (sec) => sec.id === cards[Math.min(k, cards.length - 1)]?.id,
    );
    const index = k >= cards.length ? art.sections.length : Math.max(0, idx);
    const srcSection =
        payload.kind === "section" ? art.sections.findIndex((sec) => sec.id === payload.id) : -1;
    const home = srcSection >= 0 && (index === srcSection || index === srcSection + 1);
    const left = Math.min(...cards.map((c) => c.box.x));
    const width = Math.max(...cards.map((c) => c.box.x + c.box.w)) - left;
    const y =
        k >= cards.length
            ? cards[cards.length - 1]!.box.y + cards[cards.length - 1]!.box.h + 8
            : cards[k]!.box.y - 8;
    return {
        scope: { kind: "stack" },
        slot: index,
        target: home
            ? null
            : { section: "", op: "newSection", path: [], index, before: false, direction: "col" },
        receiver: null,
        line: home ? null : hLine(left, y, width),
        implicit: false,
    };
}

// A leaf or sealed member wraps rather than opens: its claim area in a row is its full column
// strip (the gutters stay the row's own slots), in a col only its side edge bands, so sliding
// over stacked siblings still reorders. The wrap is the one structure a slide can create.
const SIDE_BAND = (w: number): number => Math.min(40, Math.max(12, w * 0.15));

function wrapMemberAt(
    art: ArtifactContent,
    regions: Region[],
    scope: { kind: "container"; section: string; path: number[] },
    payload: DragPayload,
    px: number,
    py: number,
): { path: number[]; parentAxis: "row" | "col" } | null {
    const inst = getElementAt(art, { section: scope.section, path: scope.path });
    if (!isContainer(inst)) return null;
    const kids = instKids(inst);
    const cols = gridColumns(inst);
    const axis = cols !== null ? "row" : groupAxis(inst);
    const box = scopeBox(regions, scope);
    if (!box) return null;
    const src = srcPaths(payload, scope.section);
    for (const kb of childBoxes(regions, scope.section, scope.path, "col")) {
        const childPath = [...scope.path, kb.index];
        if (src.some((m) => m.length <= childPath.length && m.every((v, i) => v === childPath[i])))
            continue;
        const kid = kids[kb.index];
        if (!kid || openContainer(kid)) continue;
        const b = kb.box;
        const hit =
            cols !== null
                ? inside(b, px, py)
                : axis === "row"
                  ? px >= b.x && px <= b.x + b.w && py >= box.y && py <= box.y + box.h
                  : py >= b.y &&
                    py <= b.y + b.h &&
                    (px <= b.x + SIDE_BAND(b.w) || px >= b.x + b.w - SIDE_BAND(b.w));
        if (hit) return { path: childPath, parentAxis: axis };
    }
    return null;
}

function wrapSlide(
    regions: Region[],
    section: string,
    path: number[],
    parentAxis: "row" | "col",
    px: number,
    py: number,
): Slide | null {
    const b = regionBox(regions, section, path);
    if (!b) return null;
    const direction = parentAxis === "row" ? "col" : "row";
    const before = direction === "col" ? py < b.y + b.h / 2 : px < b.x + b.w / 2;
    return {
        scope: { kind: "wrap", section, path },
        slot: before ? 0 : 1,
        target: { section, op: "wrap", path, index: 0, before, direction },
        receiver: b,
        line:
            direction === "col"
                ? hLine(
                      b.x + LINE_INSET,
                      before ? b.y + 2 : b.y + b.h - 2,
                      Math.max(0, b.w - LINE_INSET * 2),
                  )
                : vLine(
                      before ? b.x + 2 : b.x + b.w - 2,
                      b.y + LINE_INSET,
                      Math.max(0, b.h - LINE_INSET * 2),
                  ),
        implicit: true,
    };
}

/** One slide state per pointer move: the scope by containment, the slot by quantization. */
export function slideAt(
    art: ArtifactContent,
    regions: Region[],
    payload: DragPayload,
    px: number,
    py: number,
    prev: Slide | null,
): Slide | null {
    if (payload.kind === "section") return stackSlide(art, regions, payload, py);
    const sealedUnit =
        payload.kind === "move" && unitItem(art, payload.from) !== null
            ? { section: payload.from.section, path: payload.from.path.slice(0, -1) }
            : null;
    if (sealedUnit)
        return containerSlide(art, regions, { kind: "container", ...sealedUnit }, payload, px, py);
    // start from where the gesture was, or from the payload's own parent; a wrap scope is
    // terminal, so a resumed gesture re-decides from the member's parent
    let scope: DragScope | null =
        prev?.scope.kind === "wrap"
            ? {
                  kind: "container",
                  section: prev.scope.section,
                  path: prev.scope.path.slice(0, -1),
              }
            : (prev?.scope ?? null);
    if (!scope) {
        if (payload.kind === "move" && payload.from.path.length > 0)
            scope = {
                kind: "container",
                section: payload.from.section,
                path: payload.from.path.slice(0, -1),
            };
        else if (payload.kind === "moveMany")
            scope = {
                kind: "container",
                section: payload.parent.section,
                path: payload.parent.path,
            };
        else scope = { kind: "stack" };
    }
    // promote while the pointer is past the margin; the section root promotes to the stack
    while (scope.kind === "container") {
        const box = scopeBox(regions, scope);
        if (box && inside(expand(box, PROMOTE_PX), px, py)) break;
        scope =
            scope.path.length === 0
                ? { kind: "stack" }
                : { kind: "container", section: scope.section, path: scope.path.slice(0, -1) };
    }
    // descend: entering an open child's box (or a card, from the stack) re-scopes into it
    if (scope.kind === "stack") {
        const under = art.sections.find((sec) => {
            const b = sectionCard(regions, sec.id);
            return b && inside(b, px, py);
        });
        if (under) scope = { kind: "container", section: under.id, path: [] };
    }
    const stepInto = (cur: { section: string; path: number[] }): number | null => {
        const inst = getElementAt(art, { section: cur.section, path: cur.path });
        if (!openContainer(inst)) return null;
        const src = srcPaths(payload, cur.section);
        const kids = instKids(inst);
        const next = childBoxes(regions, cur.section, cur.path, "col").find((kb) => {
            const childPath = [...cur.path, kb.index];
            if (
                src.some(
                    (m) => m.length <= childPath.length && m.every((v, i) => v === childPath[i]),
                )
            )
                return false;
            return openContainer(kids[kb.index]) && inside(kb.box, px, py);
        });
        return next ? next.index : null;
    };
    while (scope.kind === "container") {
        const idx = stepInto(scope);
        if (idx === null) break;
        scope = { kind: "container", section: scope.section, path: [...scope.path, idx] };
    }
    if (scope.kind === "container") {
        const m = wrapMemberAt(art, regions, scope, payload, px, py);
        if (m) {
            const w = wrapSlide(regions, scope.section, m.path, m.parentAxis, px, py);
            if (w) return w;
        }
    }
    return scope.kind === "stack"
        ? stackSlide(art, regions, payload, py)
        : containerSlide(art, regions, scope, payload, px, py);
}

// The one structural affordance a drag renders: slim pills at the root gutters that split the
// section into columns. Everything deeper is a command, never a drop side-effect.
export interface GutterPill {
    box: Rect;
    line: SlotIndicator;
    target: DropTarget;
}

export function gutterPills(
    art: ArtifactContent,
    regions: Region[],
    sectionId: string,
    payload: DragPayload,
): GutterPill[] {
    const root = getElementAt(art, { section: sectionId, path: [] });
    if (isContainer(root) && childCount(root) === 0) return [];
    const columns = sectionColumns(regions, sectionId, root);
    if (!columns.length) return [];
    const srcCols = srcPaths(payload, sectionId)
        .filter((p) => p.length === 1)
        .map((p) => p[0]!);
    const rowRoot = groupAxis(root) === "row" && gridColumns(root) === null;
    const top = Math.min(...columns.map((c) => c.y));
    const bottom = Math.max(...columns.map((c) => c.y + c.h));
    const xs: { x: number; index: number }[] = [{ x: columns[0]!.x, index: 0 }];
    for (let i = 0; i < columns.length - 1; i++)
        xs.push({ x: (columns[i]!.x + columns[i]!.w + columns[i + 1]!.x) / 2, index: i + 1 });
    const last = columns[columns.length - 1]!;
    xs.push({ x: last.x + last.w, index: columns.length });
    return xs
        .filter((b) => !(rowRoot && srcCols.some((i) => b.index === i || b.index === i + 1)))
        .map((b) => ({
            box: { x: b.x - 12, y: top, w: 24, h: bottom - top },
            line: vLine(b.x, top + LINE_INSET, Math.max(0, bottom - top - LINE_INSET * 2)),
            target: {
                section: sectionId,
                op: "column",
                path: [],
                index: b.index,
                before: false,
                direction: "row",
            },
        }));
}

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
        if (here) {
            const moved = moveChildrenTo(art, parent, indices, target.index);
            return result(moved.content, {
                section: parent.section,
                path: [...parent.path, moved.at],
            });
        }
        // anywhere else: lift the block out, re-aim the target across the lift, land it —
        // sequentially into a gap, as one source-axis group for every other op
        const inst = getElementAt(art, parent);
        const sorted = [...new Set(indices)].sort((x, y) => x - y);
        const depth = parent.path.length;
        const under = (p: number[]): boolean =>
            target.section === parent.section &&
            p.length > depth &&
            parent.path.every((v, i) => v === p[i]);
        if (under(target.path) && sorted.includes(target.path[depth]!)) return result(art, null);
        const lift = inst && liftChildren(art, parent, sorted);
        if (!lift) return result(art, null);
        const { content: lifted, block } = lift;
        const rebased = under(target.path)
            ? target.path.map((v, i) => (i === depth ? v - sorted.filter((k) => k < v).length : v))
            : target.path;
        const aimed: DropTarget = {
            ...target,
            path: rebased,
            index:
                target.op === "column" && target.section === parent.section && depth === 0
                    ? target.index - sorted.filter((i) => i < target.index).length
                    : target.index,
        };
        let placed: { content: ArtifactContent; address: ElementAddress | null };
        if (aimed.op === "insert") {
            let content = lifted;
            for (const [i, el] of block.entries())
                content = insertChild(
                    content,
                    { section: aimed.section, path: aimed.path },
                    aimed.index + i,
                    el,
                );
            placed = result(content, {
                section: aimed.section,
                path: [...aimed.path, aimed.index],
            });
        } else {
            const group = groupAxis(inst) === "row" ? rowGroup(block) : colGroup(block);
            placed = place(lifted, aimed, group);
        }
        return result(collapseSection(placed.content, parent.section, parent.path), placed.address);
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

// the parting feel; tuned in manual QA rather than argued in review
export const PART_FEEL = { ms: 140, easing: "ease-out" };

// a drop or keyboard step queues exactly one FLIP'd repaint: the commit animates the truth once
let commitFlipQueued = false;
export function requestCommitFlip(): void {
    commitFlipQueued = true;
}
export function takeCommitFlip(): boolean {
    const f = commitFlipQueued;
    commitFlipQueued = false;
    return f;
}
