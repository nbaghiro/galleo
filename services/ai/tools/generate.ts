import { z } from "zod";
import type { TurnEvent } from "@model/ai";
import { register } from "./registry";
import { runGenerate } from "../run";

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
});

export const generateArtifactTool = register({
    id: "generate-artifact",
    describe:
        "Build a whole deck, doc, or site from a brief — plans an outline, then writes and streams each section in order.",
    input: zBrief,
    async *run(input, ctx): AsyncGenerator<TurnEvent, void> {
        yield* runGenerate(input, { image: ctx.image, signal: ctx.signal });
    },
});
