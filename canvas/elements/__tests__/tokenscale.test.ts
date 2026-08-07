import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { FormatDescriptor } from "@model/geometry";
import { GUTTER, composeSection, scaleTokens } from "@elements/compose";
import { resolveProfile } from "@engine/profile";
import { fit, fixed, grow, percent } from "@model/geometry";
import { inst, layoutCtx, sectionOf, tokens } from "@canvas/testkit";
import { rowGroup } from "@model/artifact";

const deck = resolveProfile("deck");
const scaled = (k: number): FormatDescriptor => ({ ...deck, id: "scaled", tokenScale: k });

// section → [inner] → [content]
const contentOf = (section: EngineNode): EngineNode => section.children![0]!.children![0]!;
const firstText = (n: EngineNode): EngineNode | null => {
    if (n.text) return n;
    for (const c of n.children ?? []) {
        const found = firstText(c);
        if (found) return found;
    }
    return null;
};

describe("scaleTokens", () => {
    const node: EngineNode = {
        w: fixed(100),
        h: grow(20, 400),
        gap: 10,
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        aspect: 16 / 9,
        fill: { color: "#fff", radius: 8 },
        children: [
            {
                w: percent(0.6),
                h: fit(),
                text: { text: "hi", fontId: "f", size: 17, wrap: "words" },
            },
        ],
    };

    it("is the identity at 1, so an unscaled format is untouched", () => {
        expect(scaleTokens(node, 1)).toBe(node);
    });

    it("multiplies type and space", () => {
        const out = scaleTokens(node, 2);
        expect(out.gap).toBe(20);
        expect(out.padding).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
        expect(out.fill?.radius).toBe(16);
        expect(firstText(out)!.text!.size).toBe(34);
    });

    it("scales fixed sizes and fit/grow bounds", () => {
        const out = scaleTokens(node, 2);
        expect(out.w).toEqual(fixed(200));
        expect(out.h).toMatchObject({ mode: "grow", min: 40, max: 800 });
    });

    it("leaves ratios and relative sizes alone — they are already scale-free", () => {
        const out = scaleTokens(node, 2);
        expect(out.aspect).toBe(16 / 9); // a ratio has no units
        expect(out.children![0]!.w).toEqual(percent(0.6)); // a fraction of a scaled parent
    });

    it("does not mutate the input", () => {
        scaleTokens(node, 3);
        expect(node.gap).toBe(10);
        expect(firstText(node)!.text!.size).toBe(17);
    });
});

describe("composeSection honors tokenScale", () => {
    const section = sectionOf(inst("text", { style: "h1", text: "Title" }));

    it("scales body type with the format", () => {
        const at = (k: number): number =>
            firstText(composeSection(section, layoutCtx(1280, scaled(k), tokens)))!.text!.size;
        expect(at(2)).toBe(at(1) * 2);
    });

    it("scales the section's own gutters, not just its content", () => {
        const gutterOf = (k: number): number =>
            composeSection(section, layoutCtx(1280, scaled(k), tokens)).children![0]!.padding!.left;
        expect(gutterOf(1)).toBe(GUTTER);
        expect(gutterOf(2)).toBe(GUTTER * 2);
    });

    // the reason gutters scale in composeSection rather than in scaleTokens: contentW is what
    // children size against, so it has to already account for the scaled padding
    it("narrows the content width children measure against, so splits stack sooner", () => {
        const split = sectionOf(
            rowGroup([inst("text", { text: "Left" }), inst("text", { text: "Right" })], [0.6, 0.4]),
        );
        const dirAt = (k: number): string | undefined =>
            contentOf(composeSection(split, layoutCtx(700, scaled(k), tokens))).direction;
        expect(dirAt(1)).toBe("row"); // 700 − 72 − 28 = 600 of content, over deck's 520
        expect(dirAt(2)).toBe("col"); // gutters double → 700 − 144 − 56 = 500, under 520
    });
});
