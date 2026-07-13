import { describe, expect, it } from "vitest";
import { placeholderBlock, placeholderSection } from "@elements/blueprint";
import { childrenRaw } from "@model/section";

describe("placeholderBlock", () => {
    it("maps a block kind to its stand-in element", () => {
        expect(placeholderBlock("image").type).toBe("image");
        expect(placeholderBlock("stat").type).toBe("stat");
        expect(placeholderBlock("chart").type).toBe("chart");
        expect(placeholderBlock("table").type).toBe("table");
        expect(placeholderBlock("cards").type).toBe("group");
    });
    it("falls back to a text-block group for an unknown kind", () => {
        const b = placeholderBlock("mystery");
        expect(b.type).toBe("group");
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
        expect(cols[cols.length - 1]!.type).toBe("image");
    });
});
