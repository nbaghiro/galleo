// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import {
    commandRegions,
    continuousSteps,
    firstSlideOf,
    locateSlide,
    pagedSteps,
    sectionSlideCount,
    slideElement,
    stepHoldMs,
    stepIndexOf,
} from "@canvas/render/present";
import { resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());
const deck = resolveProfile("deck");

describe("sectionSlideCount", () => {
    it("a short section is a single slide", () => {
        expect(sectionSlideCount(sectionOf(inst("text", { text: "Title" })), tokens, deck)).toBe(1);
    });
    it("a very tall section paginates into several", () => {
        const paras = Array.from({ length: 60 }, (_, i) => inst("text", { text: `Line ${i}` }));
        const section = sectionOf({
            type: "container",
            data: { direction: "col", children: paras },
        });
        expect(sectionSlideCount(section, tokens, deck)).toBeGreaterThan(1);
    });
});

describe("slideElement", () => {
    it("builds a slide DOM element for a page", () => {
        const { el, commands, nodes } = slideElement(
            sectionOf(inst("text", { text: "Title" })),
            tokens,
            deck,
        );
        expect(el).toBeInstanceOf(HTMLElement);
        expect(nodes).toHaveLength(commands.length);
    });

    it("lays out at the full page width and refuses to flex-shrink", () => {
        // Without flex-shrink:0 the flex host squeezes the slide, then the transform scales it again.
        const { el } = slideElement(sectionOf(inst("text", { text: "Title" })), tokens, deck);
        expect(el.style.width).toBe("1280px");
        expect(el.style.flexShrink).toBe("0");
    });
});

describe("locateSlide / firstSlideOf", () => {
    // a deck whose second section is three pages tall: 5 flat slides over 3 sections
    const counts = [1, 3, 1];

    it("maps a flat index onto its section and page", () => {
        expect(locateSlide(counts, 0)).toEqual({ si: 0, page: 0 });
        expect(locateSlide(counts, 1)).toEqual({ si: 1, page: 0 });
        expect(locateSlide(counts, 3)).toEqual({ si: 1, page: 2 });
        expect(locateSlide(counts, 4)).toEqual({ si: 2, page: 0 });
    });

    it("clamps past either end rather than reporting a section that is not there", () => {
        expect(locateSlide(counts, -5)).toEqual({ si: 0, page: 0 });
        expect(locateSlide(counts, 99)).toEqual({ si: 2, page: 0 });
    });

    it("survives an empty deck", () => {
        expect(locateSlide([], 0)).toEqual({ si: 0, page: 0 });
    });

    it("finds the flat index each section starts at, which is what a jump needs", () => {
        expect(firstSlideOf(counts, 0)).toBe(0);
        expect(firstSlideOf(counts, 1)).toBe(1);
        expect(firstSlideOf(counts, 2)).toBe(4);
    });

    it("round-trips: the first slide of a section locates back to that section, page 0", () => {
        for (let si = 0; si < counts.length; si++)
            expect(locateSlide(counts, firstSlideOf(counts, si))).toEqual({ si, page: 0 });
    });
});

describe("the step model", () => {
    it("paged: a step per slide page, carrying its position within the section", () => {
        expect(pagedSteps(["a", "b"], [1, 3])).toEqual([
            { sectionId: "a", within: 0, of: 1 },
            { sectionId: "b", within: 0, of: 3 },
            { sectionId: "b", within: 1, of: 3 },
            { sectionId: "b", within: 2, of: 3 },
        ]);
    });

    it("continuous: a section shorter than the viewport is one step", () => {
        const steps = continuousSteps(["a", "b"], [0, 400], 800, 1000);
        expect(steps).toHaveLength(2);
        expect(steps.map((s) => s.top)).toEqual([0, 400]);
    });

    it("continuous: a tall section is chopped into viewport-height steps", () => {
        const steps = continuousSteps(["a"], [0], 2500, 1000);
        expect(steps.map((s) => s.within)).toEqual([0, 1, 2]);
        expect(steps.every((s) => s.of === 3)).toBe(true);
        expect(steps.map((s) => s.top)).toEqual([0, 1000, 2000]);
    });

    it("continuous: the last section's height comes from the painted total", () => {
        const steps = continuousSteps(["a", "b"], [0, 500], 2500, 1000);
        // b runs 500..2500, so two steps
        expect(steps.filter((s) => s.sectionId === "b")).toHaveLength(2);
    });

    it("continuous: degrades to one step per section before anything is measured", () => {
        expect(continuousSteps(["a", "b"], [], 0, 0)).toEqual([
            { sectionId: "a", within: 0, of: 1 },
            { sectionId: "b", within: 0, of: 1 },
        ]);
    });

    it("finds where a section starts, which is where a track change lands", () => {
        const steps = pagedSteps(["a", "b", "c"], [2, 1, 1]);
        expect(stepIndexOf(steps, "b")).toBe(2);
        expect(stepIndexOf(steps, "c")).toBe(3);
        expect(stepIndexOf(steps, "missing")).toBe(0);
    });

    it("divides a track evenly across the screens of its section", () => {
        expect(stepHoldMs(30_000, 3)).toBe(10_000);
        expect(stepHoldMs(30_000, 1)).toBe(30_000);
        expect(stepHoldMs(0, 3)).toBe(1); // never zero: a timer must have something to wait on
    });
});

describe("commandRegions", () => {
    it("recovers a box per painted id, merging the radius of a node that paints twice", () => {
        const regions = commandRegions([
            { kind: "rect", box: { x: 0, y: 0, w: 10, h: 10 }, id: "el:s1", fill: {} },
            {
                kind: "image",
                box: { x: 0, y: 0, w: 10, h: 10 },
                id: "el:s1",
                image: { src: "p", fit: "cover", radius: 9 },
            },
            {
                kind: "text",
                box: { x: 2, y: 2, w: 6, h: 4 },
                id: "el:s1:0",
                text: { text: "x", fontId: "f", size: 12, wrap: "none" },
            },
            { kind: "rect", box: { x: 0, y: 0, w: 1, h: 1 }, fill: {} },
        ]);
        expect(regions.map((r) => r.id)).toEqual(["el:s1", "el:s1:0"]);
        expect(regions[0]!.radius).toBe(9);
        expect(regions[0]!.box).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    });
});

describe("a slide's live overlay anchor", () => {
    it("hands back the scaled content host and a region for the video's painted box", () => {
        const slide = slideElement(
            sectionOf(inst("video", { src: "https://youtu.be/dQw4w9WgXcQ" }), { id: "s1" }),
            tokens,
            deck,
        );
        expect(slide.content.parentElement).toBe(slide.el);
        const region = slide.regions.find((r) => r.id === "el:s1");
        expect(region).toBeDefined();
        expect(region!.box.w).toBeGreaterThan(0);
        expect(region!.box.h).toBeGreaterThan(0);
    });
});
