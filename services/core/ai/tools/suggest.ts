import { z } from "zod";
import type { ModelTier } from "@model/billing";
import type { ArtifactContent } from "@model/artifact";
import { generateObject } from "ai";
import { implement } from "@services/core/ai/tools";
import { modelFor, type ModelOverrides } from "@services/core/models";
import { modelCall } from "@services/core/ai/provider";
import { PERSONA } from "@services/core/ai/prompts/persona";
import { artifactDigest, artifactSpine } from "@services/core/ai/prompts/system";

const zSuggest = z.object({
    suggestions: z
        .array(z.string())
        .min(3)
        .max(8)
        .describe(
            "short imperative section ideas, 4–9 words each, specific to THIS artifact — e.g. 'Add a section on the 30-day onboarding flow', 'Compare the Free and Pro tiers in a table'",
        ),
});

const SUGGEST_SYSTEM = `${PERSONA}

You propose the NEXT sections that would most strengthen an EXISTING artifact — specific to its real subject and to what it already covers. Each suggestion is a short imperative (4–9 words) a person could drop straight into a "generate a section" box. Ground every idea in the actual content; never suggest a section the artifact already has; favor the concrete gap — a missing proof point, a comparison, a how-it-works, a closing action — over generic filler.`;

interface SuggestOpts {
    tier?: ModelTier;
    models?: ModelOverrides;
}

export async function suggestSections(
    content: ArtifactContent,
    opts: SuggestOpts = {},
): Promise<string[]> {
    const modelId = modelFor("outline", opts.tier, opts.models);
    const { object } = await generateObject({
        ...modelCall(modelId, 0.8),
        schema: zSuggest,
        system: SUGGEST_SYSTEM,
        prompt: `${artifactSpine(content)}\n\n${artifactDigest(content)}\n\nPropose 6 section ideas that fit this artifact.`,
    });
    return object.suggestions
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
}

implement(
    "suggest-sections",
    async function* (_input, ctx) {
        if (!ctx.artifact) return [];
        return await suggestSections(ctx.artifact, { tier: ctx.tier, models: ctx.models });
    },
    {
        present: (items) => ({ type: "suggestions", items }),
        note: (items) => `Offered ${items.length} section ideas.`,
    },
);
