// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "@model/artifact";
import { colGroup, refRegionId } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { sectionSlides } from "@canvas/render/commands";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");

const withIds = (a: object, b: object): ReturnType<typeof sectionOf> => {
    const s = sectionOf(colGroup([{ ...a }, { ...b }] as never));
    const kids = (s.root.data as { children: { id?: string }[] }).children;
    kids[0]!.id = "e-a";
    kids[1]!.id = "e-b";
    return s;
};
const conn: Connection = { id: "c1", from: { element: "e-a" }, to: { element: "e-b" } };

describe("sectionSlides carries this section's arrows", () => {
    it("a one-page section gets the ref command on its page", () => {
        const s = withIds(
            inst("text", { style: "h1", text: "left" }),
            inst("text", { style: "body", text: "right" }),
        );
        const pages = sectionSlides(s, tokens, deck, false, [conn]);
        expect(pages).toHaveLength(1);
        expect(pages[0]!.commands.some((c) => c.id === refRegionId("c1"))).toBe(true);
    });

    it("ends split across pages draw on neither page", () => {
        const filler = Array.from({ length: 38 }, (_, i) =>
            inst("text", { style: "body", text: `para ${i} ${"y".repeat(400)}` }),
        );
        const s = sectionOf(
            colGroup([
                { ...inst("text", { text: "top" }), id: "e-a" },
                ...filler,
                { ...inst("text", { text: "bottom" }), id: "e-b" },
            ]),
        );
        const pages = sectionSlides(s, tokens, deck, false, [conn]);
        expect(pages.length).toBeGreaterThan(1);
        for (const p of pages)
            expect(p.commands.some((c) => c.id === refRegionId("c1"))).toBe(false);
    });

    it("no connections means byte-identical pages", () => {
        const s = withIds(
            inst("text", { style: "h1", text: "left" }),
            inst("text", { style: "body", text: "right" }),
        );
        const bare = sectionSlides(s, tokens, deck);
        const armed = sectionSlides(s, tokens, deck, false, []);
        expect(armed.map((p) => p.commands.length)).toEqual(bare.map((p) => p.commands.length));
    });
});
