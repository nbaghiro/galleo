import { describe, expect, it } from "vitest";
import type { GenerateInput } from "@model/ai";
import type { ArtifactContent, Section } from "@model/artifact";
import type { Beat, Outline } from "../schema";
import { outlineParts, sectionParts } from "../prompts/generate";
import { retrievedContext, sectionText, writtenContext } from "../prompts/system";

const brief = (over: Partial<GenerateInput> = {}): GenerateInput => ({
    prompt: "A launch deck for Meridian",
    surface: "deck",
    theme: "studio",
    ...over,
});

const beat = (id: string, label = id): Beat => ({
    id,
    label,
    role: "proof",
    brief: `the ${label} beat`,
});

const outline: Outline = {
    title: "Meridian",
    backdrop: "a harbor at dusk",
    beats: [beat("s1", "Cover"), beat("s2", "Proof"), beat("s3", "Close")],
};

const section = (id: string, texts: string[]): Section => ({
    id,
    root: {
        type: "group",
        data: {
            direction: "col",
            children: texts.map((text) => ({ type: "text", data: { text } })),
        },
    },
});

const content = (...sections: Section[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections,
});

describe("source material reaches both readers", () => {
    const src = "Revenue was €4.8M in Q2, per the pilot with Ørsted.";
    it("the outline distills it", () => {
        const out = outlineParts(brief({ source: src }));
        expect(out.prompt).toContain("build the piece FROM this");
        expect(out.prompt).toContain("€4.8M");
    });
    it("every section write can quote it", () => {
        const out = sectionParts(brief({ source: src }), outline.beats[1]!, outline);
        expect(out.prompt).toContain("the exact numbers, names, dates, and phrasing");
        expect(out.prompt).toContain("€4.8M");
    });
    it("says nothing about a source when there is none", () => {
        expect(sectionParts(brief(), outline.beats[1]!, outline).prompt).not.toContain(
            "Source material",
        );
    });
    it("clips both views at the same window", () => {
        const long = "x".repeat(9000);
        for (const p of [
            outlineParts(brief({ source: long })).prompt,
            sectionParts(brief({ source: long }), outline.beats[1]!, outline).prompt,
        ]) {
            expect(p).toContain("x".repeat(6000) + "…");
            expect(p).not.toContain("x".repeat(6001));
        }
    });
});

describe("the piece so far reaches every later section write", () => {
    const built = content(
        section("s1", ["Meridian", "Calm software for solo studios"]),
        section("s2", ["We call failures 41 days out"]),
    );
    it("lists every written section's words, not just its first line", () => {
        const out = sectionParts(brief(), outline.beats[2]!, outline, { content: built });
        expect(out.prompt).toContain("The piece so far");
        expect(out.prompt).toContain("[s1] Meridian · Calm software for solo studios");
        expect(out.prompt).toContain("[s2] We call failures 41 days out");
    });
    it("excludes the beat being written, so a regeneration isn't anchored by its old take", () => {
        const out = sectionParts(brief(), outline.beats[1]!, outline, { content: built });
        expect(out.prompt).toContain("[s1]");
        expect(out.prompt).not.toContain("[s2]");
    });
    it("says nothing when nothing is written yet", () => {
        expect(sectionParts(brief(), outline.beats[0]!, outline).prompt).not.toContain(
            "The piece so far",
        );
        expect(writtenContext(content(), "s1")).toBeUndefined();
    });
    it("clips each section so one long one can't crowd out the rest", () => {
        const long = writtenContext(
            content(section("s1", ["y".repeat(900)]), section("s2", ["short"])),
        );
        expect(long).toContain("…");
        expect(long).toContain("[s2] short");
        expect(long!.length).toBeLessThan(1000);
    });
    it("marks a text-free section instead of dropping it silently", () => {
        const visual: Section = { id: "s9", root: { type: "image", data: { src: "a harbor" } } };
        expect(writtenContext(content(visual))).toContain("[s9] (a visual section — no text)");
    });
});

describe("sectionText", () => {
    it("walks the whole tree in document order", () => {
        expect(sectionText(section("s1", ["a", "b", "c"]))).toBe("a · b · c");
    });
});

describe("retrieved context reaches both readers", () => {
    const pack = "From Q3 report (an uploaded file):\n> Churn fell to 2% after the Ørsted pilot.";
    it("the outline sees the retrieved excerpts", () => {
        const out = outlineParts(brief(), undefined, pack);
        expect(out.prompt).toContain("Retrieved from the attached contexts");
        expect(out.prompt).toContain("Churn fell to 2%");
    });
    it("a section write sees its own beat's excerpts", () => {
        const out = sectionParts(brief(), outline.beats[1]!, outline, { pack });
        expect(out.prompt).toContain("Retrieved from the attached contexts");
        expect(out.prompt).toContain("never contradict them");
        expect(out.prompt).toContain("Churn fell to 2%");
    });
    it("says nothing when nothing was retrieved", () => {
        expect(outlineParts(brief()).prompt).not.toContain("Retrieved from");
        expect(retrievedContext(null)).toBeUndefined();
        expect(retrievedContext("   ")).toBeUndefined();
    });
});
