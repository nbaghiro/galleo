import "@elements/register";
import { describe, expect, it } from "vitest";
import type { Region, RenderCommand } from "@engine/node";
import type { MotionTokens } from "@themes";
import { DEFAULT_MOTION } from "@themes";
import type { ElementInstance } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { buildFrames, buildGroups, drawOnPlans, staggerMs, transitionFrames } from "@ui/motion";

const box = { x: 0, y: 0, w: 10, h: 10 };
const cmd = (id?: string): RenderCommand => ({ kind: "rect", box, fill: { color: "#000" }, id });

// buildGroups pairs by index, so the fake node only has to be distinguishable
const nodesFor = (commands: RenderCommand[]): { tag: number }[] =>
    commands.map((_, i) => ({ tag: i }));

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t, style: "body" } });
const stack = (...kids: ElementInstance[]): ElementInstance => colGroup(kids);
const card = (...kids: ElementInstance[]): ElementInstance => ({
    type: "container",
    data: { surface: "solid", children: kids },
});

const groupsOf = (
    root: ElementInstance,
    ids: (string | undefined)[],
): { path: string; count: number }[] => {
    const commands = ids.map(cmd);
    return buildGroups(root, commands, nodesFor(commands)).map((g) => ({
        path: g.path.join("."),
        count: g.nodes.length,
    }));
};

const motion = (over: Partial<MotionTokens> = {}): MotionTokens => ({ ...DEFAULT_MOTION, ...over });

describe("buildGroups", () => {
    it("leaves the section ground out of the build", () => {
        const root = stack(text("a"), text("b"));
        expect(groupsOf(root, ["section:s1", "el:s1:0", "el:s1:1"])).toEqual([
            { path: "0", count: 1 },
            { path: "1", count: 1 },
        ]);
    });

    it("descends through a bare layout container, so nested elements arrive one at a time", () => {
        const root = stack(stack(text("a"), text("b")), text("c"));
        expect(groupsOf(root, ["section:s1", "el:s1:0.0", "el:s1:0.1", "el:s1:1"])).toEqual([
            { path: "0.0", count: 1 },
            { path: "0.1", count: 1 },
            { path: "1", count: 1 },
        ]);
    });

    it("keeps a card whole: it paints a surface, so its parts arrive with it", () => {
        const root = stack(card(text("a"), text("b")), text("c"));
        // the card's own fill command is what stops the walk descending into it
        expect(
            groupsOf(root, ["section:s1", "el:s1:0", "el:s1:0.0", "el:s1:0.1", "el:s1:1"]),
        ).toEqual([
            { path: "0", count: 3 },
            { path: "1", count: 1 },
        ]);
    });

    it("a leaf root is one piece rather than nothing", () => {
        expect(groupsOf(text("just a title"), ["section:s1", "el:s1"])).toEqual([
            { path: "", count: 1 },
        ]);
    });

    it("an unaddressed command joins whatever was addressed most recently", () => {
        const root = stack(text("a"), text("b"));
        expect(groupsOf(root, ["section:s1", "el:s1:0", undefined, "el:s1:1"])).toEqual([
            { path: "0", count: 2 },
            { path: "1", count: 1 },
        ]);
    });

    it("ignores a command with no painted node", () => {
        const root = stack(text("a"), text("b"));
        const commands = [cmd("el:s1:0"), cmd("el:s1:1")];
        expect(buildGroups(root, commands, [nodesFor(commands)[0]!])).toHaveLength(1);
    });
});

describe("staggerMs", () => {
    it("caps the tail as the group count grows", () => {
        const m = motion();
        expect(staggerMs(m, 2)).toBeCloseTo(m.duration * 0.4);
        expect(staggerMs(m, 12) * 11).toBeLessThanOrEqual(700);
    });

    it("never divides by zero on a single group", () => {
        expect(Number.isFinite(staggerMs(motion(), 1))).toBe(true);
    });
});

describe("frames", () => {
    it("cut and build:none produce no frames at all", () => {
        expect(transitionFrames(motion({ transition: "cut" }), 1).in).toEqual([]);
        expect(buildFrames(motion({ build: "none" }))).toEqual([]);
    });

    it("push mirrors itself under direction reversal", () => {
        const fwd = transitionFrames(motion({ transition: "push" }), 1);
        const back = transitionFrames(motion({ transition: "push" }), -1);
        expect(fwd.in[0]!.transform).toBe("translateX(6%)");
        expect(back.in[0]!.transform).toBe("translateX(-6%)");
        expect(fwd.out[1]!.transform).toBe("translateX(-6%)");
    });

    it("every transition ends at rest so nothing is left offset", () => {
        for (const t of ["fade", "push"] as const) {
            const frames = transitionFrames(motion({ transition: t }), 1);
            expect(frames.in[frames.in.length - 1]!.opacity).toBe(1);
        }
        expect(buildFrames(motion()).at(-1)).toEqual({ opacity: 1, transform: "none" });
    });

    it("rise travels further than settle", () => {
        const px = (m: MotionTokens): number =>
            Number(String(buildFrames(m)[0]!.transform).replace(/\D+/g, ""));
        expect(px(motion({ build: "rise" }))).toBeGreaterThan(px(motion({ build: "settle" })));
    });
});

describe("drawOnPlans", () => {
    const surface = (id?: string): RenderCommand => ({
        kind: "surface",
        box: { x: 20, y: 30, w: 200, h: 100 },
        paint: () => undefined,
        id,
    });
    const datum = (el: string, i: number, x: number): Region => ({
        id: `datum:${el}:${i}`,
        box: { x, y: 40, w: 20, h: 80 },
    });

    it("claims an element's datums onto its surface node, through id-less commands", () => {
        const commands = [cmd("section:s1"), cmd("el:s1:0"), surface()];
        const nodes = nodesFor(commands);
        const regions: Region[] = [
            { id: "el:s1:0", box: { x: 20, y: 30, w: 200, h: 100 } },
            datum("el:s1:0", 0, 30),
            datum("el:s1:0", 1, 60),
        ];
        const plans = drawOnPlans(commands, nodes, regions);
        expect(plans).toHaveLength(1);
        expect(plans[0]!.node).toBe(nodes[2]);
        expect(plans[0]!.box).toEqual({ x: 20, y: 30, w: 200, h: 100 });
        expect(plans[0]!.datums.map((d) => d.id)).toEqual(["datum:el:s1:0:0", "datum:el:s1:0:1"]);
    });

    it("keeps region order, which is the surface's paint order", () => {
        const commands = [cmd("el:s1:0"), surface()];
        const nodes = nodesFor(commands);
        const regions: Region[] = [
            datum("el:s1:0", 2, 90),
            datum("el:s1:0", 0, 30),
            datum("el:s1:0", 1, 60),
        ];
        const [plan] = drawOnPlans(commands, nodes, regions);
        expect(plan!.datums.map((d) => d.id)).toEqual([
            "datum:el:s1:0:2",
            "datum:el:s1:0:0",
            "datum:el:s1:0:1",
        ]);
    });

    it("a lone datum, or none at all, is no choreography", () => {
        const commands = [cmd("el:s1:0"), surface()];
        const nodes = nodesFor(commands);
        expect(drawOnPlans(commands, nodes, [datum("el:s1:0", 0, 30)])).toEqual([]);
        expect(drawOnPlans(commands, nodes, [])).toEqual([]);
    });

    it("a crowd falls back to the block build", () => {
        const commands = [cmd("el:s1:0"), surface()];
        const nodes = nodesFor(commands);
        const many = Array.from({ length: 41 }, (_, i) => datum("el:s1:0", i, i * 4));
        expect(drawOnPlans(commands, nodes, many)).toEqual([]);
    });

    it("a rotated or ancestor-clipped surface is left to the block build", () => {
        const spun: RenderCommand = { ...surface("el:s1:0"), rotate: { deg: 10, cx: 0, cy: 0 } };
        const clipped: RenderCommand = { ...surface("el:s1:0"), clip: { x: 0, y: 0, w: 5, h: 5 } };
        const regions = [datum("el:s1:0", 0, 30), datum("el:s1:0", 1, 60)];
        expect(drawOnPlans([spun], nodesFor([spun]), regions)).toEqual([]);
        expect(drawOnPlans([clipped], nodesFor([clipped]), regions)).toEqual([]);
    });

    it("only the element's first surface claims them, and foreign datums stay foreign", () => {
        const commands = [cmd("el:s1:0"), surface(), surface(), cmd("el:s1:1"), surface()];
        const nodes = nodesFor(commands);
        const regions = [datum("el:s1:0", 0, 30), datum("el:s1:0", 1, 60)];
        const plans = drawOnPlans(commands, nodes, regions);
        expect(plans).toHaveLength(1);
        expect(plans[0]!.node).toBe(nodes[1]);
    });
});
