import { z } from "zod";
import { register } from "./registry";
import { suggestSections } from "../suggest";

// The suggest tool — proposes "what to add next" ideas for the open artifact. Wraps the existing cheap
// suggestions call; returns the ideas for each surface to present (the chat agent → a suggestions block).

export const suggestSectionsTool = register({
    id: "suggest-sections",
    describe:
        "Propose 3–6 short section ideas that would strengthen the open artifact. Use when the user asks what to add, or for ideas.",
    input: z.object({}),
    async *run(_input, ctx) {
        if (!ctx.artifact) return [];
        return await suggestSections(ctx.artifact);
    },
});
