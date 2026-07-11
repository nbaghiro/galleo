import { z } from "zod";
import type { TurnEvent } from "@model/ai";
import { register } from "./registry";
import { extractArtifactText, runGenerate } from "../run";

// The generate-artifact composite — build a whole deck/doc/site from a brief. Wraps the existing two-phase
// pipeline (outline → per-section write → images) as a registry tool, so the direct surface (the modal, via
// runTurn) and — later — the chat agent both reach the same capability. It streams the pipeline's events; its
// result is void (it emits the artifact as addSection patches rather than returning a tree).

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
        // Repurpose: read the source artifact server-side and fold its text into the source material, so
        // "turn my report into a deck" builds from the report's real content without shipping it around.
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
