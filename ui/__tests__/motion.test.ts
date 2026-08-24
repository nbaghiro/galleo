import "@elements/register";
import { describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import type { MotionTokens } from "@themes";
import { DEFAULT_MOTION } from "@themes";
import type { ElementInstance } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { buildFrames, buildGroups, staggerMs, transitionFrames } from "@ui/motion";

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
