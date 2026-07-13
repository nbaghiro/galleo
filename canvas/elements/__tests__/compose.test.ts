import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import { GUTTER, composeSection, sectionContentTokens } from "@elements/compose";
import { emptyRegion, rowGroup } from "@model/section";
import { layout } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { commandById, inst, layoutCtx, measure, sectionOf, tokens } from "@canvas/testkit";

// section → [inner] → [content]
const contentOf = (section: EngineNode): EngineNode => section.children![0]!.children![0]!;

const deckCtx = layoutCtx(800, resolveProfile("deck"));
const webCtx = layoutCtx(1200, resolveProfile("web"));
const textRoot = (): ReturnType<typeof inst> => inst("text", { text: "Hello" });

describe("sectionContentTokens", () => {
    it("returns the base theme over a light background", () => {
        const s = sectionOf(textRoot(), { background: { kind: "none" } });
        expect(sectionContentTokens(s, tokens)).toBe(tokens);
    });
    it("switches to light-on-dark tokens over a dark background", () => {
        const s = sectionOf(textRoot(), { background: { kind: "color", color: "#111111" } });
        expect(sectionContentTokens(s, tokens).ink).toBe("#ffffff");
    });
});

describe("composeSection", () => {
    it("tags the section region id", () => {
        expect(composeSection(sectionOf(textRoot()), deckCtx).id).toBe("section:s1");
    });

    it("a framed deck section on a light color wears a border + radius", () => {
        const node = composeSection(
            sectionOf(textRoot(), { background: { kind: "color", color: "#ffffff" } }),
            deckCtx,
        );
        expect(node.fill?.color).toBe("#ffffff");
        expect(typeof node.fill?.radius).toBe("number");
        expect(node.fill?.border).toBeDefined();
    });

    it("a dark section drops the delineation border but keeps its fill", () => {
        const node = composeSection(
            sectionOf(textRoot(), { background: { kind: "color", color: "#111111" } }),
            deckCtx,
        );
        expect(node.fill?.color).toBe("#111111");
        expect(node.fill?.border).toBeUndefined();
    });

    it("a full-bleed section merges into the page (radius 0, no border)", () => {
        const node = composeSection(
            sectionOf(textRoot(), { bleed: true, background: { kind: "color", color: "#ffffff" } }),
            deckCtx,
        );
        expect(node.fill?.radius).toBe(0);
        expect(node.fill?.border).toBeUndefined();
    });

    it("a web (continuous) section centers a capped column with no card radius", () => {
        const node = composeSection(sectionOf(textRoot()), webCtx);
        expect(node.alignX).toBe("center");
        expect(node.fill?.radius).toBeUndefined();
    });

    it("an image background paints as a cover image with a scrim", () => {
        const node = composeSection(
            sectionOf(textRoot(), { background: { kind: "image", image: "bg.png" } }),
            deckCtx,
        );
        expect(node.image?.src).toBe("bg.png");
        expect(node.image?.fit).toBe("cover");
        expect(node.image?.scrim).toBeGreaterThan(0);
    });

    it("a gradient background paints as a gradient fill", () => {
        const node = composeSection(
            sectionOf(textRoot(), {
                background: { kind: "gradient", gradient: { from: "#fff", to: "#000" } },
            }),
            deckCtx,
        );
        expect(node.fill?.gradient).toEqual({ from: "#fff", to: "#000" });
    });

    it("GUTTER is the section content inset", () => {
        expect(GUTTER).toBe(14);
    });

    it("clips its content to the section box on the horizontal axis (the containment boundary)", () => {
        expect(composeSection(sectionOf(textRoot()), deckCtx).clip).toEqual({ x: true });
    });

    it("crops an over-100% column row at the section edge instead of spilling past the card", () => {
        // two 70% columns = 140% → the second overflows the row (percent can't shrink); the clip must contain it
        const section = sectionOf(
            rowGroup([inst("text", { text: "L" }), inst("text", { text: "R" })], [0.7, 0.7]),
        );
        const W = 400;
        const { commands } = layout(
            composeSection(section, deckCtx),
            { x: 0, y: 0, w: W, h: 400 },
            measure,
        );
        const overflowing = commandById(commands, "el:s1:1");
        // the column's own box overflows past the section's right edge...
        expect(overflowing.box.x + overflowing.box.w).toBeGreaterThan(W);
        // ...but its clip is bounded to the section box, so nothing paints past the card edge.
        expect(overflowing.clip).toBeDefined();
        expect(overflowing.clip!.x + overflowing.clip!.w).toBeLessThanOrEqual(W + 0.5);
    });
});

describe("composeElement (via composeSection)", () => {
    it("applies per-instance layout — fill width + radius override — to the element", () => {
        const s = sectionOf(inst("image", { src: "x.png" }, { width: "fill", radius: 20 }));
        const content = contentOf(composeSection(s, deckCtx));
        expect(content.w.mode).toBe("grow"); // width: "fill"
        expect(content.image?.radius).toBe(20); // radius override
    });

    it("composes an empty container as the dashed drop-region placeholder", () => {
        const content = contentOf(composeSection(sectionOf(emptyRegion()), deckCtx));
        expect(content.fill?.border?.style).toBe("dashed");
    });

    it("composes an unknown element type as a red error box", () => {
        const content = contentOf(composeSection(sectionOf(inst("does-not-exist")), deckCtx));
        expect(content.fill?.color).toBe("#f6dede");
    });
});
