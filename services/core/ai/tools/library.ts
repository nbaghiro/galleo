import type { ArtifactRef, TemplateRef, TurnEvent } from "@model/ai";
import { implement } from "../tools";
import { artifactDigest, artifactSpine } from "../prompts/system";
import { TEMPLATE_INDEX } from "@model/templates";

export const findArtifactsTool = implement(
    "find-artifacts",
    async function* (input, ctx): AsyncGenerator<TurnEvent, ArtifactRef[]> {
        if (!ctx.workspace) return [];
        return ctx.workspace.find(input.query?.trim() || undefined);
    },
);

export const readArtifactTool = implement(
    "read-artifact",
    async function* (input, ctx): AsyncGenerator<TurnEvent, string> {
        if (!ctx.workspace) return "There is no library access in this context.";
        const found = await ctx.workspace.read(input.id);
        if (!found) return "That artifact was not found.";
        const { ref, content } = found;
        return `“${ref.title}” (${ref.format})\n\n${artifactSpine(content)}\n\n${artifactDigest(content)}`;
    },
);

export const findTemplatesTool = implement(
    "find-templates",
    async function* (input): AsyncGenerator<TurnEvent, TemplateRef[]> {
        const q = input.query?.trim().toLowerCase();
        return TEMPLATE_INDEX.filter(
            (t) =>
                !q ||
                t.name.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q),
        ).map((t) => ({ id: t.id, name: t.name, category: t.category }));
    },
);
