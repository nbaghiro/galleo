import type { TurnEvent } from "@model/ai";
import { implement } from "@services/core/ai/tools";
import { extractArtifactText, runGenerate } from "@services/core/ai/run";

export const generateArtifactTool = implement(
    "generate-artifact",
    async function* (input, ctx): AsyncGenerator<TurnEvent, void> {
        // repurpose: fold the source artifact's text in server-side
        let source = input.source;
        if (input.sourceArtifactId && ctx.workspace) {
            const found = await ctx.workspace.read(input.sourceArtifactId);
            if (found)
                source = [source, extractArtifactText(found.content)]
                    .filter((s): s is string => !!s?.trim())
                    .join("\n\n");
        }
        yield* runGenerate(
            { ...input, source },
            {
                image: ctx.image,
                signal: ctx.signal,
                tier: ctx.tier,
                models: ctx.models,
                maxSections: ctx.maxSections,
            },
        );
    },
);
