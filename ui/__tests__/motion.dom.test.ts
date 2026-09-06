// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import type { MotionTokens } from "@themes";
import { DEFAULT_MOTION } from "@themes";
import type { ElementInstance } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { buildGroups, runBuild, runTransition } from "@ui/motion";
import type { BuildGroup, DrawOnPlan } from "@ui/motion";

// happy-dom implements no Web Animations API, so it is stubbed here the way installCanvas2D stubs
// the 2D context: the platform seam, never the scheduling under test.
interface Recorded {
    target: HTMLElement;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
    cancelled: boolean;
}

let recorded: Recorded[] = [];

beforeEach(() => {
    recorded = [];
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (
        this: HTMLElement,
        keyframes: Keyframe[],
        options: KeyframeAnimationOptions,
    ) {
        const entry: Recorded = { target: this, keyframes, options, cancelled: false };
        recorded.push(entry);
        return {
            finished: Promise.resolve(),
            cancel: () => {
                entry.cancelled = true;
            },
        };
    };
});

afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});

const motion = (over: Partial<MotionTokens> = {}): MotionTokens => ({ ...DEFAULT_MOTION, ...over });
const div = (): HTMLElement => document.createElement("div");

const box = { x: 0, y: 0, w: 10, h: 10 };
const cmd = (id: string): RenderCommand => ({ kind: "rect", box, fill: { color: "#000" }, id });

describe("runTransition", () => {
    it("animates both slides and resolves once the incoming one has arrived", async () => {
        const [out, incoming] = [div(), div()];
        await runTransition(out, incoming, motion(), 1);
        expect(recorded.map((r) => r.target)).toEqual([out, incoming]);
        expect(recorded.every((r) => r.options.fill === "both")).toBe(true);
    });

    it("runs with no outgoing slide on the first paint", async () => {
        await runTransition(null, div(), motion(), 1);
        expect(recorded).toHaveLength(1);
    });

    it("cut resolves without animating anything", async () => {
        await runTransition(div(), div(), motion({ transition: "cut" }), 1);
        expect(recorded).toEqual([]);
    });

    it("carries the theme's duration and easing", async () => {
        const m = motion({ duration: 400, easing: "linear" });
        await runTransition(null, div(), m, 1);
        expect(recorded[0]!.options).toMatchObject({ duration: 400, easing: "linear" });
    });
});

describe("runBuild", () => {
    const root: ElementInstance = colGroup([
        { type: "text", data: { text: "a", style: "body" } },
        { type: "text", data: { text: "b", style: "body" } },
    ]);
    const groups = (): BuildGroup[] => {
        const commands = [cmd("section:s1"), cmd("el:s1:0"), cmd("el:s1:0.1"), cmd("el:s1:1")];
        return buildGroups(
            root,
            commands,
            commands.map(() => div()),
        );
    };

    it("animates every node of every unit", () => {
        runBuild(groups(), motion());
        expect(recorded).toHaveLength(3); // the section ground is not part of the build
    });

    it("staggers by unit, so one element's nodes share a delay", () => {
        runBuild(groups(), motion());
        const delays = recorded.map((r) => r.options.delay);
        expect(delays[0]).toBe(delays[1]); // both commands of the first element
        expect(delays[2]).toBeGreaterThan(delays[1] as number);
    });

    it("build:none animates nothing", () => {
        runBuild(groups(), motion({ build: "none" }));
        expect(recorded).toEqual([]);
    });

    it("an empty slide is a no-op", () => {
        runBuild([], motion());
        expect(recorded).toEqual([]);
    });
});

describe("runBuild with draw-on plans", () => {
    const root: ElementInstance = colGroup([{ type: "chart", data: { type: "bar", values: "" } }]);
    const chartEl = (): { el: HTMLElement; groups: BuildGroup[]; plan: DrawOnPlan } => {
        const el = div();
        el.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
        const commands: RenderCommand[] = [
            cmd("section:s1"),
            {
                kind: "surface",
                box: { x: 20, y: 30, w: 200, h: 100 },
                paint: () => undefined,
                id: "el:s1:0",
            },
        ];
        const nodes = [div(), el];
        const plan: DrawOnPlan = {
            node: el,
            box: { x: 20, y: 30, w: 200, h: 100 },
            datums: [
                { id: "datum:el:s1:0:0", box: { x: 30, y: 40, w: 20, h: 80 }, radius: 3 },
                { id: "datum:el:s1:0:1", box: { x: 60, y: 40, w: 20, h: 80 } },
            ],
        };
        return { el, groups: buildGroups(root, commands, nodes), plan };
    };

    it("punches the surface, mounts one clipped clone per datum, staggers them after the chrome", () => {
        const { el, groups, plan } = chartEl();
        runBuild(groups, motion(), [plan]);
        expect(el.style.clipPath).toMatch(/^url\(/);
        const wrappers = [...el.children].filter((c) => c.tagName === "DIV");
        expect(wrappers).toHaveLength(2);
        for (const w of wrappers) expect(w.querySelector("svg")).not.toBeNull();
        // the block build animates the node itself; the two overlays follow at half a duration
        const overlays = recorded.filter((r) => wrappers.includes(r.target));
        expect(overlays).toHaveLength(2);
        const base = recorded.find((r) => r.target === el)!.options.delay as number;
        expect(overlays[0]!.options.delay).toBe(base + motion().duration / 2);
        expect(overlays[1]!.options.delay as number).toBeGreaterThan(
            overlays[0]!.options.delay as number,
        );
    });

    it("clears the punch and removes every transient once the choreography settles", async () => {
        const { el, groups, plan } = chartEl();
        runBuild(groups, motion(), [plan]);
        await new Promise((r) => setTimeout(r));
        expect(el.style.clipPath).toBe("");
        expect([...el.children].filter((c) => c.tagName === "DIV")).toHaveLength(0);
        expect(el.querySelectorAll("svg")).toHaveLength(1); // the painted art alone
    });

    it("build:none leaves the surface untouched, holes and all", () => {
        const { el, groups, plan } = chartEl();
        runBuild(groups, motion({ build: "none" }), [plan]);
        expect(el.style.clipPath).toBe("");
        expect(el.children).toHaveLength(1);
        expect(recorded).toEqual([]);
    });

    it("a node without painted art keeps its plain block build", () => {
        const { groups, plan } = chartEl();
        const bare = div();
        runBuild(groups, motion(), [{ ...plan, node: bare }]);
        expect(bare.style.clipPath).toBe("");
        expect(bare.children).toHaveLength(0);
    });
});
