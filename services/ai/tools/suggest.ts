import { z } from "zod";
import { register } from "./registry";
import { suggestSections } from "../suggest";

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
