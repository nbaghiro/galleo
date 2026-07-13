import { describe, it, expect } from "vitest";
import type { GenerateInput } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import {
    artifactDigest,
    artifactSpine,
    briefContext,
    heading,
    insertionContext,
    neighbors,
    stack,
} from "../system";

// Pure string assembly — real inputs in, exact structural facts asserted (no mocks).

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title?: string): Section => ({
    id,
    root: title
        ? { type: "group", data: { children: [txt(title)] } }
        : { type: "image", data: { src: "x" } },
});

const content: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [sec("s1", "Title"), sec("s2", "Thesis"), sec("s3", "Body")],
};

describe("stack", () => {
    it("drops falsy fragments and joins the rest with a blank line", () => {
        expect(stack("a", false, "b", undefined, "c")).toBe("a\n\nb\n\nc");
    });
    it("returns an empty string when every fragment is falsy", () => {
        expect(stack(false, undefined, "")).toBe("");
    });
});

describe("heading", () => {
    it("renders a `## title` header above the body", () => {
        expect(heading("Job", "do it")).toBe("## Job\ndo it");
    });
});

describe("briefContext", () => {
    const base: GenerateInput = { prompt: "Sell widgets", surface: "deck", theme: "studio" };

    it("always emits the Prompt line", () => {
        expect(briefContext(base)).toContain("Prompt: Sell widgets");
    });
    it("omits Goal/Audience/Tone/Length when they are unset", () => {
        const out = briefContext(base);
        expect(out).not.toContain("Goal:");
        expect(out).not.toContain("Audience:");
        expect(out).not.toContain("Tone:");
        expect(out).not.toContain("Length:");
    });
    it("emits each optional line only when it is set", () => {
        const out = briefContext({
            ...base,
            goal: "pitch",
            audience: "VCs",
            tone: "bold",
            length: "short",
        });
        expect(out).toContain("Goal: pitch");
        expect(out).toContain("Audience: VCs");
        expect(out).toContain("Tone: bold");
        expect(out).toContain("Length: short");
    });
});

describe("artifactDigest", () => {
    it("emits the format/theme/count header", () => {
        expect(artifactDigest(content)).toContain("format=deck, theme=studio, 3 sections:");
    });
    it("renders one numbered row per section with its id and first-text label", () => {
        const out = artifactDigest(content);
        expect(out).toContain("1. [s1] — Title");
        expect(out).toContain("2. [s2] — Thesis");
    });
    it("labels a text-less section (untitled)", () => {
        const out = artifactDigest({
            ...content,
            sections: [sec("s1")],
        });
        expect(out).toContain("1. [s1] — (untitled)");
    });
    it("truncates a long label to 80 characters", () => {
        const long = "A".repeat(100);
        const out = artifactDigest({ ...content, sections: [sec("s1", long)] });
        expect(out).toContain("A".repeat(80));
        expect(out).not.toContain("A".repeat(81));
    });
});

describe("artifactSpine", () => {
    it("names the format and theme", () => {
        expect(artifactSpine(content)).toContain('A deck themed "studio".');
    });
    it("pulls Title from section 1 and Thesis from section 2", () => {
        const out = artifactSpine(content);
        expect(out).toContain("Title: Title");
        expect(out).toContain("Thesis: Thesis");
    });
    it("omits Thesis when there is no second section", () => {
        const out = artifactSpine({ ...content, sections: [sec("s1", "Only")] });
        expect(out).toContain("Title: Only");
        expect(out).not.toContain("Thesis:");
    });
    it("omits both Title and Thesis when there are no sections", () => {
        const out = artifactSpine({ ...content, sections: [] });
        expect(out).toContain('A deck themed "studio".');
        expect(out).not.toContain("Title:");
        expect(out).not.toContain("Thesis:");
    });
});

describe("neighbors", () => {
    it("returns an empty string when the id is not found", () => {
        expect(neighbors(content, "nope")).toBe("");
    });
    it("names both neighbors for a middle section", () => {
        const out = neighbors(content, "s2");
        expect(out).toContain("Section 2 of 3.");
        expect(out).toContain("Previous: [s1] Title");
        expect(out).toContain("Next: [s3] Body");
    });
    it("omits Previous for the first section", () => {
        const out = neighbors(content, "s1");
        expect(out).not.toContain("Previous:");
        expect(out).toContain("Next: [s2] Thesis");
    });
    it("omits Next for the last section", () => {
        const out = neighbors(content, "s3");
        expect(out).toContain("Previous: [s2] Thesis");
        expect(out).not.toContain("Next:");
    });
});

describe("insertionContext", () => {
    it("marks a null afterId as the very START", () => {
        const out = insertionContext(content, null);
        expect(out).toContain("at the very START");
        expect(out).toContain("right BEFORE: [s1] Title");
    });
    it("marks an insert after the last section as the new closing", () => {
        const out = insertionContext(content, "s3");
        expect(out).toContain("right AFTER: [s3] Body");
        expect(out).toContain("It becomes the new closing section.");
    });
    it("names both neighbors for an interior insertion", () => {
        const out = insertionContext(content, "s1");
        expect(out).toContain("right AFTER: [s1] Title");
        expect(out).toContain("right BEFORE: [s2] Thesis");
    });
});
