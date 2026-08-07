// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { FormatDescriptor } from "@model/geometry";
import { sectionSlides } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { colGroup } from "@model/artifact";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");
const fitting: FormatDescriptor = { ...deck, id: "card", overflow: "fit" };

// ~3.6x the frame
const tall = sectionOf(
    colGroup(
        Array.from({ length: 40 }, (_, i) =>
            inst("text", { style: "body", text: `para ${i} ${"y".repeat(400)}` }),
        ),
    ),
);
const short = sectionOf(colGroup([inst("text", { style: "h1", text: "Just a title" })]));

describe("overflow policy", () => {
    it('"paginate" splits a tall section across pages — today\'s deck behavior', () => {
        const pages = sectionSlides(tall, tokens, deck);
        expect(pages.length).toBeGreaterThan(1);
        for (const p of pages) expect(p.contentH).toBeLessThanOrEqual(p.h + 1);
    });

    it('"fit" keeps one page however tall, leaving the caller to scale it', () => {
        const pages = sectionSlides(tall, tokens, fitting);
        expect(pages).toHaveLength(1);
        // the page still reports the frame; contentH exceeding it is the caller's scale factor
        expect(pages[0]!.h).toBe(720);
        expect(pages[0]!.contentH).toBeGreaterThan(720);
    });

    it("both policies agree on a section that already fits", () => {
        const a = sectionSlides(short, tokens, deck);
        const b = sectionSlides(short, tokens, fitting);
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
        expect(a[0]!.contentH).toBe(b[0]!.contentH);
    });

    it("every shipped format paginates, so nothing changes for deck/doc/web", () => {
        for (const id of ["deck", "doc", "web"])
            expect(resolveProfile(id).overflow).toBe("paginate");
    });
});
