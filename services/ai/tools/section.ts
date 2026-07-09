import { z } from "zod";
import { register } from "./registry";
import { chatAddSection, chatEditSection } from "../run";

// The section tools — thin wrappers that expose the existing runtimes as registry tools. `run` yields no
// progress (the underlying calls are atomic) and RETURNS the produced Section, which each surface presents
// its own way (the chat agent → a proposal block; a direct call → an addSection/replaceSection patch).

export const addSectionTool = register({
    id: "add-section",
    describe:
        "Generate ONE new section for the open artifact and return it for insertion. afterId = the section id it should follow (null = at the end).",
    input: z.object({
        afterId: z
            .string()
            .nullable()
            .describe("the section id to insert after, or null for the end"),
        instruction: z.string().describe("what the new section should be about"),
    }),
    async *run(input, ctx) {
        if (!ctx.artifact) throw new Error("no artifact is open");
        return await chatAddSection(ctx.artifact, input.afterId, input.instruction, {
            image: ctx.image,
            signal: ctx.signal,
        });
    },
});

export const rewriteSectionTool = register({
    id: "rewrite-section",
    describe:
        "Rewrite an existing section to satisfy an instruction and return the revised section. sectionId = the id from the section map.",
    input: z.object({
        sectionId: z.string().describe("the id of the section to rewrite"),
        instruction: z.string().describe("what to change about it"),
    }),
    async *run(input, ctx) {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const section = await chatEditSection(ctx.artifact, input.sectionId, input.instruction, {
            image: ctx.image,
            signal: ctx.signal,
        });
        if (!section) throw new Error(`there is no section "${input.sectionId}"`);
        return section;
    },
});
