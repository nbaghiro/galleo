import type { TurnEvent } from "@model/ai";
import { implement } from "@services/core/ai/tools";
import { planOutlineTool } from "./plan";
import { finishGenerationTool, startGenerationTool, writeBeatsTool } from "./generation";

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export interface Generated {
    id: string; // the artifact
    generationId: string;
    title: string;
    sections: number;
    format: string;
}

// The one-call composite: the studio's flow run to completion, for a caller that wants a finished
// piece rather than a stop at the outline.
implement(
    "generate-artifact",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Generated> {
        yield { type: "phase", name: "intake" };
        const gen = yield* ctx.use(startGenerationTool, input);
        const outline = yield* ctx.use(planOutlineTool, { generationId: gen.id });
        yield { type: "phase", name: "build" };
        yield* ctx.use(writeBeatsTool, { generationId: gen.id });
        // write-beats finishes when every beat landed; a beat that failed leaves it open
        if (ctx.generation?.stage !== "done")
            yield* ctx.use(finishGenerationTool, { generationId: gen.id });
        const sections = ctx.artifact?.sections.length ?? 0;
        yield { type: "phase", name: "done" };
        return {
            id: gen.artifactId,
            generationId: gen.id,
            title: outline.title,
            sections,
            format: gen.brief.surface,
        };
    },
    {
        present: (g) => ({ type: "generation", generationId: g.generationId, artifactId: g.id }),
        note: (g) => `Built “${clip(g.title, 48)}”, ${g.sections} sections.`,
    },
);
