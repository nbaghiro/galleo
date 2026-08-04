import { describe, expect, it } from "vitest";
import type { Section } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { estimateSectionHeight, OVERSCAN, stackWindow, windowMoved } from "@canvas/render/window";

const bare = (over: Partial<Section> = {}): Section => ({
    id: "s1",
    root: { type: "group", data: { children: [] } },
    ...over,
});

describe("stackWindow", () => {
    it("brackets the viewport with overscan on both sides", () => {
        expect(stackWindow(1000, 800, 1)).toEqual({ top: 200, bottom: 2600 });
    });

    it("reaches above the document at the top rather than clamping the band", () => {
        const w = stackWindow(0, 800);
        expect(w.top).toBe(-800 * OVERSCAN);
        expect(w.bottom).toBe(800 + 800 * OVERSCAN);
    });

    it("degenerates safely for a zero-height viewport", () => {
        expect(stackWindow(500, 0)).toEqual({ top: 500, bottom: 500 });
    });
});

describe("windowMoved", () => {
    const w = stackWindow(1000, 900);
    it("always repaints when there is no previous window", () => {
        expect(windowMoved(null, w, 900)).toBe(true);
    });
    it("ignores a scroll shorter than a third of the viewport", () => {
        expect(windowMoved(w, stackWindow(1100, 900), 900)).toBe(false);
    });
    it("repaints once the band has really moved", () => {
        expect(windowMoved(w, stackWindow(1400, 900), 900)).toBe(true);
    });
    it("keeps a floor so a tiny viewport still settles", () => {
        expect(windowMoved(stackWindow(0, 10), stackWindow(50, 10), 10)).toBe(false);
        expect(windowMoved(stackWindow(0, 10), stackWindow(200, 10), 10)).toBe(true);
    });
});

describe("estimateSectionHeight", () => {
    it("uses the slide frame for a paged format, ignoring byte size", () => {
        const deck = resolveProfile("deck");
        const h = estimateSectionHeight(bare(), deck, 1000, 50_000);
        // 16:9 at the section's laid-out width
        expect(h).toBeGreaterThan(400);
        expect(h).toBeLessThan(700);
        expect(estimateSectionHeight(bare(), deck, 1000, 100)).toBe(h);
    });

    it("respects a section's own aspect override", () => {
        const deck = resolveProfile("deck");
        const tall = estimateSectionHeight(bare({ frame: { aspect: 0.5 } }), deck, 1000);
        expect(tall).toBeGreaterThan(estimateSectionHeight(bare(), deck, 1000));
    });

    it("grows with byte size for continuous formats, inside a clamp", () => {
        const doc = resolveProfile("doc");
        const small = estimateSectionHeight(bare(), doc, 1000, 500);
        const big = estimateSectionHeight(bare(), doc, 1000, 8_000);
        expect(big).toBeGreaterThan(small);
        expect(small).toBeGreaterThanOrEqual(220);
        expect(estimateSectionHeight(bare(), doc, 1000, 10_000_000)).toBeLessThanOrEqual(1600);
    });

    it("falls back to a body-sized block when the size is unknown", () => {
        expect(estimateSectionHeight(bare(), resolveProfile("doc"), 1000)).toBe(260);
    });
});
