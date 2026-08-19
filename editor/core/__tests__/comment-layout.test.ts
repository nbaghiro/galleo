import { describe, expect, it } from "vitest";
import {
    MARKER_SIZE,
    MARKER_SPACING,
    chipAt,
    lineOfOffset,
    lineTop,
    markersRevealed,
    markerX,
    panelAt,
    PANEL_EDGE,
    PANEL_GAP,
    placeMarkers,
    rangeRects,
    sectionAtY,
} from "@editor/core/comments";
import type { RunLayout } from "@canvas/render/commands";

// a stand-in RunLayout at 8px per character, laid out left to right like the real one
const CHAR = 8;
const layoutOf = (lines: string[][], lineHeight = 20): RunLayout => ({
    lines: lines.map((frags) => {
        let x = 0;
        return {
            frags: frags.map((text) => {
                const frag = {
                    text,
                    font: "16px sans-serif",
                    underline: false,
                    strike: false,
                    code: false,
                    x,
                    width: text.length * CHAR,
                };
                x += frag.width;
                return frag;
            }),
            width: frags.join("").length * CHAR,
        };
    }),
    width: 400,
    height: lines.length * lineHeight,
    lineHeight,
});

describe("markerX", () => {
    it("sits just outside a section that has margin to spare", () => {
        expect(markerX(1000, 1400)).toBe(1012);
    });

    it("clamps inside the stage when the section runs to the edge", () => {
        // a bleed section: right edge == stage width, so the natural x would never paint
        expect(markerX(1120, 1120)).toBe(1120 - MARKER_SIZE - 6);
    });

    it("clamps for a narrow margin too, rather than half-hanging off", () => {
        // 8px of margin: 8 < 12 + 28 + 6, so the chip lands at the same clamped x
        expect(markerX(1112, 1120)).toBe(1086);
        expect(markerX(1112, 1120)).toBeLessThan(1112 + 12);
    });

    it("keeps the chip on screen when the stage is narrower than the clamp", () => {
        expect(markerX(20, 20)).toBe(6);
    });
});

describe("placeMarkers", () => {
    it("leaves markers where they ask to be when they already clear each other", () => {
        const placed = placeMarkers(
            [
                { id: "a", y: 100, sectionRight: 900 },
                { id: "b", y: 400, sectionRight: 900 },
            ],
            1200,
        );
        expect(placed.map((m) => m.y)).toEqual([100, 400]);
        expect(placed.map((m) => m.x)).toEqual([912, 912]);
    });

    it("pushes a crowd down by the minimum spacing, in order", () => {
        const placed = placeMarkers(
            [
                { id: "a", y: 100, sectionRight: 900 },
                { id: "b", y: 105, sectionRight: 900 },
                { id: "c", y: 110, sectionRight: 900 },
            ],
            1200,
        );
        expect(placed.map((m) => m.y)).toEqual([
            100,
            100 + MARKER_SPACING,
            100 + 2 * MARKER_SPACING,
        ]);
        expect(placed.map((m) => m.id)).toEqual(["a", "b", "c"]);
    });

    it("orders by y regardless of the order it was handed", () => {
        const placed = placeMarkers(
            [
                { id: "late", y: 500, sectionRight: 900 },
                { id: "early", y: 40, sectionRight: 900 },
            ],
            1200,
        );
        expect(placed.map((m) => m.id)).toEqual(["early", "late"]);
    });

    it("breaks a tie on id, so a repaint doesn't shuffle the stack", () => {
        const requests = [
            { id: "b", y: 200, sectionRight: 900 },
            { id: "a", y: 200, sectionRight: 900 },
        ];
        expect(placeMarkers(requests, 1200).map((m) => m.id)).toEqual(["a", "b"]);
        expect(placeMarkers([...requests].reverse(), 1200).map((m) => m.id)).toEqual(["a", "b"]);
    });

    it("gives each marker the x of its own section", () => {
        const placed = placeMarkers(
            [
                { id: "contained", y: 0, sectionRight: 900 },
                { id: "bleed", y: 300, sectionRight: 1200 },
            ],
            1200,
        );
        expect(placed[0]!.x).toBe(912);
        expect(placed[1]!.x).toBe(1200 - MARKER_SIZE - 6);
    });
});

describe("chipAt", () => {
    it("straddles the element's top-right corner", () => {
        expect(chipAt({ x: 100, y: 200, w: 300 }, 1200)).toEqual({ x: 386, y: 204 });
    });

    it("clamps inside the stage for an element that runs to the edge", () => {
        expect(chipAt({ x: 0, y: 0, w: 1120 }, 1120).x).toBe(1120 - MARKER_SIZE - 6);
    });
});

// A panel is a popover against whatever opened it: a margin marker, the orphan stack, or the chip
// on an element's corner. Never a fixed spot at the section's edge, which is what put the composer
// across the canvas from the element it was about to comment on.
describe("panelAt", () => {
    const panel = { w: 320, h: 400 };
    const stage = { w: 1120, h: 900 };

    it("opens to the right of its anchor when the stage has room", () => {
        expect(panelAt({ x: 100, y: 200 }, panel, stage).x).toBe(100 + MARKER_SIZE + PANEL_GAP);
    });

    it("clears an anchor as wide as it says it is", () => {
        expect(panelAt({ x: 100, y: 200, w: 90 }, panel, stage).x).toBe(100 + 90 + PANEL_GAP);
    });

    it("flips to the left when the right side would run off the stage", () => {
        expect(panelAt({ x: 900, y: 200 }, panel, stage).x).toBe(900 - 320 - PANEL_GAP);
    });

    it("keeps a flipped panel on the stage when the anchor is near the left edge too", () => {
        expect(panelAt({ x: 10, y: 200 }, panel, { w: 200, h: 900 }).x).toBe(PANEL_EDGE);
    });

    it("sits just above its anchor so the two read as one thing", () => {
        expect(panelAt({ x: 100, y: 200 }, panel, stage).y).toBe(194);
    });

    it("clamps down to the top of the stage rather than opening off it", () => {
        expect(panelAt({ x: 100, y: 2 }, panel, stage).y).toBe(PANEL_EDGE);
    });

    it("clamps up so a panel opened near the bottom stays readable", () => {
        expect(panelAt({ x: 100, y: 880 }, panel, stage).y).toBe(900 - 400 - PANEL_EDGE);
    });

    it("gives up gracefully on a stage smaller than the panel", () => {
        expect(panelAt({ x: 40, y: 40 }, panel, { w: 100, h: 100 })).toEqual({
            x: PANEL_EDGE,
            y: PANEL_EDGE,
        });
    });
});

describe("lineOfOffset", () => {
    it("finds the line an offset falls on in unwrapped text", () => {
        const layout = layoutOf([["hello world"]]);
        expect(lineOfOffset(layout, 0)).toBe(0);
        expect(lineOfOffset(layout, 10)).toBe(0);
    });

    it("accounts for the space the wrap ate", () => {
        // "hello world again" wrapped after each word: the wrap drops the leading space, so the
        // second line's first character is offset 6, not 5
        const layout = layoutOf([["hello"], ["world"], ["again"]]);
        expect(lineOfOffset(layout, 4)).toBe(0);
        expect(lineOfOffset(layout, 6)).toBe(1);
        expect(lineOfOffset(layout, 10)).toBe(1);
        expect(lineOfOffset(layout, 12)).toBe(2);
    });

    it("walks fragments within a line, not just the first", () => {
        const layout = layoutOf([["bold", "face"], ["next"]]);
        expect(lineOfOffset(layout, 7)).toBe(0);
        expect(lineOfOffset(layout, 9)).toBe(1);
    });

    it("clamps past the end to the last line", () => {
        const layout = layoutOf([["one"], ["two"]]);
        expect(lineOfOffset(layout, 999)).toBe(1);
    });

    it("reports the first line for an empty layout rather than a negative index", () => {
        expect(lineOfOffset(layoutOf([]), 3)).toBe(0);
    });

    it("stacks line tops by the laid-out line height", () => {
        const layout = layoutOf([["one"], ["two"]], 24);
        expect(lineTop(layout, 0)).toBe(0);
        expect(lineTop(layout, 1)).toBe(24);
    });
});

describe("rangeRects", () => {
    it("covers a range inside one line with one rect", () => {
        const layout = layoutOf([["hello world"]]);
        expect(rangeRects(layout, 6, 11)).toEqual([{ x: 48, y: 0, w: 40, h: 20 }]);
    });

    it("returns a rect per line a wrapped range crosses", () => {
        const layout = layoutOf([["hello"], ["world"]]);
        const rects = rangeRects(layout, 3, 8);
        expect(rects).toHaveLength(2);
        expect(rects[0]).toEqual({ x: 24, y: 0, w: 16, h: 20 });
        expect(rects[1]).toEqual({ x: 0, y: 20, w: 16, h: 20 });
    });

    it("walks across fragments inside a line", () => {
        const layout = layoutOf([["bold", "face"]]);
        expect(rangeRects(layout, 2, 6)).toEqual([{ x: 16, y: 0, w: 32, h: 20 }]);
    });

    it("has nothing to paint for an empty or inverted range", () => {
        const layout = layoutOf([["hello"]]);
        expect(rangeRects(layout, 2, 2)).toEqual([]);
        expect(rangeRects(layout, 4, 1)).toEqual([]);
    });
});

// Markers live in a section's right border and appear when that section is hovered. The rule has to
// survive the pointer leaving the section on its way to the marker, which is what `held` is for.
describe("markersRevealed", () => {
    const state = (
        over: Partial<{
            hovered: string | null;
            held: readonly (string | null)[];
            hoverless: boolean;
        }> = {},
    ) => ({ hovered: null, held: [], hoverless: false, ...over });

    it("shows the hovered section's markers and nobody else's", () => {
        expect(markersRevealed("s1", state({ hovered: "s1" }))).toBe(true);
        expect(markersRevealed("s2", state({ hovered: "s1" }))).toBe(false);
    });

    it("hides everything when the pointer is nowhere", () => {
        expect(markersRevealed("s1", state())).toBe(false);
    });

    it("keeps a held section open even once the pointer has left it", () => {
        expect(markersRevealed("s1", state({ hovered: null, held: ["s1"] }))).toBe(true);
        expect(markersRevealed("s1", state({ hovered: "s2", held: ["s1"] }))).toBe(true);
    });

    it("reveals a second section without closing the held one", () => {
        const s = state({ hovered: "s2", held: ["s1"] });
        expect(markersRevealed("s1", s)).toBe(true);
        expect(markersRevealed("s2", s)).toBe(true);
    });

    // a hovered marker and an open thread hold independently: neither may cancel the other
    it("takes a hold from any of its sources, and none from an empty one", () => {
        expect(markersRevealed("s1", state({ held: [null, "s1"] }))).toBe(true);
        expect(markersRevealed("s1", state({ held: ["s1", null] }))).toBe(true);
        expect(markersRevealed("s1", state({ held: [null, null] }))).toBe(false);
    });

    it("shows every section on a tier with no hover to wait for", () => {
        expect(markersRevealed("s9", state({ hoverless: true }))).toBe(true);
    });
});

// Bands, not painted boxes: the markers sit in the margin beside a section, so the reveal has to
// cover the full width of the stack at that height.
describe("sectionAtY", () => {
    const tops = [0, 100, 260];
    const ids = ["s1", "s2", "s3"];

    it("names the section whose band contains the point", () => {
        expect(sectionAtY(tops, ids, 0, 400)).toBe("s1");
        expect(sectionAtY(tops, ids, 99, 400)).toBe("s1");
        expect(sectionAtY(tops, ids, 100, 400)).toBe("s2");
        expect(sectionAtY(tops, ids, 259, 400)).toBe("s2");
        expect(sectionAtY(tops, ids, 260, 400)).toBe("s3");
    });

    it("runs the last band to the bottom of the stage", () => {
        expect(sectionAtY(tops, ids, 399, 400)).toBe("s3");
        expect(sectionAtY(tops, ids, 400, 400)).toBeNull();
    });

    it("answers nothing above the first section or with nothing laid out", () => {
        expect(sectionAtY([10, 100], ids, 4, 400)).toBeNull();
        expect(sectionAtY([], [], 40, 400)).toBeNull();
    });

    it("tolerates an index the canvas has not published a top for yet", () => {
        expect(sectionAtY([0], ["s1", "s2"], 40, 400)).toBe("s1");
    });
});
