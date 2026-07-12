import { describe, expect, it } from "vitest";
import type { Rect, RenderCommand } from "@engine/node";
import { fragment } from "@engine/layout";
import { near } from "@canvas/testkit";

// fragment() slices a tall flow of render commands into fixed-height pages: break at the lowest command
// bottom-edge inside the page that doesn't cut any command, hard-break only when a single block is taller
// than the page, and shift each page's commands to a local y = 0. Present + export both depend on this.

const rect = (id: string, y: number, h: number, clip?: Rect): RenderCommand => ({
    kind: "rect",
    box: { x: 0, y, w: 100, h },
    fill: { color: "#000" },
    id,
    ...(clip ? { clip } : {}),
});
const ids = (page: RenderCommand[]): string[] => page.map((c) => c.id ?? "");

describe("fragment — pagination", () => {
    it("returns a single page when the content fits (incl. the EPS boundary)", () => {
        const cmds = [rect("a", 0, 100), rect("b", 100, 50)]; // total 150
        expect(fragment(cmds, 150, 150)).toHaveLength(1);
        expect(fragment(cmds, 150, 149.6)).toHaveLength(1); // within the 0.5px EPS
    });

    it("returns a single page when pageHeight <= 0", () => {
        expect(fragment([rect("a", 0, 100)], 100, 0)).toHaveLength(1);
    });

    it("breaks cleanly between blocks and shifts each page to y = 0", () => {
        const cmds = [rect("a", 0, 100), rect("b", 100, 100), rect("c", 200, 100)]; // total 300
        const pages = fragment(cmds, 300, 150);
        expect(pages).toHaveLength(3);
        expect(ids(pages[0]!)).toEqual(["a"]);
        expect(ids(pages[1]!)).toEqual(["b"]);
        expect(ids(pages[2]!)).toEqual(["c"]);
        near(pages[1]![0]!.box.y, 0); // page-local origin
        near(pages[2]![0]!.box.y, 0);
    });

    it("pushes the break up so a block is never split when it can be avoided", () => {
        const cmds = [rect("header", 0, 20), rect("tall", 20, 200)]; // total 220
        const pages = fragment(cmds, 220, 100);
        expect(ids(pages[0]!)).toEqual(["header"]); // break at 20, not mid-'tall'
    });

    it("hard-breaks a block taller than a full page", () => {
        const pages = fragment([rect("giant", 0, 250)], 250, 100); // 2.5 pages tall
        expect(pages.length).toBeGreaterThan(1); // unavoidable split
    });

    it("shifts a clipped command's clip.y alongside its box.y", () => {
        const cmds = [rect("a", 0, 90), rect("b", 100, 50, { x: 10, y: 100, w: 80, h: 50 })];
        const pages = fragment(cmds, 150, 95);
        const b = pages[1]!.find((c) => c.id === "b")!;
        near(b.box.y, 5); // 100 − 95
        near(b.clip!.y, 5); // clip tracks the box
        near(b.clip!.x, 10); // unshifted axis preserved
    });

    it("terminates and covers a tall stack", () => {
        const cmds = Array.from({ length: 10 }, (_, i) => rect(`b${i}`, i * 50, 50));
        expect(fragment(cmds, 500, 50)).toHaveLength(10);
    });
});
