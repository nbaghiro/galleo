import { z } from "zod";
import type { Section } from "@model/artifact";
import type { TurnEvent } from "@model/ai";
import { register } from "./registry";

// Read-only inspection tools — no model call. `show-sections` hands back the open artifact's sections so a
// surface can render them (the chat agent → a scrollable carousel of real previews). This is how the agent
// answers "show me my sections" instead of declining: it's a display capability, not a content one.

export const showSectionsTool = register({
    id: "show-sections",
    describe:
        "Display the artifact's existing sections as a scrollable carousel of previews. Use when the user asks to see, scan, or list the sections they already have — this SHOWS content, it doesn't change it.",
    input: z.object({}),
    async *run(_input, ctx): AsyncGenerator<TurnEvent, Section[]> {
        return ctx.artifact?.sections ?? [];
    },
});
