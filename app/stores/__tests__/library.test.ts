import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { childrenRaw } from "@model/section";
import {
    FORMATS,
    FORMAT_IDS,
    artifactTitle,
    blankArtifact,
    formatIcon,
    formatLabel,
    formatLabelPlural,
} from "../library";

// Pure library helpers — title extraction, the format label/icon maps, and the blank-artifact factory.
// Zero mocks; the fetch-backed loaders/mutators (loadLibrary, moveArtifact, …) are a later tier.

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
const group = (...children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});
const oneSection = (root: ElementInstance): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [{ id: "s-1", root }],
});

describe("artifactTitle", () => {
    it("uses the first text run of the first section", () => {
        expect(artifactTitle(oneSection(group(text("Hello"), text("World"))))).toBe("Hello");
    });
    it("descends into nested groups for the first buried text", () => {
        expect(artifactTitle(oneSection(group(group(group(text("Deep headline"))))))).toBe(
            "Deep headline",
        );
    });
    it("skips empty/whitespace text nodes and trims the winner", () => {
        expect(artifactTitle(oneSection(group(text("   "), text("  Real title  "))))).toBe(
            "Real title",
        );
    });
    it("clips a >60-char title to 60 chars with an ellipsis", () => {
        const title = artifactTitle(oneSection(text("x".repeat(80))));
        expect(title.length).toBe(60);
        expect(title.endsWith("…")).toBe(true);
    });
    it("leaves an exactly-60-char title unclipped (no ellipsis)", () => {
        const exact = "y".repeat(60);
        expect(artifactTitle(oneSection(text(exact)))).toBe(exact);
    });
    it('falls back to "Untitled" when the first section has no text', () => {
        expect(artifactTitle(oneSection(group()))).toBe("Untitled");
    });
    it('falls back to "Untitled" when there are no sections', () => {
        expect(artifactTitle({ format: "deck", theme: "studio", sections: [] })).toBe("Untitled");
    });
});

describe("formatLabel / formatLabelPlural / formatIcon", () => {
    it("maps ids to display labels (web → Site, else → Deck)", () => {
        expect(formatLabel("web")).toBe("Site");
        expect(formatLabel("doc")).toBe("Doc");
        expect(formatLabel("deck")).toBe("Deck");
        expect(formatLabel("mystery")).toBe("Deck");
    });
    it("pluralizes the labels", () => {
        expect(formatLabelPlural("web")).toBe("Sites");
        expect(formatLabelPlural("doc")).toBe("Docs");
        expect(formatLabelPlural("deck")).toBe("Decks");
    });
    it("maps ids to icon glyph names (web → site, else → deck)", () => {
        expect(formatIcon("web")).toBe("site");
        expect(formatIcon("doc")).toBe("doc");
        expect(formatIcon("deck")).toBe("deck");
        expect(formatIcon("mystery")).toBe("deck");
    });
});

describe("FORMAT_IDS / FORMATS", () => {
    it("derives the ordered id set from the engine profiles", () => {
        expect(FORMAT_IDS).toContain("deck");
        expect(FORMAT_IDS).toContain("doc");
        expect(FORMAT_IDS).toContain("web");
    });
    it("pairs each id with its own label + icon", () => {
        expect(FORMATS).toHaveLength(FORMAT_IDS.length);
        for (const f of FORMATS) {
            expect(f.label).toBe(formatLabel(f.id));
            expect(f.icon).toBe(formatIcon(f.id));
        }
        expect(FORMATS.find((f) => f.id === "web")).toEqual({
            id: "web",
            label: "Site",
            icon: "site",
        });
    });
});

describe("blankArtifact", () => {
    it("builds one empty section with the given format + default theme", () => {
        const a = blankArtifact("web");
        expect(a.format).toBe("web");
        expect(a.theme).toBe("studio");
        expect(a.sections).toHaveLength(1);
        const [section] = a.sections;
        expect(section?.id).toBe("s-1");
        expect(section && childrenRaw(section.root)).toEqual([]);
    });
    it("honors an explicit theme", () => {
        expect(blankArtifact("deck", "brut").theme).toBe("brut");
    });
});
