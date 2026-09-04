import { describe, expect, it } from "vitest";
import { frameWidthFor, hitRegion, outlineEditable, railMode } from "@app/views/generate/layout";

describe("frameWidthFor", () => {
    it("caps a deck at its reading width on a wide board", () => {
        expect(frameWidthFor(1600, "deck", "desktop")).toBe(1120);
    });

    it("lets web bleed past that cap", () => {
        expect(frameWidthFor(1600, "web", "desktop")).toBe(1552);
    });

    it("tracks the board once it is narrower than the cap", () => {
        expect(frameWidthFor(900, "deck", "desktop")).toBe(852);
    });

    it("keeps the desktop inset it has always used", () => {
        expect(frameWidthFor(1000, "web", "desktop")).toBe(952);
    });

    it("gives a phone most of its width back", () => {
        expect(frameWidthFor(390, "deck", "phone")).toBe(366);
    });

    it("floors low enough that a small phone does not overflow the board", () => {
        expect(frameWidthFor(320, "deck", "phone")).toBeLessThanOrEqual(320);
    });

    it("never returns a width the engine cannot lay out", () => {
        for (const tier of ["phone", "tablet", "desktop"] as const)
            expect(frameWidthFor(0, "deck", tier)).toBeGreaterThan(0);
    });

    it("treats an unknown format as the default profile", () => {
        expect(frameWidthFor(1600, "nope", "desktop")).toBe(frameWidthFor(1600, "deck", "desktop"));
    });
});

describe("railMode", () => {
    it("switches panes on a phone and sits beside the board elsewhere", () => {
        expect(railMode("phone")).toBe("switched");
        expect(railMode("tablet")).toBe("beside");
        expect(railMode("desktop")).toBe("beside");
    });
});

describe("hitRegion", () => {
    const box = (x: number, y: number, w: number, h: number) => ({ box: { x, y, w, h } });
    const outer = { ...box(0, 0, 400, 200), id: "outer" };
    const inner = { ...box(10, 10, 100, 20), id: "inner" };

    it("returns the smallest region containing the point", () => {
        expect(hitRegion([outer, inner], 20, 15)?.id).toBe("inner");
        expect(hitRegion([inner, outer], 20, 15)?.id).toBe("inner");
    });

    it("falls back to the containing region when no nested one matches", () => {
        expect(hitRegion([outer, inner], 300, 150)?.id).toBe("outer");
    });

    it("returns null outside every region", () => {
        expect(hitRegion([outer, inner], 500, 500)).toBeNull();
        expect(hitRegion([], 1, 1)).toBeNull();
    });

    it("counts the edges as inside, so a tap on a boundary still lands", () => {
        expect(hitRegion([inner], 10, 10)?.id).toBe("inner");
        expect(hitRegion([inner], 110, 30)?.id).toBe("inner");
    });
});

describe("outlineEditable", () => {
    it("stays true after the first write parks the run at 'writing'", () => {
        // buildSectionNow sets { stage: "writing", paused: true }, so runLocked stays false;
        // gating on stage === "outlined" is what hid the controls on every unwritten beat
        expect(outlineEditable("outlined", false)).toBe(true);
        expect(outlineEditable("writing", false)).toBe(true);
    });

    it("freezes while the queue is actually running", () => {
        expect(outlineEditable("writing", true)).toBe(false);
    });

    it("still allows writing a beat left unwritten at the end of a run", () => {
        expect(outlineEditable("done", false)).toBe(true);
    });

    it("is closed before an outline exists", () => {
        for (const s of ["idle", "intake", "planning", "error"]) {
            expect(outlineEditable(s, false)).toBe(false);
        }
    });
});
