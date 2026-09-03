import { describe, expect, it } from "vitest";
import type { Rect, RenderCommand } from "@engine/node";
import { fragment } from "@engine/layout";
import { near } from "@canvas/testkit";

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

    it("shifts a rotated command's pivot alongside its box", () => {
        const cmds = [
            rect("a", 0, 90),
            { ...rect("b", 100, 50), rotate: { deg: 15, cx: 40, cy: 125 } },
        ];
        // b's turned corner rises above the 95 limit, so the clean break lands at a's bottom (90)
        const pages = fragment(cmds, 150, 95);
        const b = pages[1]!.find((c) => c.id === "b")!;
        near(b.box.y, 10); // 100 − 90
        near(b.rotate!.cy, 35); // 125 − 90: the pivot rides the page shift
        near(b.rotate!.cx, 40); // unshifted axis preserved
    });

    it("terminates and covers a tall stack", () => {
        const cmds = Array.from({ length: 10 }, (_, i) => rect(`b${i}`, i * 50, 50));
        expect(fragment(cmds, 500, 50)).toHaveLength(10);
    });
});

describe("fragment — paint order and rotation", () => {
    it("keeps emit order (z-order) within a page, whatever the y sort said", () => {
        // emit order: decoration UNDER the text it overlaps; the text starts higher on the page
        const cmds = [rect("under", 150, 100), rect("text", 100, 180), rect("below", 350, 150)];
        const pages = fragment(cmds, 500, 300);
        const first = ids(pages[0]!);
        expect(first.indexOf("under")).toBeLessThan(first.indexOf("text"));
    });

    it("a rotated command whose turned corner dips past the break reaches the next page", () => {
        const spun: RenderCommand = {
            kind: "rect",
            box: { x: 0, y: 180, w: 100, h: 40 }, // flat bottom 220
            fill: { color: "#000" },
            id: "spun",
            rotate: { deg: 45, cx: 50, cy: 200 }, // turned extent ≈ 146..254
        };
        const cmds = [rect("a", 0, 240), spun, rect("filler", 300, 200)];
        const pages = fragment(cmds, 500, 240);
        expect(ids(pages[1]!)).toContain("spun");
    });

    it("a flat crosser whose turned extent clears the break does not force a split", () => {
        const thin: RenderCommand = {
            kind: "rect",
            box: { x: 0, y: 140, w: 20, h: 160 }, // flat 140..300 crosses 240
            fill: { color: "#000" },
            id: "thin",
            rotate: { deg: 90, cx: 10, cy: 220 }, // turned extent 210..230, clear of 240
        };
        const cmds = [rect("a", 0, 240), thin, rect("filler", 300, 200)];
        const pages = fragment(cmds, 500, 240);
        expect(ids(pages[1]!)).not.toContain("thin");
    });
});
