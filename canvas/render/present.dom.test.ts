// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import { sectionSlideCount, slideElement } from "@canvas/render/present";
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
        const section = sectionOf({ type: "group", data: { direction: "col", children: paras } });
        expect(sectionSlideCount(section, tokens, deck)).toBeGreaterThan(1);
    });
});

describe("slideElement", () => {
    it("builds a slide DOM element for a page", () => {
        const el = slideElement(sectionOf(inst("text", { text: "Title" })), tokens, deck);
        expect(el).toBeInstanceOf(HTMLElement);
    });
});
