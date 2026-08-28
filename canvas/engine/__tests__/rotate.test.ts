import { describe, expect, it } from "vitest";
import type { EngineNode, Region, RenderCommand } from "@engine/node";
import { inRegion } from "@engine/node";
import { fixed } from "@model/geometry";
import { boxNode, colNode, near, runLayout } from "@canvas/testkit";

const run = (n: EngineNode, w = 200, h = 200): { commands: RenderCommand[]; regions: Region[] } =>
    runLayout(n, w, h);

// a 40×20 box floated to the parent's center, spun 90°
const spun = (deg = 90, children?: EngineNode[]): EngineNode =>
    colNode([
        {
            id: "el",
            w: fixed(40),
            h: fixed(20),
            float: { x: "center", y: "center" },
            rotate: deg,
            fill: { color: "#111" },
            children,
        },
    ]);

describe("rotation through emit", () => {
    it("the command carries the spin about the node's own center", () => {
        const { commands } = run(spun());
        const c = commands.find((k) => k.id === "el")!;
        expect(c.rotate).toEqual({ deg: 90, cx: 100, cy: 100 });
    });

    it("descendants inherit the ancestor's center, so the group turns as one", () => {
        const { commands } = run(spun(45, [boxNode("child", fixed(10), fixed(10))]));
        const child = commands.find((k) => k.id === "child")!;
        expect(child.rotate).toEqual({ deg: 45, cx: 100, cy: 100 });
    });

    it("an unrotated sibling stays flat", () => {
        const { commands } = run(
            colNode([
                { ...boxNode("flat", fixed(40), fixed(20)) },
                {
                    ...boxNode("el", fixed(40), fixed(20)),
                    float: { x: "start", y: "start" },
                    rotate: 30,
                },
            ]),
        );
        expect(commands.find((k) => k.id === "flat")!.rotate).toBeUndefined();
    });

    it("the region becomes the turned polygon inside its bounding box", () => {
        const { regions } = run(spun());
        const r = regions.find((k) => k.id === "el")!;
        // 40×20 at center (100,100) turned 90° = a 20×40 upright box
        near(r.box.x, 90);
        near(r.box.y, 80);
        near(r.box.w, 20);
        near(r.box.h, 40);
        expect(r.shape?.kind).toBe("poly");
        expect(inRegion(r, 100, 115)).toBe(true); // inside the upright box
        expect(inRegion(r, 115, 100)).toBe(false); // inside the flat box, outside the turned one
    });

    it("a 45° region's polygon rejects the bounding-box corner", () => {
        const { regions } = run(spun(45));
        const r = regions.find((k) => k.id === "el")!;
        expect(inRegion(r, 100, 100)).toBe(true);
        expect(inRegion(r, r.box.x + 1, r.box.y + 1)).toBe(false);
    });
});
