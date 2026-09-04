import type { Section } from "@model/artifact";
import type { TurnEvent } from "@model/ai";
import { implement } from "@services/core/ai/tools";

implement(
    "show-sections",
    async function* (_input, ctx): AsyncGenerator<TurnEvent, Section[]> {
        return ctx.artifact?.sections ?? [];
    },
    {
        present: (sections) => (sections.length ? { type: "sections", sections } : null),
        note: (sections) =>
            sections.length
                ? `Showing ${sections.length} section${sections.length === 1 ? "" : "s"}.`
                : "There are no sections to show yet.",
    },
);
