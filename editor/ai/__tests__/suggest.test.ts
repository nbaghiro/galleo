import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import { suggestSections } from "@editor/ai/suggest";

// Only the pure, zero-cost gap analysis is tested (fetchSuggestions / cacheKey are seams — skipped). Builds
// small artifacts and asserts the ranked, deduped, capped output.

const el = (type: string, children?: ElementInstance[]): ElementInstance =>
    children ? inst(type, { children }) : inst(type, {});
const artWith = (...roots: ElementInstance[]): ArtifactContent =>
    artifactOf(roots.map((r, i) => sectionOf(r, { id: `s${i + 1}` })));
const textish = (): ElementInstance => inst("text", { text: "Hi" });

describe("suggestSections", () => {
    it("ranks the heaviest missing gaps first for a thin artifact", () => {
        expect(suggestSections(artWith(textish()))).toEqual([
            "Add the key numbers as stats",
            "Add a closing call-to-action",
            "Add a customer quote",
            "Visualize a trend in a chart",
            "Add a comparison table",
            "Show the process as a diagram",
        ]);
    });

    it("a missing kind outranks a present one; a present kind drops its 'missing' suggestion", () => {
        expect(suggestSections(artWith(textish()))[0]).toBe("Add the key numbers as stats");
        const withStat = suggestSections(artWith(el("stat", [inst("text", { text: "30s" })])));
        expect(withStat).not.toContain("Add the key numbers as stats");
    });

    it("a present quote flips the rule to the 'another voice' angle", () => {
        const withQuote = suggestSections(artWith(el("quote", [inst("text", { text: "q" })])));
        expect(withQuote).toContain("Add another voice or testimonial");
        expect(withQuote).not.toContain("Add a customer quote");
    });

    it("evergreen rules stay eligible, so even a content-rich artifact still fills out", () => {
        const rich = artWith(
            el("stat", [inst("text", { text: "x" })]),
            inst("button", {}),
            el("quote", [inst("text", { text: "q" })]),
            inst("chart", {}),
            inst("table", {}),
            inst("diagram", {}),
            inst("card", {}),
        );
        const out = suggestSections(rich);
        expect(out.length).toBeLessThanOrEqual(6);
        expect(out).toContain("Add another voice or testimonial");
        expect(out).toContain("Add a proof or results section");
        expect(out).toContain("Add a “how it works” section");
    });

    it("dedupes and never exceeds n (honouring a smaller n)", () => {
        const out = suggestSections(artWith(textish()), 3);
        expect(out).toHaveLength(3);
        expect(new Set(out).size).toBe(out.length);
    });
});
