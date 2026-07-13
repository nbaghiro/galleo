import { z } from "zod";
import type { TurnEvent } from "@model/ai";
import { register } from "./registry";
import { extractArtifactText, runGenerate } from "../run";

const zBrief = z.object({
    prompt: z.string(),
    surface: z.enum(["deck", "doc", "web"]),
    theme: z.string(),
    goal: z.string().optional(),
    audience: z.string().optional(),
    tone: z.string().optional(),
    length: z.string().optional(),
    contextRefs: z.array(z.string()).optional(),
    source: z.string().optional(),
    sourceArtifactId: z.string().optional(),
});

export const generateArtifactTool = register({
    id: "generate-artifact",
    describe:
        "Build a whole deck, doc, or site from a brief — plans an outline, then writes and streams each section in order. Can build FROM source material (pasted text via `source`, or an existing artifact via `sourceArtifactId` — repurpose).",
    input: zBrief,
    async *run(input, ctx): AsyncGenerator<TurnEvent, void> {
        // repurpose: fold the source artifact's text in server-side
        let source = input.source;
        if (input.sourceArtifactId && ctx.workspace) {
            const found = await ctx.workspace.read(input.sourceArtifactId);
            if (found)
                source = [source, extractArtifactText(found.content)]
                    .filter((s): s is string => !!s?.trim())
                    .join("\n\n");
        }
        yield* runGenerate({ ...input, source }, { image: ctx.image, signal: ctx.signal });
    },
});
