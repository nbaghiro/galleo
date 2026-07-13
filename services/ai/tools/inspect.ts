import { z } from "zod";
import type { Section } from "@model/artifact";
import type { TurnEvent } from "@model/ai";
import { register } from "./registry";

export const showSectionsTool = register({
    id: "show-sections",
    describe:
        "Display the artifact's existing sections as a scrollable carousel of previews. Use when the user asks to see, scan, or list the sections they already have — this SHOWS content, it doesn't change it.",
    input: z.object({}),
    async *run(_input, ctx): AsyncGenerator<TurnEvent, Section[]> {
        return ctx.artifact?.sections ?? [];
    },
});
