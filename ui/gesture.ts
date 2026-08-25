export type SwipeIntent = "next" | "prev" | null;

export interface SwipeSample {
    dx: number; // px, positive = rightward
    dy: number;
    dt: number; // ms between pointerdown and pointerup
}

// Below this a swipe is indistinguishable from a tap's jitter.
export const SWIPE_MIN_PX = 45;
// A swipe must be clearly more horizontal than vertical, else it belongs to the scroller.
export const SWIPE_AXIS_RATIO = 1.2;
// Slower than this is a drag (or a scroll that happened to end sideways), not a flick.
export const SWIPE_MAX_MS = 800;

// Swiping left (negative dx) pulls the next slide in.
export function classifySwipe(s: SwipeSample): SwipeIntent {
    if (s.dt > SWIPE_MAX_MS) return null;
    const ax = Math.abs(s.dx);
    if (ax < SWIPE_MIN_PX) return null;
    if (ax < Math.abs(s.dy) * SWIPE_AXIS_RATIO) return null;
    return s.dx < 0 ? "next" : "prev";
}

// A press that travelled further than this is a text selection or a scroll, not a tap on an
// affordance. Shared so every view-only surface reads the same gesture as a tap.
export const TAP_SLOP = 6;

export type TapZone = "prev" | "next";

// Narrow enough that the common "tap to advance" still dominates, wide enough to hit with a thumb.
export const TAP_BACK_FRACTION = 0.28;

export function tapZone(x: number, width: number): TapZone {
    if (width <= 0) return "next";
    return x < width * TAP_BACK_FRACTION ? "prev" : "next";
}

// A press on a link or a live player belongs to that thing, so whatever the surface underneath
// would have done with it (advance a slide, toggle a disclosure) stands down.
export const CONTENT_PRESS = "a, [data-live]";

export const pressOnContent = (target: EventTarget | null): boolean =>
    target instanceof Element && !!target.closest(CONTENT_PRESS);

// ---- outside dismissal ------------------------------------------------------------------------
//
// What a pointerdown means for a surface that is already open. The caller does the containment test
// (composedPath against its own element and whatever opened it) and this decides what follows. The
// press is never swallowed either way: it goes on to select an element or press a button as usual.

export interface PressOn {
    inside: boolean; // the surface itself, or the control that owns it
    onCanvas: boolean; // the content stage, where the press is about to change the selection
}

export type Dismissal = "keep" | "close" | "defer";

export interface DismissRules {
    dragging: boolean; // a gesture owns the pointer; nothing may close under it
    // Whether a press on the canvas waits for the selection it makes. A surface that a selection can
    // re-open (the inspector) has to, or it blinks shut and straight back open.
    deferOnCanvas: boolean;
}

export function dismissalFor(press: PressOn, rules: DismissRules): Dismissal {
    if (rules.dragging || press.inside) return "keep";
    return press.onCanvas && rules.deferOnCanvas ? "defer" : "close";
}

// ---- overlay ownership ------------------------------------------------------------------------
//
// A popover portals to <body>, so a menu opened inside a panel is a sibling of that panel rather
// than a descendant, and no containment test can find it. Ownership is stamped instead of inferred:
// a dismissable surface hands a token down (`OverlayOwner` in ui/overlay), every Popover under it
// writes that token onto what it portals, and a press carrying the token counts as inside. Nesting
// inherits, so a menu inside a dropdown inside the inspector still answers to the inspector.

export const OWNER_ATTR = "data-galleo-owner";

let tokens = 0;
// Only ever compared with itself, never parsed or persisted, so a counter per document is enough.
export const newOwnerToken = (name: string): string => `${name}-${++tokens}`;

export interface PressScope {
    el?: HTMLElement; // the surface's own element
    owner?: string; // what its popovers are stamped with
    opener?: string; // selector for the control that opened it, when that lives elsewhere
}

// composedPath, not `contains`: it already carries every ancestor, so matching each node covers the
// opener too, and it is the only view that survives a portal.
export function pressInside(path: readonly EventTarget[], scope: PressScope): boolean {
    for (const node of path) {
        if (scope.el && node === scope.el) return true;
        if (!(node instanceof Element)) continue;
        if (scope.owner && node.getAttribute(OWNER_ATTR) === scope.owner) return true;
        if (scope.opener && node.matches(scope.opener)) return true;
    }
    return false;
}
