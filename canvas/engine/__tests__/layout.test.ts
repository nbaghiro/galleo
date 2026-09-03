import { describe, expect, it } from "vitest";
import type { EngineNode, Region, RenderCommand } from "@engine/node";
import { inRegion } from "@engine/node";
import { fit, fixed, grow, percent } from "@model/geometry";
import {
    boxNode,
    boxOf,
    colNode,
    commandById,
    commandsFor,
    near,
    regionById,
    rowNode,
    runLayout,
    textNode,
} from "@canvas/testkit";

const reg = (n: EngineNode, w = 200, h = 200): Region[] => runLayout(n, w, h).regions;
const cmds = (n: EngineNode, w = 200, h = 200): RenderCommand[] => runLayout(n, w, h).commands;

describe("distribute — grow/shrink sizing", () => {
    it("two grow columns split the row evenly", () => {
        const r = reg(rowNode([boxNode("a", grow(), grow()), boxNode("b", grow(), grow())]));
        near(boxOf(r, "a").w, 100);
        near(boxOf(r, "b").w, 100);
    });

    it("percent + gap resolve against the space after the gap (60/40 of 180)", () => {
        const r = reg(
            rowNode([boxNode("a", percent(0.6), grow()), boxNode("b", percent(0.4), grow())], {
                gap: 20,
            }),
        );
        near(boxOf(r, "a").w, 108);
        near(boxOf(r, "b").w, 72);
        near(boxOf(r, "b").x + boxOf(r, "b").w, 200); // right edge lands on the container
    });

    it("fit columns wider than the row shrink to fit (160 → 50 each)", () => {
        const t = (id: string): EngineNode => textNode("x".repeat(20), { id, w: fit(), h: grow() });
        const r = reg(rowNode([t("a"), t("b")], { w: fixed(100) }), 100);
        near(boxOf(r, "a").w, 50);
        near(boxOf(r, "b").w, 50);
    });

    it("fit shrinks only to its min floor; the excess overflows", () => {
        const t = (id: string): EngineNode =>
            textNode("x".repeat(20), { id, w: fit(40), h: grow() });
        const r = reg(rowNode([t("a"), t("b")], { w: fixed(60) }), 60);
        near(boxOf(r, "a").w, 40); // clamped at min, not shrunk further
        near(boxOf(r, "b").w, 40);
    });

    it("grow max caps a column; the remainder goes to the sibling", () => {
        const r = reg(
            rowNode([boxNode("a", grow(undefined, 50), grow()), boxNode("b", grow(), grow())]),
        );
        near(boxOf(r, "a").w, 50);
        near(boxOf(r, "b").w, 150);
    });

    it("grow leaves surplus unused when every child is capped", () => {
        const r = reg(
            rowNode([
                boxNode("a", grow(undefined, 50), grow()),
                boxNode("b", grow(undefined, 50), grow()),
            ]),
        );
        near(boxOf(r, "a").w, 50); // both cap at 50; the leftover 100px is simply unfilled
        near(boxOf(r, "b").w, 50);
    });

    it("grow min floors a column even when space is tight", () => {
        const r = reg(
            rowNode([boxNode("a", grow(120), grow()), boxNode("b", grow(), grow())], {
                w: fixed(150),
            }),
            150,
        );
        expect(boxOf(r, "a").w).toBeGreaterThanOrEqual(119);
        near(boxOf(r, "a").w + boxOf(r, "b").w, 150);
    });

    it("fixed columns never shrink (they overflow rather than compress)", () => {
        const r = reg(
            rowNode([boxNode("a", fixed(100), grow()), boxNode("b", fixed(100), grow())], {
                w: fixed(150),
            }),
            150,
        );
        near(boxOf(r, "a").w, 100);
        near(boxOf(r, "b").w, 100);
    });

    it("column heights: a grow child fills the leftover under a fixed one", () => {
        const c = colNode([boxNode("a", grow(), fixed(50)), boxNode("b", grow(), grow())]);
        near(boxOf(reg(c), "b").h, 150);
    });
});

describe("intrinsic (fit) width", () => {
    it("a fit row = padding + gaps + sum of child widths", () => {
        const fitRow = rowNode(
            [boxNode("x1", fixed(50), fixed(20)), boxNode("x2", fixed(30), fixed(20))],
            {
                id: "fitrow",
                w: fit(),
                gap: 10,
            },
        );
        const r = reg(rowNode([fitRow], { w: fixed(400) }), 400);
        near(boxOf(r, "fitrow").w, 90); // 50 + 30 + one 10px gap
    });

    it("percent/grow children contribute 0 to intrinsic width", () => {
        const fitRow = rowNode(
            [boxNode("g", grow(), fixed(20)), boxNode("f", fixed(40), fixed(20))],
            {
                id: "fitrow",
                w: fit(),
            },
        );
        near(boxOf(reg(rowNode([fitRow], { w: fixed(400) }), 400), "fitrow").w, 40);
    });

    it("a fit column takes the widest child, not the sum", () => {
        const fitCol = colNode(
            [boxNode("c1", fixed(50), fixed(20)), boxNode("c2", fixed(80), fixed(20))],
            {
                id: "fitcol",
                w: fit(),
            },
        );
        near(boxOf(reg(rowNode([fitCol], { w: fixed(400) }), 400), "fitcol").w, 80);
    });

    it("a childless, textless leaf has intrinsic width 0", () => {
        const empty = boxNode("empty", fit(), fixed(10));
        near(boxOf(reg(rowNode([empty], { w: fixed(400) }), 400), "empty").w, 0);
    });
});

describe("cross-axis width (column children)", () => {
    it("percent is a fraction of the content width", () => {
        near(boxOf(reg(colNode([boxNode("p", percent(0.5), fixed(20))])), "p").w, 100);
    });
    it("grow fills the content width", () => {
        near(boxOf(reg(colNode([boxNode("g", grow(), fixed(20))])), "g").w, 200);
    });
    it("fit clamps to the content width when the content is wider", () => {
        near(boxOf(reg(colNode([textNode("x".repeat(50), { id: "t" })])), "t").w, 200);
    });
});

describe("aspect", () => {
    it("resolves height from width/aspect and clips its children", () => {
        const frame: EngineNode = {
            id: "frame",
            w: fixed(200),
            h: fit(),
            aspect: 2,
            fill: { color: "#000" },
            children: [boxNode("inner", fixed(400), fixed(400))],
        };
        const { regions, commands } = runLayout(frame, 200, 500);
        near(boxOf(regions, "frame").h, 100); // 200 / 2
        const clip = commandById(commands, "inner").clip;
        expect(clip).toBeDefined();
        near(clip!.w, 200);
        near(clip!.h, 100);
    });
});

describe("clip", () => {
    const clipParent = (): EngineNode => ({
        w: fixed(100),
        h: fixed(60),
        clip: { x: true, y: true },
        fill: { color: "#000" },
        children: [{ id: "child", w: fixed(200), h: fixed(200), fill: { color: "#f00" } }],
    });

    it("an overflowing child carries the clipping container's box as its clip rect", () => {
        const clip = commandById(cmds(clipParent(), 100, 60), "child").clip;
        expect(clip).toBeDefined();
        near(clip!.x, 0);
        near(clip!.y, 0);
        near(clip!.w, 100);
        near(clip!.h, 60);
    });

    it("the clipping node's own paint stays unclipped", () => {
        const own = cmds(clipParent(), 100, 60).find(
            (c) => c.kind === "rect" && Math.abs(c.box.w - 100) <= 1 && !c.id,
        );
        expect(own?.clip).toBeUndefined();
    });

    it("a bounded (fixed-height) column crops content taller than its frame", () => {
        const col: EngineNode = {
            w: fixed(100),
            h: fixed(50),
            direction: "col",
            children: [{ id: "tall", w: grow(), h: fixed(200), fill: { color: "#000" } }],
        };
        const clip = commandById(cmds(col, 100, 50), "tall").clip;
        expect(clip).toBeDefined();
        near(clip!.y, 0);
        near(clip!.h, 50);
    });

    it("nested clips intersect — the smaller ancestor box wins", () => {
        const tree: EngineNode = {
            w: fixed(100),
            h: fixed(100),
            clip: { x: true, y: true },
            direction: "col",
            children: [
                {
                    id: "inner",
                    w: fixed(200),
                    h: fixed(200),
                    clip: { x: true, y: true },
                    children: [boxNode("gc", fixed(300), fixed(300))],
                },
            ],
        };
        const clip = commandById(cmds(tree, 100, 100), "gc").clip;
        expect(clip).toBeDefined();
        near(clip!.w, 100); // 100∩200 = 100, not the inner 200
        near(clip!.h, 100);
    });

    it("merges an explicit-x clip with an inferred overflow-y clip", () => {
        const col: EngineNode = {
            w: fixed(100),
            h: fixed(50),
            clip: { x: true },
            direction: "col",
            children: [{ id: "tall", w: grow(), h: fixed(200), fill: { color: "#000" } }],
        };
        const clip = commandById(cmds(col, 100, 50), "tall").clip;
        expect(clip).toBeDefined();
        near(clip!.w, 100); // explicit x survives the merge (else this would be ~CLIP_INF)
        near(clip!.h, 50); // inferred y from the overflow
    });
});

describe("positioning & alignment", () => {
    it("alignY center centers the flow in the cross box", () => {
        const c = colNode([boxNode("c", fixed(100), fixed(50))], { alignY: "center" });
        near(boxOf(reg(c), "c").y, 75); // (200 - 50) / 2
    });
    it("alignY end pins the flow to the far edge", () => {
        const c = colNode([boxNode("c", fixed(100), fixed(50))], { alignY: "end" });
        near(boxOf(reg(c), "c").y, 150);
    });
    it("alignSelf overrides the parent's cross alignment for one child", () => {
        const c = colNode([boxNode("c", fixed(50), fixed(50), { alignSelf: "end" })], {
            alignX: "start",
        });
        near(boxOf(reg(c), "c").x, 150);
    });
});

describe("image intrinsic width", () => {
    const framed = (image: EngineNode["image"]): Region[] =>
        reg(colNode([{ id: "img", w: fit(), h: fixed(50), image }]));

    it("an image leaf fits to its natural width", () => {
        near(
            boxOf(framed({ src: "a.png", fit: "cover", natural: { w: 120, h: 60 } }), "img").w,
            120,
        );
    });

    it("a natural width wider than the row shrinks to the row", () => {
        near(
            boxOf(framed({ src: "a.png", fit: "cover", natural: { w: 900, h: 60 } }), "img").w,
            200,
        );
    });

    it("without a natural size an image still measures 0, as before", () => {
        near(boxOf(framed({ src: "a.png", fit: "cover" }), "img").w, 0);
    });

    it("a natural width feeds the fit clamp", () => {
        const r = reg(
            colNode([
                {
                    id: "img",
                    w: fit(0, 80),
                    h: fixed(50),
                    image: { src: "a.png", fit: "cover", natural: { w: 300, h: 100 } },
                },
            ]),
        );
        near(boxOf(r, "img").w, 80);
    });
});

describe("main-axis distribution", () => {
    // three 20px boxes in a 200px row: 140px of leftover to spread
    const row = (over?: Partial<EngineNode>): Region[] =>
        reg(
            rowNode(
                ["a", "b", "c"].map((id) => boxNode(id, fixed(20), fixed(20))),
                over,
            ),
        );
    const col = (over?: Partial<EngineNode>): Region[] =>
        reg(
            colNode(
                ["a", "b", "c"].map((id) => boxNode(id, fixed(20), fixed(20))),
                over,
            ),
        );

    it("between pins the ends and splits the leftover into the gaps", () => {
        const r = row({ distribute: "between" });
        near(boxOf(r, "a").x, 0);
        near(boxOf(r, "b").x, 90); // 20 + 70
        near(boxOf(r, "c").x + boxOf(r, "c").w, 200);
    });

    it("around gives each child half a share at each side", () => {
        const r = row({ distribute: "around" });
        near(boxOf(r, "a").x, 140 / 6); // half of 140/3
        near(boxOf(r, "b").x, 140 / 6 + 20 + 140 / 3);
    });

    it("evenly makes the four gaps equal", () => {
        const r = row({ distribute: "evenly" });
        const g = 140 / 4;
        near(boxOf(r, "a").x, g);
        near(boxOf(r, "b").x, g * 2 + 20);
        near(200 - (boxOf(r, "c").x + boxOf(r, "c").w), g);
    });

    it("overrides the main-axis alignment it replaces", () => {
        near(boxOf(row({ distribute: "between", alignX: "center" }), "a").x, 0);
    });

    it("works down the main axis of a column too", () => {
        const c = col({ distribute: "between" });
        near(boxOf(c, "a").y, 0);
        near(boxOf(c, "b").y, 90);
        near(boxOf(c, "c").y + boxOf(c, "c").h, 200);
    });

    it("adds to the gap rather than replacing it", () => {
        const r = row({ distribute: "between", gap: 10 });
        near(boxOf(r, "b").x, 20 + 10 + 120 / 2);
    });

    it("a fit main axis has no leftover, so it distributes nothing", () => {
        const fitRow = rowNode(
            ["a", "b"].map((id) => boxNode(id, fixed(20), fixed(20))),
            { w: fit(), distribute: "between" },
        );
        near(boxOf(reg(colNode([fitRow])), "b").x, 20);
    });

    it("a single child under between stays at the start", () => {
        const r = reg(
            rowNode([boxNode("a", fixed(20), fixed(20))], {
                distribute: "between",
                alignX: "center",
            }),
        );
        near(boxOf(r, "a").x, 0);
    });

    it("floats keep aligning to their own edge", () => {
        const r = reg(
            rowNode(
                [
                    boxNode("a", fixed(20), fixed(20)),
                    boxNode("b", fixed(20), fixed(20)),
                    boxNode("f", fixed(20), fixed(20), { float: { x: "center", y: "start" } }),
                ],
                { distribute: "between" },
            ),
        );
        near(boxOf(r, "f").x, 90); // (200 - 20) / 2, untouched by the spread
        near(boxOf(r, "b").x, 180);
    });
});

describe("emit — flatten to commands + regions", () => {
    it("opacity multiplies down the subtree", () => {
        const tree = colNode([boxNode("c", fixed(100), fixed(100), { opacity: 0.5 })], {
            opacity: 0.5,
            fill: { color: "#000" },
            id: "p",
        });
        const out = cmds(tree);
        expect(commandById(out, "p").opacity).toBeCloseTo(0.5, 5);
        expect(commandById(out, "c").opacity).toBeCloseTo(0.25, 5); // 0.5 × 0.5
    });

    it("opacity is absent (not 1) on a fully-opaque node", () => {
        expect(commandById(cmds(boxNode("c", fixed(50), fixed(50))), "c").opacity).toBeUndefined();
    });

    it("a node with an id produces a region carrying its painted radius", () => {
        const tree = boxNode("c", fixed(50), fixed(50), { fill: { color: "#000", radius: 8 } });
        expect(regionById(reg(tree), "c").radius).toBe(8);
    });

    it("paints a node's fill before its text", () => {
        const tree: EngineNode = {
            id: "c",
            w: fixed(100),
            h: fixed(40),
            fill: { color: "#000" },
            text: { text: "hi", fontId: "f", size: 12, wrap: "none" },
        };
        const own = commandsFor(cmds(tree), "c");
        expect(own[0]?.kind).toBe("rect");
        expect(own[1]?.kind).toBe("text");
    });

    it("emits an image command and carries the image radius onto the region", () => {
        const tree: EngineNode = {
            id: "img",
            w: fixed(100),
            h: fixed(80),
            image: { src: "x.png", fit: "cover", radius: 12 },
        };
        const out = runLayout(tree, 100, 80);
        expect(commandById(out.commands, "img").kind).toBe("image");
        expect(regionById(out.regions, "img").radius).toBe(12);
    });

    it("emits a surface command for a self-painted node", () => {
        const tree: EngineNode = {
            id: "surf",
            w: fixed(100),
            h: fixed(80),
            surface: { paint: () => {} },
        };
        expect(commandById(cmds(tree), "surf").kind).toBe("surface");
    });
});

describe("floating", () => {
    it("negative-z floats paint under the flow; non-negative above it", () => {
        const node: EngineNode = {
            w: fixed(100),
            h: fixed(100),
            children: [
                {
                    w: fixed(10),
                    h: fixed(10),
                    fill: { color: "#under" },
                    float: { x: "start", y: "start", z: -1 },
                },
                { w: fixed(10), h: fixed(10), fill: { color: "#flow" } },
                {
                    w: fixed(10),
                    h: fixed(10),
                    fill: { color: "#over" },
                    float: { x: "end", y: "end", z: 1 },
                },
            ],
        };
        const { commands } = runLayout(node, 100, 100);
        const order = commands
            .filter((c) => c.kind === "rect" && c.fill?.color?.startsWith("#"))
            .map((c) => (c.kind === "rect" ? c.fill?.color : ""));
        expect(order.indexOf("#under")).toBeLessThan(order.indexOf("#flow"));
        expect(order.indexOf("#flow")).toBeLessThan(order.indexOf("#over"));
    });

    const withBadge = (): EngineNode => ({
        w: fixed(200),
        h: fixed(100),
        direction: "col",
        children: [
            boxNode("body", grow(), grow()),
            boxNode("badge", fixed(40), fixed(20), { float: { x: "end", y: "end" } }),
        ],
    });

    it("a float does not consume flow space", () => {
        const r = reg(withBadge(), 200, 100);
        near(boxOf(r, "body").w, 200);
        near(boxOf(r, "body").h, 100);
    });

    it("a float in a row is lifted out of the row's flow (takes no column)", () => {
        const tree: EngineNode = {
            w: fixed(200),
            h: fixed(100),
            direction: "row",
            children: [
                boxNode("body", grow(), grow()),
                boxNode("badge", fixed(40), fixed(20), { float: { x: "end", y: "start" } }),
            ],
        };
        near(boxOf(reg(tree, 200, 100), "body").w, 200);
    });

    it("a float aligns to its edge of the content box (bottom-right)", () => {
        const badge = boxOf(reg(withBadge(), 200, 100), "badge");
        near(badge.x + badge.w, 200);
        near(badge.y + badge.h, 100);
    });

    it("a float paints after (on top of) the flow", () => {
        const out = cmds(withBadge(), 200, 100);
        expect(out.findIndex((c) => c.id === "badge")).toBeGreaterThan(
            out.findIndex((c) => c.id === "body"),
        );
    });

    it("multiple floats paint in ascending z order", () => {
        const tree: EngineNode = {
            w: fixed(200),
            h: fixed(100),
            direction: "col",
            children: [
                boxNode("body", grow(), grow()),
                boxNode("fa", fixed(10), fixed(10), { float: { x: "end", y: "end", z: 2 } }),
                boxNode("fb", fixed(10), fixed(10), { float: { x: "start", y: "start", z: 0 } }),
                boxNode("fc", fixed(10), fixed(10), { float: { x: "center", y: "center", z: 1 } }),
            ],
        };
        const out = cmds(tree, 200, 100);
        const at = (id: string): number => out.findIndex((c) => c.id === id);
        expect(at("fb")).toBeLessThan(at("fc")); // z0 < z1
        expect(at("fc")).toBeLessThan(at("fa")); // z1 < z2
    });
});

describe("surface regions", () => {
    const marks: EngineNode = {
        id: "chart",
        w: fixed(100),
        h: fixed(60),
        surface: {
            paint: () => {},
            regions: (box) => [
                { id: "datum:chart:0", box: { x: 4, y: 4, w: 10, h: box.h - 8 } },
                {
                    id: "datum:chart:1",
                    box: { x: 20, y: 0, w: 20, h: 20 },
                    shape: {
                        kind: "poly",
                        points: [
                            [20, 0],
                            [40, 0],
                            [30, 20],
                        ],
                    },
                },
            ],
        },
    };

    it("offsets what the surface reports into stage space, box and shape alike", () => {
        const inset = { top: 30, right: 30, bottom: 30, left: 30 };
        const r = reg({ w: fixed(200), h: fixed(200), padding: inset, children: [marks] });
        expect(boxOf(r, "datum:chart:0")).toEqual({ x: 34, y: 34, w: 10, h: 52 });
        expect(regionById(r, "datum:chart:1").shape?.points).toEqual([
            [50, 30],
            [70, 30],
            [60, 50],
        ]);
    });

    it("appends them after the node's own region", () => {
        const r = reg(marks, 100, 60);
        expect(r.map((x) => x.id)).toEqual(["chart", "datum:chart:0", "datum:chart:1"]);
    });

    it("reports nothing extra for a surface that has no regions()", () => {
        const r = reg({ id: "plain", w: fixed(100), h: fixed(60), surface: { paint: () => {} } });
        expect(r.map((x) => x.id)).toEqual(["plain"]);
    });
});

describe("inRegion", () => {
    const rect: Region = { id: "r", box: { x: 10, y: 10, w: 20, h: 20 } };
    // the lower-left half of the box
    const tri: Region = {
        id: "t",
        box: { x: 0, y: 0, w: 20, h: 20 },
        shape: {
            kind: "poly",
            points: [
                [0, 0],
                [0, 20],
                [20, 20],
            ],
        },
    };

    it("falls back to the box when there is no shape", () => {
        expect(inRegion(rect, 20, 20)).toBe(true);
        expect(inRegion(rect, 9, 20)).toBe(false);
        expect(inRegion(rect, 20, 31)).toBe(false);
    });

    it("tests the polygon when there is one", () => {
        expect(inRegion(tri, 5, 15)).toBe(true); // inside the triangle
        expect(inRegion(tri, 15, 5)).toBe(false); // inside the box, outside the triangle
    });

    it("never reports a hit outside the bounding box", () => {
        expect(inRegion(tri, -1, 10)).toBe(false);
        expect(inRegion(tri, 10, 21)).toBe(false);
    });
});

describe("decor — negative-z floats are out of the reading order", () => {
    const decorated = (z: number): EngineNode => ({
        w: fixed(200),
        h: fixed(100),
        children: [
            boxNode("body", grow(), grow()),
            {
                ...boxNode("wash", fixed(50), fixed(50), { float: { x: "end", y: "start", z } }),
                children: [textNode("watermark")],
            },
        ],
    });
    const decorOf = (id: string, z: number): boolean | undefined =>
        cmds(decorated(z), 200, 100).find((c) => c.id === id)?.decor;

    it("marks a negative-z float, and everything under it", () => {
        expect(decorOf("wash", -1)).toBe(true);
        expect(cmds(decorated(-1), 200, 100).find((c) => c.kind === "text")?.decor).toBe(true);
    });

    it("leaves the flow and non-negative floats unmarked", () => {
        expect(decorOf("body", -1)).toBeUndefined();
        expect(decorOf("wash", 0)).toBeUndefined();
        expect(decorOf("wash", 2)).toBeUndefined();
    });
});

describe("float heights and the unbounded sentinel", () => {
    const SENTINEL = 100000; // what layoutSection passes as the container height

    it("a grow-height float in a fit-height root takes the flow's height, not the sentinel", () => {
        const root: EngineNode = {
            w: fixed(200),
            h: fit(),
            children: [
                textNode("xxxx xxxx xxxx", { h: fit() }),
                boxNode("badge", fixed(40), grow(), { float: { x: "end", y: "start" } }),
            ],
        };
        const { regions } = runLayout(root, 200, SENTINEL);
        const flowH = boxOf(regions, "badge").h;
        expect(flowH).toBeLessThan(200);
    });

    it("a fixed-height parent still stretches a grow float to its content box", () => {
        const root: EngineNode = {
            w: fixed(200),
            h: fixed(120),
            children: [
                textNode("xxxx", { h: fit() }),
                boxNode("wash", fixed(40), grow(), { float: { x: "start", y: "start", z: -1 } }),
            ],
        };
        const { regions } = runLayout(root, 200, SENTINEL);
        near(boxOf(regions, "wash").h, 120);
    });

    it("the same guard holds for row and grid parents", () => {
        const float = boxNode("f", fixed(30), grow(), { float: { x: "end", y: "end" } });
        const row: EngineNode = {
            w: fixed(200),
            h: fit(),
            direction: "row",
            children: [textNode("xxxx xxxx"), float],
        };
        const grid: EngineNode = {
            w: fixed(200),
            h: fit(),
            direction: "grid",
            columns: 2,
            children: [textNode("xx"), textNode("xx"), { ...float }],
        };
        expect(boxOf(runLayout(row, 200, SENTINEL).regions, "f").h).toBeLessThan(200);
        expect(boxOf(runLayout(grid, 200, SENTINEL).regions, "f").h).toBeLessThan(200);
    });
});
