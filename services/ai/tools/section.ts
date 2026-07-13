import { z } from "zod";
import type { Section } from "@model/artifact";
import { register } from "./registry";
import { chatAddSection, chatEditSection } from "../run";

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

export const editArtifactTool = register({
    id: "edit-artifact",
    describe:
        "Rewrite a section of one of the user's OTHER artifacts — one that is NOT currently open — found via find-artifacts and inspected via read-artifact. Use it to change a specific library artifact from here (e.g. 'make the intro of my Aria deck punchier'). Returns a proposal the user applies; applying saves to that artifact.",
    input: z.object({
        artifactId: z.string().describe("the target artifact id (from find-artifacts)"),
        sectionId: z.string().describe("the id of the section to rewrite (from read-artifact)"),
        instruction: z.string().describe("what to change about that section"),
    }),
    async *run(
        input,
        ctx,
    ): AsyncGenerator<
        never,
        { artifactId: string; section: Section; theme: string; format: string }
    > {
        if (!ctx.workspace) throw new Error("there is no library access in this context");
        const found = await ctx.workspace.read(input.artifactId);
        if (!found) throw new Error("that artifact was not found");
        const section = await chatEditSection(found.content, input.sectionId, input.instruction, {
            image: ctx.image,
            signal: ctx.signal,
        });
        if (!section) throw new Error(`there is no section "${input.sectionId}"`);
        return {
            artifactId: input.artifactId,
            section,
            theme: found.content.theme,
            format: found.content.format,
        };
    },
});
