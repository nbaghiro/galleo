import type { ModelTier } from "@model/billing";
import { generateText } from "ai";
import { implement } from "@services/core/ai/tools";
import { modelFor, type ModelOverrides } from "@services/core/models";
import { modelCall } from "@services/core/ai/provider";
import { refinePromptParts, themeContext, type RefineKind } from "@services/core/ai/prompts/refine";

interface RefineOpts {
    models?: ModelOverrides;
    tier?: ModelTier;
    context?: string;
    themeId?: string; // folded in as context so a refined image reads as part of the piece
    signal?: AbortSignal;
}

// a refusal or a preamble slipping through would be pasted straight into the user's box
const strip = (out: string): string =>
    out
        .trim()
        .replace(/^```[a-z]*\n?|\n?```$/g, "")
        .replace(/^["'`]|["'`]$/g, "")
        .trim();

export async function refinePrompt(
    kind: RefineKind,
    prompt: string,
    opts: RefineOpts = {},
): Promise<string> {
    const context = opts.context ?? themeContext(opts.themeId);
    const parts = refinePromptParts(kind, prompt, context);
    const { text } = await generateText({
        ...modelCall(modelFor("rewrite", opts.tier, opts.models), 0.8),
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
    const refined = strip(text);
    return refined || prompt; // an empty answer leaves the user's own words alone
}

// registered for the contract check + the registry; the route calls refinePrompt() directly
implement("refine-prompt", async function* (input, ctx) {
    return await refinePrompt(input.kind, input.prompt, {
        context: input.context,
        tier: ctx.tier,
        models: ctx.models,
    });
});
