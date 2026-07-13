import { z } from "zod";
import type { ArtifactRef, TemplateRef, TurnEvent } from "@model/ai";
import { register } from "./registry";
import { artifactDigest, artifactSpine } from "../prompts/system";
import { TEMPLATES } from "../../templates";

export const findArtifactsTool = register({
    id: "find-artifacts",
    describe:
        "Search the user's library for their existing artifacts by title or topic. Returns a short list of matches (id, title, format). Use it whenever the user refers to something they already made — find the one they mean before reading or editing it. Leave `query` empty to list their most recent work.",
    input: z.object({
        query: z
            .string()
            .optional()
            .describe("words to match against titles/topics; omit to list the most recent"),
    }),
    async *run(input, ctx): AsyncGenerator<TurnEvent, ArtifactRef[]> {
        if (!ctx.workspace) return [];
        return ctx.workspace.find(input.query?.trim() || undefined);
    },
});

export const readArtifactTool = register({
    id: "read-artifact",
    describe:
        "Load ONE artifact's content by id (from find-artifacts) and get a compact digest — its title, format, the section spine, and a per-section summary. Use it to answer questions about an existing piece, or before proposing an edit to it. Reads only; it changes nothing.",
    input: z.object({
        id: z.string().describe("the artifact id, as returned by find-artifacts"),
    }),
    async *run(input, ctx): AsyncGenerator<TurnEvent, string> {
        if (!ctx.workspace) return "There is no library access in this context.";
        const found = await ctx.workspace.read(input.id);
        if (!found) return "That artifact was not found.";
        const { ref, content } = found;
        return `“${ref.title}” (${ref.format})\n\n${artifactSpine(content)}\n\n${artifactDigest(content)}`;
    },
});

export const findTemplatesTool = register({
    id: "find-templates",
    describe:
        "List Galleo's starter templates (id, name, category) — pre-built decks/docs/pages the user can start from. Use it when they ask what templates exist, or want to start from one. Optionally filter by a topic/category word.",
    input: z.object({
        query: z.string().optional().describe("a topic/category word to filter by; omit for all"),
    }),
    async *run(input): AsyncGenerator<TurnEvent, TemplateRef[]> {
        const q = input.query?.trim().toLowerCase();
        return TEMPLATES.filter(
            (t) =>
                !q ||
                t.name.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q),
        ).map((t) => ({ id: t.id, name: t.name, category: t.category }));
    },
});
