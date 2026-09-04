import type { Section } from "@model/artifact";
import type { ArtifactContent } from "@model/artifact";
import type { Beat, SectionPlan } from "@services/core/ai/schema";
import type { SectionInput, TurnEvent } from "@model/ai";
import { implement, type ToolContext } from "@services/core/ai/tools";
import {
    insertSectionParts,
    sectionPlanParts,
    editSectionParts,
} from "@services/core/ai/prompts/generate";
import { surfaceOf } from "@services/core/ai/prompts/generate";
import { resolveImages } from "@services/core/ai/images";
import { planSectionTool, writeSectionTool } from "./plan";
import { drain } from "@services/core/ai/tools";
import { firstText } from "@services/core/ai/prompts/system";

// fresh non-colliding section id — mirror the editor's "s-xxxx" scheme
export function newSectionId(content: ArtifactContent): string {
    const taken = new Set(content.sections.map((s) => s.id));
    for (let n = content.sections.length + 1; ; n++) {
        const id = `s-${n}`;
        if (!taken.has(id)) return id;
    }
}

// plan the one section (so the skeleton renders), write it, then place it after `afterId`
async function* addSection(
    content: ArtifactContent,
    afterId: string | null,
    instruction: string,
    ctx: ToolContext,
): AsyncGenerator<TurnEvent, Section> {
    const input: SectionInput = { instruction, afterId, content };
    const id = newSectionId(content);
    const surface = surfaceOf(content.format);
    yield { type: "phase", name: "intake" };
    yield {
        type: "narration",
        text: "Reading the surrounding sections",
        sub: instruction.length > 90 ? `${instruction.slice(0, 89)}…` : instruction,
    };
    yield { type: "phase", name: "outline" };
    const object = await drain(ctx.use(planSectionTool, sectionPlanParts(input)));
    const beat: Beat = { ...(object as SectionPlan), id };
    yield { type: "plan", beats: [beat] };
    yield { type: "narration", text: `Planned “${beat.label}”`, mono: ` · ${beat.role}` };
    yield { type: "phase", name: "build" };
    yield { type: "section.status", id, status: "active" };
    yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
    yield { type: "section.status", id, status: "writing" };
    const written = yield* ctx.use(writeSectionTool, {
        parts: insertSectionParts(input, beat),
        id,
        label: beat.label,
        surface,
    });
    if (beat.image || written.background?.kind === "image") {
        yield { type: "section.status", id, status: "image" };
        yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
    }
    const section = await resolveImages(written, ctx.image);
    yield { type: "phase", name: "compose" };
    yield { type: "section.status", id, status: "done" };
    return section;
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

implement(
    "add-section",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Section> {
        if (!ctx.artifact) throw new Error("no artifact is open");
        return yield* addSection(ctx.artifact, input.afterId, input.instruction, ctx);
    },
    {
        patch: (section, input) => ({
            artifact: [{ op: "addSection", afterId: input.afterId, section }],
        }),
        note: (section, input) =>
            `Proposed a new “${firstText(section)}” section${input.afterId ? ` after ${input.afterId}` : ""}.`,
    },
);

implement(
    "rewrite-section",
    async function* (input, ctx) {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const section = await chatEditSection(
            ctx.artifact,
            input.sectionId,
            input.instruction,
            ctx,
        );
        if (!section) throw new Error(`there is no section "${input.sectionId}"`);
        return section;
    },
    {
        patch: (section, input) => ({
            artifact: [{ op: "replaceSection", id: input.sectionId, section }],
        }),
        note: (_section, input) => `Proposed a rewrite of section ${input.sectionId}.`,
    },
);

implement(
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
    {
        patch: (res, input) => ({
            artifact: [{ op: "replaceSection", id: input.sectionId, section: res.section }],
        }),
        // the target is another artifact, so the card carries its id and its look
        present: (res, input, patches) => ({
            type: "proposal",
            id: crypto.randomUUID(),
            tool: "edit-artifact",
            summary: `Update “${firstText(res.section).slice(0, 40)}”`,
            patch: patches[0] ?? {
                artifact: [{ op: "replaceSection", id: input.sectionId, section: res.section }],
            },
            preview: res.section,
            targetArtifactId: res.artifactId,
            theme: res.theme,
            format: res.format,
        }),
        note: (_res, input) =>
            `Proposed an edit to a section of that artifact (${input.sectionId}).`,
    },
);
