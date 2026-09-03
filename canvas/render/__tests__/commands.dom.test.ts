// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { TextLeaf } from "@engine/node";
import { clearMeasureCache, measureText, sectionSlides } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

// installCanvas2D gives measureText/sectionSlides a deterministic canvas; the wrap/pagination logic is real
beforeAll(() => installCanvas2D());

describe("measureText", () => {
    const leaf: TextLeaf = { text: "hello", fontId: "f", size: 12, wrap: "words" };
    it("measures a leaf and caches the result", () => {
        clearMeasureCache();
        const a = measureText(leaf, 999);
        const b = measureText(leaf, 999);
        expect(a.width).toBeGreaterThan(0);
        expect(a.height).toBeGreaterThan(0);
        expect(b).toBe(a); // cache hit returns the same object
    });
});

describe("sectionSlides", () => {
    const deck = resolveProfile("deck");
    it("a short section is a single 1280×720 page", () => {
        const pages = sectionSlides(sectionOf(inst("text", { text: "Title" })), tokens, deck);
        expect(pages).toHaveLength(1);
        expect(pages[0]!.w).toBe(1280);
        expect(pages[0]!.h).toBe(720);
    });
    it("a very tall section paginates into several pages", () => {
        const paras = Array.from({ length: 60 }, (_, i) => inst("text", { text: `Line ${i}` }));
        const section = sectionOf({
            type: "container",
            data: { direction: "col", children: paras },
        });
        expect(sectionSlides(section, tokens, deck).length).toBeGreaterThan(1);
    });
});

describe("the measure cache and paint-only run attributes", () => {
    const base: TextLeaf = { text: "hello", fontId: "f", size: 12, wrap: "words" };

    it("two leaves differing only in run color each keep their own frag color", () => {
        clearMeasureCache();
        measureText({ ...base, runs: [{ text: "hello", color: "#ff0000" }] }, 400);
        const blue = measureText({ ...base, runs: [{ text: "hello", color: "#0000ff" }] }, 400);
        expect(blue.lines?.[0]?.frags?.[0]?.color).toBe("#0000ff");
    });

    it("toggling underline on the same text re-measures instead of serving stale frags", () => {
        clearMeasureCache();
        measureText({ ...base, runs: [{ text: "hello" }] }, 400);
        const marked = measureText({ ...base, runs: [{ text: "hello", underline: true }] }, 400);
        expect(marked.lines?.[0]?.frags?.[0]?.underline).toBe(true);
    });

    it("run boundaries key unambiguously when digits align with the flag triples", () => {
        // "a"+bold"00b" serializes as 000a10000b under flags+text concatenation, exactly the
        // one-run "a10000b" — different text, different metrics, one key without a delimiter
        clearMeasureCache();
        const twoRuns = measureText(
            { ...base, text: "a00b", runs: [{ text: "a" }, { text: "00b", bold: true }] },
            400,
        );
        const oneRun = measureText({ ...base, text: "a10000b", runs: [{ text: "a10000b" }] }, 400);
        expect(oneRun).not.toBe(twoRuns);
        expect(oneRun.lines?.[0]?.frags?.[0]?.text).toBe("a10000b");
    });
});
