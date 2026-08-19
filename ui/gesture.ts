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

export type TapZone = "prev" | "next";

// Narrow enough that the common "tap to advance" still dominates, wide enough to hit with a thumb.
export const TAP_BACK_FRACTION = 0.28;

export function tapZone(x: number, width: number): TapZone {
    if (width <= 0) return "next";
    return x < width * TAP_BACK_FRACTION ? "prev" : "next";
}

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
