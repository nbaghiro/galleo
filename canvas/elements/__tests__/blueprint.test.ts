import { describe, expect, it } from "vitest";
import "@elements/register";
import { outlineSection, placeholderBlock, placeholderSection } from "@elements/blueprint";
import { layoutOutline } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { measure, tokens } from "@canvas/testkit";
import { childrenRaw } from "@model/artifact";

describe("placeholderBlock", () => {
    it("maps a block kind to its stand-in element", () => {
        expect(placeholderBlock("image").type).toBe("media");
        expect(placeholderBlock("stat").type).toBe("stat");
        expect(placeholderBlock("chart").type).toBe("chart");
        expect(placeholderBlock("table").type).toBe("table");
        expect(placeholderBlock("cards").type).toBe("container");
    });
    it("falls back to a text-block group for an unknown kind", () => {
        const b = placeholderBlock("mystery");
        expect(b.type).toBe("container");
        expect(childrenRaw(b)?.every((c) => c.type === "text")).toBe(true);
    });
});

describe("placeholderSection", () => {
    it("builds one column per block using the layout preset", () => {
        const cols = childrenRaw(
            placeholderSection({ id: "s", layout: "split-6040", blocks: ["stat", "chart"] }).root,
        )!;
        expect(cols).toHaveLength(2);
        expect(cols[0]!.type).toBe("stat");
        expect(cols[1]!.type).toBe("chart");
    });
    it("a single-column plan has no wrapping row", () => {
        expect(placeholderSection({ id: "s", layout: "full", blocks: ["quote"] }).root.type).toBe(
            "quote",
        );
    });
    it("guesses a trailing image column when plan.image is set", () => {
        const cols = childrenRaw(
            placeholderSection({ id: "s", layout: "two-col", image: true }).root,
        )!;
        expect(cols).toHaveLength(2);
        expect(cols[cols.length - 1]!.type).toBe("media");
    });
});

describe("outlineSection as painted", () => {
    const painted = (): string[] => {
        const card = outlineSection({
            id: "s1",
            layout: "split-6040",
            blocks: ["text", "stat"],
            image: false,
            heading: "Networks by the numbers",
            lead: "Modern scale turns theory into a bottleneck.",
            points: ["Six degrees of separation", "A trillion links mapped"],
        });
        const out = layoutOutline(
            card.section,
            card.copyId,
            900,
            measure,
            tokens,
            resolveProfile("deck"),
        );
        return out.commands.flatMap((c) => (c.kind === "text" ? [c.text.text] : []));
    };

    it("paints the plan's own words", () => {
        const text = painted();
        expect(text).toContain("Networks by the numbers");
        expect(text.some((t) => t.includes("Six degrees"))).toBe(true);
    });

    it("paints no stand-in copy for the blocks it only knows the shape of", () => {
        const text = painted().join(" ");
        expect(text).not.toContain("92%");
        expect(text).not.toContain("key metric");
    });
});
