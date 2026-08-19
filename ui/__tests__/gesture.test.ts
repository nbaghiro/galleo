import { describe, expect, it } from "vitest";
import {
    dismissalFor,
    classifySwipe,
    SWIPE_MAX_MS,
    SWIPE_MIN_PX,
    TAP_BACK_FRACTION,
    tapZone,
} from "@ui/gesture";

describe("classifySwipe", () => {
    it("reads a leftward flick as next and a rightward flick as prev", () => {
        expect(classifySwipe({ dx: -80, dy: 4, dt: 180 })).toBe("next");
        expect(classifySwipe({ dx: 80, dy: 4, dt: 180 })).toBe("prev");
    });

    it("ignores movement below the jitter threshold", () => {
        expect(classifySwipe({ dx: -(SWIPE_MIN_PX - 1), dy: 0, dt: 120 })).toBeNull();
        expect(classifySwipe({ dx: -SWIPE_MIN_PX, dy: 0, dt: 120 })).toBe("next");
    });

    it("yields to the scroller when the gesture is mostly vertical", () => {
        expect(classifySwipe({ dx: -60, dy: 200, dt: 200 })).toBeNull();
        expect(classifySwipe({ dx: -60, dy: 40, dt: 200 })).toBe("next");
    });

    it("ignores a slow drag", () => {
        expect(classifySwipe({ dx: -120, dy: 0, dt: SWIPE_MAX_MS + 1 })).toBeNull();
        expect(classifySwipe({ dx: -120, dy: 0, dt: SWIPE_MAX_MS })).toBe("next");
    });

    it("treats a diagonal at the axis ratio boundary as vertical", () => {
        expect(classifySwipe({ dx: -100, dy: 100, dt: 200 })).toBeNull();
    });
});

describe("tapZone", () => {
    it("sends the leading edge back and everything else forward", () => {
        expect(tapZone(10, 400)).toBe("prev");
        expect(tapZone(200, 400)).toBe("next");
        expect(tapZone(399, 400)).toBe("next");
    });

    it("switches exactly at the back fraction", () => {
        const w = 1000;
        expect(tapZone(w * TAP_BACK_FRACTION - 1, w)).toBe("prev");
        expect(tapZone(w * TAP_BACK_FRACTION, w)).toBe("next");
    });

    it("defaults to next when the width is unknown", () => {
        expect(tapZone(0, 0)).toBe("next");
    });
});

// What a pointerdown means for a surface that is already open. The press is never swallowed, so
// this only decides whether the surface closes, not whether the click happens.
describe("dismissalFor", () => {
    const press = (over: Partial<{ inside: boolean; onCanvas: boolean }> = {}) => ({
        inside: false,
        onCanvas: false,
        ...over,
    });
    const rules = (over: Partial<{ dragging: boolean; deferOnCanvas: boolean }> = {}) => ({
        dragging: false,
        deferOnCanvas: false,
        ...over,
    });

    it("closes on a press with nothing to do with the surface", () => {
        expect(dismissalFor(press(), rules())).toBe("close");
    });

    it("leaves the surface alone when the press was inside it or on what opened it", () => {
        expect(dismissalFor(press({ inside: true }), rules())).toBe("keep");
        expect(dismissalFor(press({ inside: true, onCanvas: true }), rules())).toBe("keep");
    });

    // a palette tile drag starts inside the flyout and ends on the canvas: closing mid-gesture, or
    // on the release that drops it, would break the drop before it resolves
    it("never closes while a gesture owns the pointer", () => {
        expect(dismissalFor(press(), rules({ dragging: true }))).toBe("keep");
        expect(dismissalFor(press({ onCanvas: true }), rules({ dragging: true }))).toBe("keep");
    });

    it("defers a canvas press for a surface a selection can re-open", () => {
        expect(dismissalFor(press({ onCanvas: true }), rules({ deferOnCanvas: true }))).toBe(
            "defer",
        );
    });

    it("closes on a canvas press for a surface no selection would bring back", () => {
        expect(dismissalFor(press({ onCanvas: true }), rules())).toBe("close");
    });

    it("closes on chrome even when canvas presses are deferred", () => {
        expect(dismissalFor(press(), rules({ deferOnCanvas: true }))).toBe("close");
    });
});
