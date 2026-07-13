import { describe, it, expect } from "vitest";
import type { EditInput } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { editParts } from "../edit";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title: string): Section => ({
    id,
    root: { type: "group", data: { children: [txt(title)] } },
});

const content: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [sec("s1", "Title"), sec("s2", "Thesis")],
};

describe("editParts", () => {
    const input: EditInput = { instruction: "make it punchier" };

    it("assembles the persona, surface voice, catalog, and job in the system half", () => {
        const { system } = editParts(input, content);
        expect(system).toContain("Galleo's content designer");
        expect(system).toContain("DECK"); // surfaceVoice(deck)
        expect(system).toContain("## Elements"); // elementCatalog
        expect(system).toContain("## Your job"); // EDIT_JOB
    });

    it("grounds the prompt in the digest, instruction, and the return line", () => {
        const { prompt } = editParts(input, content);
        expect(prompt).toContain("Current artifact");
        expect(prompt).toContain("Instruction");
        expect(prompt).toContain("make it punchier");
        expect(prompt.trimEnd().endsWith("Return the revised artifact.")).toBe(true);
    });
});
