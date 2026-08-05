import { describe, expect, it } from "vitest";
import { classifySwipe, SWIPE_MAX_MS, SWIPE_MIN_PX, TAP_BACK_FRACTION, tapZone } from "@ui/gesture";

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
