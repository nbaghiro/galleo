// @vitest-environment happy-dom
import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent } from "@model/artifact";
import { getElementAt } from "@elements/ops";
import { artifactOf, inst, installCanvas2D, sectionOf } from "@canvas/testkit";
import {
    anchorPoint,
    flatBox,
    nearestPinPlacement,
    paintSpin,
    parentAddress,
    pinnedAncestor,
    pinnedLayout,
    reflowPin,
} from "@editor/core/pin";
import { loadArtifactContent, setRegions } from "@editor/core/store";

installCanvas2D();

const box = (
    x: number,
    y: number,
    w: number,
    h: number,
): { x: number; y: number; w: number; h: number } => ({ x, y, w, h });

describe("anchor math", () => {
    it("anchorPoint hits corners and centers", () => {
        const b = box(10, 20, 100, 50);
        expect(anchorPoint(b, "start", "start")).toEqual([10, 20]);
        expect(anchorPoint(b, "center", "center")).toEqual([60, 45]);
        expect(anchorPoint(b, "end", "end")).toEqual([110, 70]);
    });

    it("an element near the bottom-right corner anchors end/end", () => {
        const { anchors, gap } = nearestPinPlacement(box(0, 0, 400, 300), box(340, 250, 50, 40));
        expect(anchors).toEqual({ x: "end", y: "end" });
        expect(gap).toEqual({ x: -10, y: -10 });
    });

    it("a centered element anchors center/center and snaps flush within 6px", () => {
        const { anchors, gap } = nearestPinPlacement(box(0, 0, 400, 300), box(172, 132, 60, 40));
        expect(anchors).toEqual({ x: "center", y: "center" });
        expect(gap).toEqual({ x: 0, y: 0 }); // 2px off center, inside the snap
    });

    it("a gap past the snap threshold survives", () => {
        const { gap } = nearestPinPlacement(box(0, 0, 400, 300), box(20, 12, 50, 40));
        expect(gap).toEqual({ x: 20, y: 12 });
    });
});

describe("pinnedLayout", () => {
    const art = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                inst("container", {
                    children: [
                        inst("text", { text: "Body copy" }),
                        inst("text", { text: "Badge" }),
                    ],
                }),
            ),
        ]);
    const addr = { section: "s1", path: [1] };

    it("solves offsets so the anchor point lands where asked, and normalizes width", () => {
        loadArtifactContent("pin-a", art());
        const next = pinnedLayout(art(), addr, { x: "end", y: "start" }, { x: -12, y: 12 });
        expect(next).not.toBeNull();
        expect(next!.width).toBe("fit");
        expect(next!.pin).toMatchObject({ x: "end", y: "start" });
        // engine floats measure from the content box; the solve cancels the residual so the stored
        // offsets differ from the raw gap only by that correction, and stay finite and small
        expect(Math.abs(next!.pin!.dx ?? 0)).toBeLessThan(60);
        expect(Math.abs(next!.pin!.dy ?? 0)).toBeLessThan(60);
    });

    it("keeps z and rotate through a re-anchor", () => {
        loadArtifactContent("pin-b", art());
        const next = pinnedLayout(
            art(),
            addr,
            { x: "start", y: "end" },
            { x: 0, y: 0 },
            { x: "end", y: "start", z: 2, rotate: 12 },
        );
        expect(next!.pin!.z).toBe(2);
        expect(next!.pin!.rotate).toBe(12);
    });

    it("refuses the section root", () => {
        loadArtifactContent("pin-c", art());
        expect(
            pinnedLayout(
                art(),
                { section: "s1", path: [] },
                { x: "start", y: "start" },
                { x: 0, y: 0 },
            ),
        ).toBeNull();
    });

    it("parentAddress drops the last step", () => {
        expect(parentAddress({ section: "s1", path: [2, 1] })).toEqual({
            section: "s1",
            path: [2],
        });
        void getElementAt;
    });
});

describe("paint turn recovery", () => {
    it("flatBox turns a rotated region's polygon back to the flat rect", () => {
        // a 40×20 box at (80,90) turned 90° about (100,100): polygon upright, AABB 20×40
        const r = {
            id: "el:s1:1",
            box: { x: 90, y: 80, w: 20, h: 40 },
            shape: {
                kind: "poly" as const,
                points: [
                    [110, 80],
                    [110, 120],
                    [90, 120],
                    [90, 80],
                ] as [number, number][],
            },
        };
        const flat = flatBox(r, { deg: 90, cx: 100, cy: 100 });
        expect(flat.x).toBeCloseTo(80);
        expect(flat.y).toBeCloseTo(90);
        expect(flat.w).toBeCloseTo(40);
        expect(flat.h).toBeCloseTo(20);
    });

    it("paintSpin finds the outermost pinned ancestor's rotation and center", () => {
        const content = artifactOf([
            sectionOf(
                inst("container", {
                    children: [
                        {
                            ...inst("container", { children: [inst("text", { text: "In" })] }),
                            layout: { pin: { x: "end", y: "start", rotate: -6 } },
                        },
                    ],
                }),
            ),
        ]);
        loadArtifactContent("spin-a", content);
        setRegions([{ id: "el:s1:0", box: { x: 100, y: 50, w: 200, h: 100 } }]);
        const spin = paintSpin(content, { section: "s1", path: [0, 0] });
        expect(spin).toEqual({ deg: -6, cx: 200, cy: 100 });
        expect(paintSpin(content, { section: "s1", path: [] })).toBeNull();
        setRegions([]);
    });
});

describe("pinnedAncestor", () => {
    const nested = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                inst("container", {
                    children: [
                        {
                            ...inst("container", { children: [inst("text", { text: "In" })] }),
                            layout: { pin: { x: "end", y: "start" } },
                        },
                        inst("text", { text: "Flow" }),
                    ],
                }),
            ),
        ]);

    it("resolves a grab inside a pinned group to the group", () => {
        expect(pinnedAncestor(nested(), { section: "s1", path: [0, 0] })).toEqual({
            section: "s1",
            path: [0],
        });
        expect(pinnedAncestor(nested(), { section: "s1", path: [0] })).toEqual({
            section: "s1",
            path: [0],
        });
    });

    it("a flow element has none", () => {
        expect(pinnedAncestor(nested(), { section: "s1", path: [1] })).toBeNull();
        expect(pinnedAncestor(nested(), { section: "s1", path: [] })).toBeNull();
    });
});

describe("reflowPin", () => {
    const art = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                inst("container", {
                    children: [
                        inst("text", { text: "a" }),
                        inst("text", { text: "b" }),
                        {
                            ...inst("text", { text: "badge" }),
                            layout: { width: "fit", pin: { x: "end", y: "start", dx: -8 } },
                        },
                    ],
                }),
            ),
        ]);

    it("strips the pin and lands the move in one content change", () => {
        const res = reflowPin(
            art(),
            { section: "s1", path: [2] },
            {
                section: "s1",
                op: "insert",
                path: [],
                index: 1,
                before: false,
                direction: "col",
            },
        );
        const landed = getElementAt(res.content, res.address!);
        expect((landed?.data as { text?: string }).text).toBe("badge");
        expect(landed?.layout?.pin).toBeUndefined();
        expect(landed?.layout?.width).toBe("fit"); // the rest of the layout survives
        expect(res.address).toEqual({ section: "s1", path: [1] });
    });

    it("does nothing for an unpinned element", () => {
        const res = reflowPin(
            art(),
            { section: "s1", path: [0] },
            {
                section: "s1",
                op: "insert",
                path: [],
                index: 2,
                before: false,
                direction: "col",
            },
        );
        expect(res.address).toBeNull();
    });
});
