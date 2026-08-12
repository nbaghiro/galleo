import type { Section } from "@model/artifact";
import type { TurnEvent } from "@model/ai";
import { implement } from "../tools";

export const showSectionsTool = implement(
    "show-sections",
    async function* (_input, ctx): AsyncGenerator<TurnEvent, Section[]> {
        return ctx.artifact?.sections ?? [];
    },
);
