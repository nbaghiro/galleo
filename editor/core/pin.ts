import type { ArtifactContent, ElementAddress } from "@model/artifact";
import type { ElementLayout } from "@model/geometry";
import type { Rect, Region } from "@engine/node";
import { elementRegionId } from "@model/artifact";
import { getElementAt, setElementLayout } from "@elements/ops";
import { applyDrop, movable, type DropTarget } from "./dnd";
import { profileFor, rampScale } from "@engine/profile";
import { layoutSection, measureText } from "@canvas/render/commands";
import { sectionLayoutWidth } from "@canvas/render/backends";
import { capture } from "@ui/analytics";
import {
    canvasContentWidth,
    commit,
    editor,
    editorTokens,
    regions,
    sectionFitScale,
} from "./store";

// Pinning: an element lifted out of its parent's flow and anchored to the parent's box. All math
// here works in two spaces — the published stage space chrome and pointers live in, and the local
// layout space a private `layoutSection` of the same section produces. Offsets are stored composed
// (the engine multiplies them back up through the ramp and autofit), so the exact dx/dy always
// come from solving in local space rather than trusting a region box that includes padding.

export type Pin = NonNullable<ElementLayout["pin"]>;
type Anchor = Pin["x"];

const FRAC: Record<Anchor, number> = { start: 0, center: 0.5, end: 1 };
export const PIN_ANCHORS: Anchor[] = ["start", "center", "end"];
const SNAP = 6; // stage px within which a released pin lands flush on its anchor

export const anchorPoint = (box: Rect, x: Anchor, y: Anchor): [number, number] => [
    box.x + box.w * FRAC[x],
    box.y + box.h * FRAC[y],
];

export const isPinned = (art: ArtifactContent, address: ElementAddress): boolean =>
    !!getElementAt(art, address)?.layout?.pin;

/** The paint turn covering `address`: the outermost self-or-ancestor pin rotation and its center,
 *  matching emit's outer-spin-wins rule, so chrome can overlay painted content transformed. */
export function paintSpin(
    art: ArtifactContent,
    address: ElementAddress,
): { deg: number; cx: number; cy: number } | null {
    for (let n = 1; n <= address.path.length; n++) {
        const a = { section: address.section, path: address.path.slice(0, n) };
        const deg = getElementAt(art, a)?.layout?.pin?.rotate;
        if (!deg) continue;
        const b = boxOf(elementRegionId(a));
        // the AABB's center is the turned box's own center, so it needs no un-turning
        return b ? { deg, cx: b.x + b.w / 2, cy: b.y + b.h / 2 } : null;
    }
    return null;
}

/** The flat (pre-turn) box of a region painted under `spin`: its polygon turned back. The AABB
 *  alone cannot recover it (turning a bounding box back inflates it), so the polygon is the source. */
export function flatBox(r: Region, spin: { deg: number; cx: number; cy: number }): Rect {
    const b = r.box;
    const pts: [number, number][] = r.shape?.points ?? [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
    ];
    const rad = (-spin.deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const xs = pts.map(([px, py]) => spin.cx + (px - spin.cx) * cos - (py - spin.cy) * sin);
    const ys = pts.map(([px, py]) => spin.cy + (px - spin.cx) * sin + (py - spin.cy) * cos);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A pinned element dropped on a flow gap: the pin comes off and the move lands, one change. */
export function reflowPin(
    art: ArtifactContent,
    address: ElementAddress,
    target: DropTarget,
): { content: ArtifactContent; address: ElementAddress | null } {
    const inst = getElementAt(art, address);
    if (!inst?.layout?.pin) return { content: art, address: null };
    const { pin: _pin, ...rest } = inst.layout;
    const unpinned = setElementLayout(art, address, rest);
    return applyDrop(unpinned, target, { kind: "move", from: address });
}

/** Whether the inspector may offer pinning here at all. */
export const pinnable = (art: ArtifactContent, address: ElementAddress): boolean =>
    address.path.length > 0 && movable(art, address);

/** Stage px painted per composed px in this section: the fluid ramp times autofit. */
export function pinGestureScale(sectionId: string): number {
    const profile = profileFor(editor.artifact);
    const section = editor.artifact.sections.find((s) => s.id === sectionId);
    const w = section
        ? sectionLayoutWidth(section, profile, canvasContentWidth())
        : canvasContentWidth();
    return rampScale(profile, w) * sectionFitScale(sectionId);
}

export const parentAddress = (address: ElementAddress): ElementAddress => ({
    section: address.section,
    path: address.path.slice(0, -1),
});

/** The deepest self-or-ancestor carrying a pin: what a body grab anywhere inside it moves. */
export function pinnedAncestor(
    art: ArtifactContent,
    address: ElementAddress,
): ElementAddress | null {
    for (let n = address.path.length; n >= 1; n--) {
        const a = { section: address.section, path: address.path.slice(0, n) };
        if (getElementAt(art, a)?.layout?.pin) return a;
    }
    return null;
}

export type PinVia = "panel" | "bar" | "palette" | "drag";

export const boxOf = (id: string): Rect | undefined => regions().find((r) => r.id === id)?.box;

// per axis, the anchor whose parent point sits closest to the element's own matching point, so a
// badge released near the right edge rides `end` and stays a badge when the parent grows
const nearestAnchor = (p0: number, pw: number, e0: number, ew: number): Anchor => {
    let best: Anchor = "start";
    let least = Infinity;
    for (const a of PIN_ANCHORS) {
        const d = Math.abs(e0 + ew * FRAC[a] - (p0 + pw * FRAC[a]));
        if (d < least) {
            least = d;
            best = a;
        }
    }
    return best;
};

interface LocalBoxes {
    el: Rect;
    parent: Rect;
    k: number; // ramp scale baked into local coordinates
}

// A private layout of one section, same memoized measure the canvas uses; local coordinates carry
// the ramp but not autofit or a slide frame, which is why callers only ever compare boxes that
// came from the same call.
function localBoxes(art: ArtifactContent, address: ElementAddress): LocalBoxes | null {
    const section = art.sections.find((s) => s.id === address.section);
    if (!section) return null;
    const profile = profileFor(art);
    const w = sectionLayoutWidth(section, profile, canvasContentWidth());
    const { regions: regs } = layoutSection(section, w, measureText, editorTokens(), profile);
    const el = regs.find((r) => r.id === elementRegionId(address))?.box;
    const parent = regs.find((r) => r.id === elementRegionId(parentAddress(address)))?.box;
    return el && parent ? { el, parent, k: rampScale(profile, w) } : null;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * The layout that pins `address` with `anchors`, painted with its anchor point `gap` stage px past
 * the parent's (0 = flush). The engine positions floats against the parent's content box while
 * chrome only sees region boxes, so the offsets are solved: lay the candidate out locally, measure
 * where it landed, and cancel the residual — exact in one pass, since position is linear in dx.
 */
export function pinnedLayout(
    art: ArtifactContent,
    address: ElementAddress,
    anchors: { x: Anchor; y: Anchor },
    gap: { x: number; y: number },
    keep?: Pin,
): ElementLayout | null {
    const inst = getElementAt(art, address);
    // same gate as every structural op: a unit's internal children are not the editor's to lift
    if (!inst || address.path.length === 0 || !movable(art, address)) return null;
    const layout = inst.layout ?? {};
    // a pinned element sizes to itself; a full-width one would blanket the parent
    const width = !layout.width || layout.width === "fill" ? ("fit" as const) : layout.width;
    const fit = sectionFitScale(address.section) || 1;
    const pin: Pin = { x: anchors.x, y: anchors.y };
    if (keep?.z !== undefined) pin.z = keep.z;
    if (keep?.rotate !== undefined) pin.rotate = keep.rotate;
    const candidate: ElementLayout = { ...layout, width, pin };
    const local = localBoxes(setElementLayout(art, address, candidate), address);
    if (!local) return candidate;
    const [px, py] = anchorPoint(local.parent, anchors.x, anchors.y);
    const [ex, ey] = anchorPoint(local.el, anchors.x, anchors.y);
    const dx = round1((gap.x / fit + px - ex) / local.k);
    const dy = round1((gap.y / fit + py - ey) / local.k);
    if (dx) pin.dx = dx;
    if (dy) pin.dy = dy;
    return candidate;
}

/** The anchors + snapped anchor-point gaps for an element sitting at `el` inside `parent` (stage space). */
export function nearestPinPlacement(
    parent: Rect,
    el: Rect,
): { anchors: { x: Anchor; y: Anchor }; gap: { x: number; y: number } } {
    const anchors = {
        x: nearestAnchor(parent.x, parent.w, el.x, el.w),
        y: nearestAnchor(parent.y, parent.h, el.y, el.h),
    };
    const [px, py] = anchorPoint(parent, anchors.x, anchors.y);
    const [ex, ey] = anchorPoint(el, anchors.x, anchors.y);
    const snap = (d: number): number => (Math.abs(d) <= SNAP ? 0 : d);
    return { anchors, gap: { x: snap(ex - px), y: snap(ey - py) } };
}

/** Pin in place (nearest anchor, position preserved) or unpin back into the flow. */
export function togglePin(address: ElementAddress, via: PinVia = "panel"): void {
    const inst = getElementAt(editor.artifact, address);
    if (!inst || address.path.length === 0 || !movable(editor.artifact, address)) return;
    const layout = inst.layout ?? {};
    if (layout.pin) {
        const { pin: _pin, ...rest } = layout;
        commit(setElementLayout(editor.artifact, address, rest));
        capture("element_unpinned", { element_type: inst.type, via });
        return;
    }
    const el = boxOf(elementRegionId(address));
    const parent = boxOf(elementRegionId(parentAddress(address)));
    const placed = el && parent ? nearestPinPlacement(parent, el) : null;
    const next = pinnedLayout(
        editor.artifact,
        address,
        placed?.anchors ?? { x: "start", y: "start" },
        placed?.gap ?? { x: 0, y: 0 },
    );
    if (!next) return;
    commit(setElementLayout(editor.artifact, address, next));
    capture("element_pinned", { element_type: inst.type, via });
}
