import type { ArtifactRef, TemplateRef, TurnEvent } from "@model/ai";
import { implement } from "@services/core/ai/tools";
import { artifactDigest, artifactSpine } from "@services/core/ai/prompts/system";
import { TEMPLATE_INDEX } from "@model/templates";

implement(
    "find-artifacts",
    async function* (input, ctx): AsyncGenerator<TurnEvent, ArtifactRef[]> {
        if (!ctx.workspace) return [];
        return ctx.workspace.find(input.query?.trim() || undefined);
    },
    {
        present: (items) => (items.length ? { type: "artifacts", items } : null),
        // the note is the model's tool result: it MUST carry ids so a follow-up targets the right one
        note: (items) =>
            items.length
                ? `Found ${items.length}:\n${items.map((i) => `- ${i.id} — “${i.title}” (${i.format})`).join("\n")}`
                : "No matching artifacts in the library.",
    },
);

implement(
    "read-artifact",
    async function* (input, ctx): AsyncGenerator<TurnEvent, string> {
        if (!ctx.workspace) return "There is no library access in this context.";
        const found = await ctx.workspace.read(input.id);
        if (!found) return "That artifact was not found.";
        const { ref, content } = found;
        return `“${ref.title}” (${ref.format})\n\n${artifactSpine(content)}\n\n${artifactDigest(content)}`;
    },
    { present: () => null },
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
    {
        present: (items) => (items.length ? { type: "templates", items } : null),
        note: (items) =>
            items.length
                ? `Templates: ${items.map((t) => `${t.name} (${t.category})`).join(", ")}. The user can pick one to start from.`
                : "No matching templates.",
    },
);

implement("list-workspaces", async function* (_input, ctx): AsyncGenerator<TurnEvent, unknown[]> {
    return ctx.account ? await ctx.account.workspaces() : [];
});

implement("create-artifact", async function* (input, ctx): AsyncGenerator<
    TurnEvent,
    { title: string; sections: number }
> {
    // The body only shapes it; storing is the effect path's job, the same as generation's, so
    // there is one place that writes an artifact however it was made.
    void ctx;
    return { title: input.title, sections: input.content.sections.length };
});
