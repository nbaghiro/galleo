import type { Section } from "@model/artifact";
import type { ArtifactContent } from "@model/artifact";
import type { Beat, SectionPlan } from "../schema";
import type { SectionInput } from "@model/ai";
import { implement, type ToolContext } from "../tools";
import { insertSectionParts, sectionPlanParts, editSectionParts } from "../prompts/generate";
import { surfaceOf } from "../prompts/generate";
import { resolveImages } from "../images";
import { planSectionTool, writeSectionTool } from "./plan";
import { drain } from "../tools";

// fresh non-colliding section id — mirror the editor's "s-xxxx" scheme
export function newSectionId(content: ArtifactContent): string {
    const taken = new Set(content.sections.map((s) => s.id));
    for (let n = content.sections.length + 1; ; n++) {
        const id = `s-${n}`;
        if (!taken.has(id)) return id;
    }
}

async function chatAddSection(
    content: ArtifactContent,
    afterId: string | null,
    instruction: string,
    ctx: ToolContext,
): Promise<Section> {
    const input: SectionInput = { instruction, afterId, content };
    const id = newSectionId(content);
    const object = await drain(ctx.use(planSectionTool, sectionPlanParts(input)));
    const beat: Beat = { ...(object as SectionPlan), id };
    const section = await drain(
        ctx.use(writeSectionTool, {
            parts: insertSectionParts(input, beat),
            id: id,
            label: beat.label,
            surface: surfaceOf(content.format),
        }),
    );
    return resolveImages(section, ctx.image);
}

async function chatEditSection(
    content: ArtifactContent,
    sectionId: string,
    instruction: string,
    ctx: ToolContext,
): Promise<Section | null> {
    const current = content.sections.find((s) => s.id === sectionId);
    if (!current) return null;
    const section = await drain(
        ctx.use(writeSectionTool, {
            parts: editSectionParts(content, current, instruction),
            id: sectionId,
            label: sectionId,
            surface: surfaceOf(content.format),
        }),
    );
    return resolveImages(section, ctx.image);
}

export const addSectionTool = implement("add-section", async function* (input, ctx) {
    if (!ctx.artifact) throw new Error("no artifact is open");
    return await chatAddSection(ctx.artifact, input.afterId, input.instruction, ctx);
});

export const rewriteSectionTool = implement("rewrite-section", async function* (input, ctx) {
    if (!ctx.artifact) throw new Error("no artifact is open");
    const section = await chatEditSection(ctx.artifact, input.sectionId, input.instruction, ctx);
    if (!section) throw new Error(`there is no section "${input.sectionId}"`);
    return section;
});

export const editArtifactTool = implement(
    "edit-artifact",
    async function* (
        input,
        ctx,
    ): AsyncGenerator<
        never,
        { artifactId: string; section: Section; theme: string; format: string }
    > {
        if (!ctx.workspace) throw new Error("there is no library access in this context");
        const found = await ctx.workspace.read(input.artifactId);
        if (!found) throw new Error("that artifact was not found");
        const section = await chatEditSection(
            found.content,
            input.sectionId,
            input.instruction,
            ctx,
        );
        if (!section) throw new Error(`there is no section "${input.sectionId}"`);
        return {
            artifactId: input.artifactId,
            section,
            theme: found.content.theme,
            format: found.content.format,
        };
    },
);
