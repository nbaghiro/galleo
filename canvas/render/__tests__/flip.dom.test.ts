// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import {
    createSectionStackCache,
    flipBoxes,
    flipShifts,
    paintReconcile,
    paintSectionStack,
} from "@canvas/render/backends";
import "@elements/register";
import { colGroup } from "@model/artifact";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";
import { resolveProfile } from "@engine/profile";

installCanvas2D();

// happy-dom implements no Web Animations API; the stub is the platform seam, never the scheduling
interface Recorded {
    target: HTMLElement;
    keyframes: Keyframe[] | PropertyIndexedKeyframes;
    options: KeyframeAnimationOptions;
    cancelled: boolean;
}
let recorded: Recorded[] = [];

beforeEach(() => {
    recorded = [];
    // defineProperty rather than an assignment through a cast: happy-dom ships no Web Animations
    // API, so the property does not exist to be typed, and the repo allows no double assertion
    Object.defineProperty(HTMLElement.prototype, "animate", {
        configurable: true,
        writable: true,
        value: function (
            this: HTMLElement,
            keyframes: Keyframe[] | PropertyIndexedKeyframes,
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
        },
    });
});
afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

const rect = (id: string | undefined, x: number, y: number): RenderCommand => ({
    kind: "rect",
    box: { x, y, w: 10, h: 10 },
    fill: { color: "#111" },
    ...(id ? { id } : {}),
});

const FEEL = { ms: 140, easing: "ease-out" };

describe("flipBoxes / flipShifts — the pure delta map", () => {
    it("keys id-less commands by kind and ordinal, so two plain rects stay distinct", () => {
        const prev = flipBoxes([rect(undefined, 0, 0), rect(undefined, 0, 50)]);
        const shifts = flipShifts(prev, [rect(undefined, 0, 0), rect(undefined, 0, 90)]);
        expect(shifts).toEqual([null, { dx: 0, dy: -40 }]);
    });

    it("moved, unmoved, and appeared commands each answer their own way", () => {
        const prev = flipBoxes([rect("el:s:0", 0, 0), rect("el:s:1", 0, 50)]);
        const next = [rect("el:s:0", 0, 0), rect("el:s:2", 0, 50), rect("el:s:1", 0, 100)];
        expect(flipShifts(prev, next)).toEqual([null, "appeared", { dx: 0, dy: -50 }]);
    });

    it("a kind change under the same id is a new command, not a move", () => {
        const prev = flipBoxes([rect("el:s:0", 0, 0)]);
        const text: RenderCommand = {
            kind: "text",
            box: { x: 0, y: 20, w: 10, h: 10 },
            text: { text: "a", size: 12, color: "#000", fontId: "f", wrap: "words" },
            id: "el:s:0",
        };
        expect(flipShifts(prev, [text])).toEqual(["appeared"]);
    });

    it("moves compensate both axes: a row parting shifts x", () => {
        const prev = flipBoxes([rect("el:s:0", 100, 0)]);
        expect(flipShifts(prev, [rect("el:s:0", 160, 0)])).toEqual([{ dx: -60, dy: 0 }]);
    });
});

describe("paintReconcile with a flip", () => {
    it("plays a moved command's inverted translate and fades an appeared one in", () => {
        const host = document.createElement("div");
        paintReconcile(host, [rect("a", 0, 0), rect("b", 0, 50)]);
        const next = [rect("a", 0, 0), rect("c", 0, 50), rect("b", 0, 100)];
        paintReconcile(host, next, "full", {
            shifts: flipShifts(flipBoxes([rect("a", 0, 0), rect("b", 0, 50)]), next),
            ...FEEL,
        });
        expect(recorded).toHaveLength(2);
        const [fade, move] = recorded as [Recorded, Recorded];
        expect(fade.keyframes).toEqual([{ opacity: 0 }]);
        expect(move.keyframes).toEqual([{ translate: "0px -50px" }, { translate: "0px 0px" }]);
        expect(move.options).toMatchObject({ duration: 140, easing: "ease-out" });
    });

    it("a second flip on the same node cancels the first, so flights never stack", () => {
        const host = document.createElement("div");
        paintReconcile(host, [rect("a", 0, 0)]);
        const step = (y: number): void => {
            const cmds = [rect("a", 0, y)];
            paintReconcile(host, cmds, "full", {
                shifts: [{ dx: 0, dy: -10 }],
                ...FEEL,
            });
        };
        step(10);
        step(20);
        expect(recorded).toHaveLength(2);
        expect(recorded[0]!.cancelled).toBe(true);
        expect(recorded[1]!.cancelled).toBe(false);
    });

    it("without a flip, behavior is byte-identical to today: no animations, no translate", () => {
        const host = document.createElement("div");
        paintReconcile(host, [rect("a", 0, 0)]);
        paintReconcile(host, [rect("a", 0, 40)]);
        expect(recorded).toHaveLength(0);
        expect((host.firstChild as HTMLElement).style.translate ?? "").toBe("");
    });
});

describe("paintSectionStack with flip", () => {
    const theme = tokens;
    const profile = resolveProfile("doc");
    // two stacked texts: growing the first moves the second, which is the parting in miniature
    const sec = (first: string) =>
        sectionOf(colGroup([inst("text", { text: first }), inst("text", { text: "below" })]), {
            id: "s1",
        });

    it("returns stage-space shifts for moved commands and animates them; off = none", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const opts = { fullW: 800, cache };
        paintSectionStack(host, [sec("one")], profile, theme, opts);
        recorded = [];
        const grown = "one grown to wrap across several lines of copy ".repeat(6);
        const r = paintSectionStack(host, [sec(grown)], profile, theme, {
            ...opts,
            flip: FEEL,
        });
        expect(r.shifts.length).toBeGreaterThan(0);
        expect(recorded.length).toBeGreaterThan(0);
        recorded = [];
        const off = paintSectionStack(host, [sec("one")], profile, theme, opts);
        expect(off.shifts).toEqual([]);
        expect(recorded).toHaveLength(0);
    });

    it("a section whose top moved glides as one layer, and reports the shift", () => {
        const host = document.createElement("div");
        const cache = createSectionStackCache();
        const grow = sectionOf(inst("text", { text: "short" }), { id: "s0" });
        const below = sectionOf(inst("text", { text: "below" }), { id: "s1" });
        paintSectionStack(host, [grow, below], profile, theme, { fullW: 800, cache });
        recorded = [];
        const taller = sectionOf(
            inst("text", { text: "short grown much taller by this longer copy ".repeat(8) }),
            { id: "s0" },
        );
        const r = paintSectionStack(host, [taller, below], profile, theme, {
            fullW: 800,
            cache,
            flip: FEEL,
        });
        const layerShift = r.shifts.find((s) => s.dy < 0 && s.box.h > 0);
        expect(layerShift).toBeDefined();
        expect(recorded.some((a) => a.target === host.childNodes[1])).toBe(true);
    });
});
