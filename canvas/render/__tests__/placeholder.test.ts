// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { Section, SectionSummary } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { layoutPlaceholder } from "@canvas/render/placeholder";
import { estimateSectionHeight } from "@canvas/render/window";
import { installCanvas2D, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");
const doc = resolveProfile("doc");
const section: Section = { id: "s1", root: { type: "container", data: { children: [] } } };
const summary = (over: Partial<SectionSummary> = {}): SectionSummary => ({
    id: "s1",
    kind: "content",
    ...over,
});

const draw = (s: SectionSummary, profile = deck, known?: number) =>
    layoutPlaceholder(section, s, 900, tokens, profile, 1000, known);

const texts = (cmds: ReturnType<typeof draw>["commands"]): string[] =>
    cmds.flatMap((c) => (c.kind === "text" ? [c.text.text] : []));

describe("layoutPlaceholder", () => {
    it("paints the section's real title, so an unloaded stretch stays navigable", () => {
        expect(texts(draw(summary({ title: "Pricing ladder" })).commands)).toContain(
            "Pricing ladder",
        );
    });

    it("falls back to a bar when the digest recorded no title", () => {
        const { commands } = draw(summary());
        expect(texts(commands)).toEqual([]);
        expect(commands.length).toBeGreaterThan(1);
    });

    it("reserves exactly the height the stack would have reserved", () => {
        const s = summary({ size: 4000 });
        expect(draw(s, doc).height).toBe(estimateSectionHeight(section, doc, 1000, 4000));
        expect(draw(s, deck).height).toBe(estimateSectionHeight(section, deck, 1000, 4000));
    });

    it("prefers a remembered height over the byte estimate", () => {
        expect(draw(summary({ size: 4000 }), doc, 777).height).toBe(777);
    });

    it("varies its shape by kind", () => {
        const shape = (kind: string): number => draw(summary({ kind })).commands.length;
        const kinds = ["cover", "chart", "table", "media", "stat", "quote", "content", "diagram"];
        const counts = kinds.map(shape);
        expect(new Set(counts).size).toBeGreaterThan(3); // not one ghost wearing different labels
        expect(counts.every((n) => n > 0)).toBe(true);
    });

    it("stays inside the box it was given", () => {
        const { commands, height } = draw(summary({ kind: "media", title: "A long heading" }));
        for (const c of commands) {
            expect(c.box.x).toBeGreaterThanOrEqual(0);
            expect(c.box.x + c.box.w).toBeLessThanOrEqual(900 + 1);
            expect(c.box.y + c.box.h).toBeLessThanOrEqual(height + 1);
        }
    });
});
