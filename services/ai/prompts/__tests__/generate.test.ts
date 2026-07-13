import { describe, it, expect } from "vitest";
import type { GenerateInput, SectionInput } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { BLOCK_KINDS } from "@model/elements";
import type { Beat, Outline } from "../../schema";
import {
    editSectionParts,
    insertSectionParts,
    outlineParts,
    reviseElementParts,
    sectionParts,
    sectionPlanParts,
    surfaceOf,
} from "../generate";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title: string): Section => ({
    id,
    root: { type: "group", data: { children: [txt(title)] } },
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
});

describe("sectionParts", () => {
    it("embeds the full arc, flagging the current beat", () => {
        const out = sectionParts(input, outline.beats[1]!, outline);
        expect(out.prompt).toContain("1. Cover");
        expect(out.prompt).toContain("2. Middle  ← writing this");
        expect(out.prompt).not.toContain("1. Cover  ← writing this");
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
