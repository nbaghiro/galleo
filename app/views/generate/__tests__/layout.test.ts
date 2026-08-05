import { describe, expect, it } from "vitest";
import { frameWidthFor, railMode } from "../layout";

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
