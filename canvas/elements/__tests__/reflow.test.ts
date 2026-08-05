import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import { composeSection } from "@elements/compose";
import { rowGroup } from "@model/section";
import { resolveProfile } from "@engine/profile";
import { inst, layoutCtx, sectionOf } from "@canvas/testkit";

// section → [inner] → [content]
const contentOf = (section: EngineNode): EngineNode => section.children![0]!.children![0]!;

const split = () =>
    sectionOf(
        rowGroup([inst("text", { text: "Left" }), inst("image", { src: "a.png" })], [0.6, 0.4]),
    );

// section layout width, not viewport: composeSection subtracts 36px padding a side + a 14px gutter
const composedAt = (width: number, format: string): EngineNode =>
    contentOf(composeSection(split(), layoutCtx(width, resolveProfile(format))));

describe("split reflow", () => {
    it("keeps a doc split as columns when the content column clears splitMinWidth", () => {
        // 1000 − 72 − 28 = 900 of content, over doc's 560
        expect(composedAt(1000, "doc").direction).toBe("row");
    });

    it("stacks a doc split on a phone-width section", () => {
        // a 390px viewport yields a 326px section → 226 of content, under doc's 560
        expect(composedAt(326, "doc").direction).toBe("col");
    });

    it("stacks a web split on a tablet-portrait section, which doc still splits", () => {
        // web bleeds full width (768) → 668 of content, under web's 720 but over doc's 560
        expect(composedAt(768, "web").direction).toBe("col");
        expect(composedAt(704, "doc").direction).toBe("row");
    });

    it("never stacks a deck, which lays out at its fixed page width", () => {
        expect(composedAt(1280, "deck").direction).toBe("row");
    });

    it("drops column fractions once stacked, so each block owns the full width", () => {
        const wide = composedAt(1000, "doc");
        expect(wide.children!.map((c) => c.w.mode)).toEqual(["percent", "percent"]);

        const narrow = composedAt(326, "doc");
        expect(narrow.children!.map((c) => c.w.mode)).toEqual(["grow", "grow"]);
    });

    it("leaves a genuine column alone at every width", () => {
        const col = sectionOf(inst("text", { text: "Solo" }));
        for (const w of [326, 1000]) {
            const node = contentOf(composeSection(col, layoutCtx(w, resolveProfile("doc"))));
            expect(node.direction).not.toBe("row");
        }
    });
});
