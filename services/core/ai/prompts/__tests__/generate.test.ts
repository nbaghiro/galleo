import { describe, it, expect } from "vitest";
import type { GenerateInput, SectionInput } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { BLOCK_KINDS } from "@model/elements";
import type { Beat, Outline } from "@services/core/ai/schema";
import {
    editSectionParts,
    insertSectionParts,
    outlineParts,
    relayoutSectionParts,
    reviseElementParts,
    sectionCopyInventory,
    sectionParts,
    sectionPlanParts,
    surfaceOf,
} from "@services/core/ai/prompts/generate";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title: string): Section => ({
    id,
    root: { type: "container", data: { children: [txt(title)] } },
});

const content: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [sec("s1", "Title"), sec("s2", "Thesis"), sec("s3", "Body")],
};

const input: GenerateInput = { prompt: "Sell widgets", surface: "deck", theme: "studio" };

const outline: Outline = {
    title: "My Title",
    backdrop: "a moody dusk skyline",
    beats: [
        { id: "s1", label: "Cover", role: "scene", layout: "full", blocks: ["text"] },
        {
            id: "s2",
            label: "Middle",
            role: "proof",
            layout: "split-6040",
            blocks: ["text", "image"],
        },
        { id: "s3", label: "Close", role: "close" },
    ],
};

describe("surfaceOf", () => {
    it("passes doc and web through", () => {
        expect(surfaceOf("doc")).toBe("doc");
        expect(surfaceOf("web")).toBe("web");
    });
    it("maps deck and anything else to deck", () => {
        expect(surfaceOf("deck")).toBe("deck");
        expect(surfaceOf("slideshow")).toBe("deck");
    });
});

describe("outlineParts", () => {
    it("lists every BLOCK_KIND in the system prompt", () => {
        const { system } = outlineParts(input);
        for (const kind of BLOCK_KINDS) expect(system).toContain(kind);
    });
    it("ends the prompt with the produce-now instruction", () => {
        expect(outlineParts(input).prompt.trimEnd().endsWith("Produce the outline now.")).toBe(
            true,
        );
    });
    it("omits source material when input.source is unset", () => {
        expect(outlineParts(input).prompt).not.toContain("Source material");
    });
    it("includes source material only when input.source is set", () => {
        const out = outlineParts({ ...input, source: "raw pasted facts" });
        expect(out.prompt).toContain("Source material");
        expect(out.prompt).toContain("raw pasted facts");
    });
    it("lists must-cover points and demands verbatim `covers` tagging when given", () => {
        const out = outlineParts({ ...input, mustInclude: ["the team", "pricing tiers"] });
        expect(out.prompt).toContain("- pricing tiers");
        expect(out.prompt).toContain("VERBATIM from the list");
        expect(out.prompt).toContain("Echo that same list back");
    });
    // with no points from the user the planner names its own, so coverage works on every run
    it("asks the planner to name its own must-cover points when none were given", () => {
        const out = outlineParts(input).prompt;
        expect(out).toContain("`covers`");
        expect(out).toContain("Name the 2–5 points");
        expect(out).not.toContain("VERBATIM from the list");
    });
    it("asks for the reading — goal, audience and tone — in the outline itself", () => {
        const out = outlineParts(input).system;
        expect(out).toContain("`goal`");
        expect(out).toContain("`audience`");
        expect(out).toContain("`tone`");
    });
});

describe("sectionParts", () => {
    // the ids are load-bearing, not decoration: a nav link or a hero CTA has to name a real one
    it("embeds the full arc with every section id, flagging the current beat", () => {
        const out = sectionParts(input, outline.beats[1]!, outline);
        expect(out.prompt).toContain("1. [s1] Cover");
        expect(out.prompt).toContain("2. [s2] Middle  ← writing this");
        expect(out.prompt).not.toContain("1. [s1] Cover  ← writing this");
    });
    it("echoes the beat's assigned layout", () => {
        expect(sectionParts(input, outline.beats[1]!, outline).prompt).toContain("split-6040");
    });
    it("renders the per-column block plan when the beat has blocks", () => {
        const out = sectionParts(input, outline.beats[1]!, outline);
        expect(out.prompt).toContain("column 1: text, column 2: image");
    });
    it("omits the block plan when the beat has no blocks", () => {
        const out = sectionParts(input, outline.beats[2]!, outline);
        expect(out.prompt).not.toContain("Fill the columns in this exact order");
    });
    it("marks beat index 0 as the cover", () => {
        expect(sectionParts(input, outline.beats[0]!, outline).prompt).toContain(
            "This is the COVER",
        );
    });
    it("marks the last beat as the closing section", () => {
        expect(sectionParts(input, outline.beats[2]!, outline).prompt).toContain(
            "This is the CLOSING section",
        );
    });
    it("addresses the correct section id in the closing instruction", () => {
        expect(sectionParts(input, outline.beats[1]!, outline).prompt).toContain(
            'Write section "s2" now',
        );
    });
    it("teaches the element catalog in the system half", () => {
        expect(sectionParts(input, outline.beats[0]!, outline).system).toContain("## Elements");
    });
    it("hands the section writer the takeaway and the ordered moves, not just a label", () => {
        const rich = {
            ...outline.beats[1]!,
            takeaway: "The admin tax is the real cost, not the software.",
            points: ["11.3 hours a week lost", "$8,400 sitting unpaid", "47% never forecast"],
        };
        const out = sectionParts(input, rich, { ...outline, beats: [outline.beats[0]!, rich] });
        expect(out.prompt).toContain("The admin tax is the real cost");
        expect(out.prompt).toContain("1. 11.3 hours a week lost");
        expect(out.prompt).toContain("3. 47% never forecast");
    });
    it("says nothing about moves when the beat has none", () => {
        const out = sectionParts(input, outline.beats[2]!, outline);
        expect(out.prompt).not.toContain("Make these moves");
    });

    it("injects the steering note when the session carries one", () => {
        const out = sectionParts(input, outline.beats[1]!, outline, { steer: "fewer bullets" });
        expect(out.prompt).toContain("Steering note");
        expect(out.prompt).toContain("fewer bullets");
        expect(sectionParts(input, outline.beats[1]!, outline).prompt).not.toContain(
            "Steering note",
        );
    });
    it("injects the regenerate note as a fresh-take instruction", () => {
        const out = sectionParts(input, outline.beats[1]!, outline, { note: "more numbers" });
        expect(out.prompt).toContain("previous attempt");
        expect(out.prompt).toContain("more numbers");
    });
});

// The anatomy is a website's, so it rides the surface: teaching a deck about docked topbars would
// spend tokens on a thing a slide has no room for.
describe("the site anatomy reaches exactly the web prompts", () => {
    const webInput: GenerateInput = { ...input, surface: "web" };
    const webContent: ArtifactContent = { ...content, format: "web" };
    const has = (s: string): boolean => s.includes("## How a site is built");

    it("is in the outline plan for web and absent for a deck", () => {
        expect(has(outlineParts(webInput).system)).toBe(true);
        expect(has(outlineParts(input).system)).toBe(false);
    });

    it("is in the section writer for web and absent for a deck", () => {
        expect(has(sectionParts(webInput, outline.beats[0]!, outline).system)).toBe(true);
        expect(has(sectionParts(input, outline.beats[0]!, outline).system)).toBe(false);
    });

    it("reaches the chat paths that add and rewrite a section on a site", () => {
        const sInput: SectionInput = {
            instruction: "add pricing",
            afterId: "s1",
            content: webContent,
        };
        expect(has(sectionPlanParts(sInput).system)).toBe(true);
        expect(has(insertSectionParts(sInput, outline.beats[1]!).system)).toBe(true);
        expect(
            has(editSectionParts(webContent, webContent.sections[0]!, "add a nav link").system),
        ).toBe(true);
    });

    it("hands the web section writer a whole-page exemplar too", () => {
        const web = sectionParts(webInput, outline.beats[0]!, outline).system;
        expect(web).toContain("A whole site in miniature");
        expect(web).toContain('"dock":"top"');
        expect(sectionParts(input, outline.beats[0]!, outline).system).not.toContain(
            "A whole site in miniature",
        );
    });

    it("tells a rewrite and a re-layout to carry the frame and the docked row through", () => {
        expect(
            editSectionParts(webContent, webContent.sections[0]!, "punch up the headline").prompt,
        ).toContain("docked row");
        expect(relayoutSectionParts(webContent, webContent.sections[0]!, "Grid.").prompt).toContain(
            "docked row",
        );
    });
});

describe("sectionPlanParts", () => {
    const sInput: SectionInput = { instruction: "add pricing", afterId: "s1", content };

    it("lists BLOCK_KINDS and grounds the prompt in the artifact spine + instruction", () => {
        const out = sectionPlanParts(sInput);
        for (const kind of BLOCK_KINDS) expect(out.system).toContain(kind);
        expect(out.prompt).toContain('A deck themed "studio".');
        expect(out.prompt).toContain("add pricing");
        expect(out.prompt.trimEnd().endsWith("Plan the one section now.")).toBe(true);
    });
});

describe("insertSectionParts", () => {
    const sInput: SectionInput = { instruction: "add pricing", afterId: "s1", content };
    const beat: Beat = {
        id: "sX",
        label: "Pricing",
        role: "proof",
        layout: "full",
        blocks: ["table"],
    };

    it("carries the one-section brief, the block plan, and the target id", () => {
        const out = insertSectionParts(sInput, beat);
        expect(out.prompt).toContain("This one section: add pricing");
        expect(out.prompt).toContain("column 1: table");
        expect(out.prompt).toContain('Write section "sX" now');
    });
});

describe("editSectionParts", () => {
    it("embeds the instruction, neighbours, the section JSON, and the keep-id rule", () => {
        const out = editSectionParts(content, content.sections[1]!, "make it bolder");
        expect(out.prompt).toContain("make it bolder");
        expect(out.prompt).toContain("Section 2 of 3.");
        expect(out.prompt).toContain('"id":"s2"');
        expect(out.prompt).toContain("keep its id");
        expect(out.system).toContain("## Elements");
    });
});

describe("reviseElementParts", () => {
    const el: ElementInstance = { type: "stat", data: { children: [] } };

    it("uses the instruction branch when an instruction is given", () => {
        const out = reviseElementParts(content, content.sections[1]!, el, "use a bigger number");
        expect(out.prompt).toContain("What to change");
        expect(out.prompt).toContain("use a bigger number");
    });
    it("falls back to a straight re-roll when no instruction is given", () => {
        const out = reviseElementParts(content, content.sections[1]!, el);
        expect(out.prompt).toContain("Regenerate this element");
    });
    it("embeds the element JSON and demands the same type back", () => {
        const out = reviseElementParts(content, content.sections[1]!, el);
        expect(out.prompt).toContain('"type":"stat"');
        expect(out.system).toContain('Keep "type" identical to the original');
    });
});

describe("sectionCopyInventory", () => {
    it("collects text, items and image srcs through nested children", () => {
        const section: Section = {
            id: "s9",
            root: {
                type: "container",
                data: {
                    children: [
                        txt("Headline"),
                        { type: "image", data: { src: "https://x/a.jpg" } },
                        {
                            type: "container",
                            data: {
                                children: [
                                    txt("Nested copy"),
                                    { type: "diagram", data: { type: "process", items: "A, B" } },
                                ],
                            },
                        },
                    ],
                },
            },
        };
        const inv = sectionCopyInventory(section);
        expect(inv.text).toEqual(["Headline", "Nested copy", "A, B"]);
        expect(inv.images).toEqual(["https://x/a.jpg"]);
    });
});

describe("relayoutSectionParts", () => {
    it("carries every copy string verbatim, pins the id, and forbids new images", () => {
        const out = relayoutSectionParts(content, content.sections[1]!, "Grid: parallel cards.");
        expect(out.prompt).toContain("Grid: parallel cards.");
        expect(out.prompt).toContain('- "Thesis"');
        expect(out.prompt).toContain('id "s2"');
        expect(out.prompt).toContain("never reword, trim, or invent copy");
        expect(out.prompt).toContain("no images; do not add any");
    });
    it("folds the user's direction into the arrangement block", () => {
        const out = relayoutSectionParts(content, content.sections[0]!, "Typographic.", "more air");
        expect(out.prompt).toContain("The user adds: more air");
    });
});
