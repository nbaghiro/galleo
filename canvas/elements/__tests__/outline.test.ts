import "@elements/register";
import { describe, expect, it } from "vitest";
import { OUTLINE_PLACEHOLDER, outlineSection } from "@elements/blueprint";
import { layoutSection } from "@canvas/render/commands";
import { measure, tokens } from "@canvas/testkit";
import { resolveProfile } from "@engine/profile";

const deck = resolveProfile("deck");

// The field map is path arithmetic over composeElement's descent. Assert it against the regions the
// engine really emits, so a change to how columns nest fails here rather than silently unbinding
// the outline's editors.
const painted = (
    plan: Parameters<typeof outlineSection>[0],
): { fields: Record<string, { kind: string }>; ids: Set<string> } => {
    const { section, fields } = outlineSection(plan);
    const { regions } = layoutSection(section, 800, measure, tokens, deck);
    return { fields, ids: new Set(regions.map((r) => r.id)) };
};

describe("outlineSection", () => {
    it("addresses every field to a region the engine actually paints", () => {
        const { fields, ids } = painted({
            id: "s1",
            heading: "The Core Thesis",
            lead: "We do not just build wells.",
            points: ["First move", "Second move"],
        });
        for (const id of Object.keys(fields)) expect(ids.has(id)).toBe(true);
    });

    it("still addresses correctly when the copy sits in a split column", () => {
        const { fields, ids } = painted({
            id: "s2",
            layout: "split-6040",
            blocks: ["text", "image"],
            heading: "Split section",
            lead: "A lead line.",
            points: ["Only point"],
        });
        for (const id of Object.keys(fields)) expect(ids.has(id)).toBe(true);
        expect(Object.values(fields)).toEqual([
            { kind: "heading" },
            { kind: "lead" },
            { kind: "point", index: 0 },
        ]);
    });

    it("skips media columns so copy never lands in an image", () => {
        const { fields, ids } = painted({
            id: "s3",
            layout: "split-4060",
            blocks: ["image", "text"],
            heading: "Media first",
            points: ["A point"],
        });
        for (const id of Object.keys(fields)) expect(ids.has(id)).toBe(true);
        // copy is in column 1, so the heading is addressed under it, not under the image
        expect(Object.keys(fields)[0]).toBe("el:s3:1.0");
    });

    it("carries the outline's own words into the section", () => {
        const { section } = outlineSection({
            id: "s4",
            heading: "Real heading",
            lead: "Real lead",
            points: ["Real point"],
        });
        const json = JSON.stringify(section);
        expect(json).toContain("Real heading");
        expect(json).toContain("Real lead");
        expect(json).toContain("Real point");
    });

    it("paints a placeholder for an empty field so the region stays tappable", () => {
        const { fields, ids } = painted({ id: "s5" });
        for (const id of Object.keys(fields)) expect(ids.has(id)).toBe(true);
        const json = JSON.stringify(outlineSection({ id: "s5" }).section);
        expect(json).toContain(OUTLINE_PLACEHOLDER.heading);
        expect(json).toContain(OUTLINE_PLACEHOLDER.point);
    });

    it("addresses one region per point", () => {
        const { fields } = painted({ id: "s6", points: ["a", "b", "c"] });
        const pts = Object.values(fields).filter((f) => f.kind === "point");
        expect(pts).toHaveLength(3);
    });
});
