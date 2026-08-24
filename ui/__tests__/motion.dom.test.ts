// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import type { MotionTokens } from "@themes";
import { DEFAULT_MOTION } from "@themes";
import type { ElementInstance } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { buildGroups, runBuild, runTransition } from "@ui/motion";
import type { BuildGroup } from "@ui/motion";

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
