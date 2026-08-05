import type { BriefDraft, Surface } from "@model/ai";
import type { ModelTier } from "@model/billing";
import { generateObject } from "ai";
import { resolveModel, providerOpts } from "./provider";
import { modelFor, samplingFor, type ModelOverrides } from "./models";
import { briefParts, type BriefRead } from "./prompts/brief";
import { zBriefDraft, type BriefDraftGen } from "./schema";

export interface BriefOpts {
    models?: ModelOverrides;
    tier?: ModelTier;
    signal?: AbortSignal;
    previous?: BriefRead; // a re-read: rule this one out and come back with a different angle
}

// expand a raw prompt into the editable brief the studio's Brief stage renders
export async function expandBrief(
    prompt: string,
    surface?: Surface,
    opts: BriefOpts = {},
): Promise<BriefDraft> {
    const parts = briefParts(prompt, surface, opts.previous);
    const modelId = modelFor("brief", opts.tier, opts.models);
    const { object } = await generateObject({
        model: resolveModel(modelId),
        schema: zBriefDraft,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
        providerOptions: providerOpts(modelId),
        // a re-read runs hot: the point is to land somewhere else
        ...samplingFor(modelId, opts.previous ? 1 : 0.7),
    });
    return normalizeBrief(prompt, object, surface);
}

// the count/emptiness rules live here, not in the schema, so a merely untidy read still lands
export function normalizeBrief(prompt: string, read: BriefDraftGen, surface?: Surface): BriefDraft {
    const clean = (s: string | null | undefined): string | undefined => s?.trim() || undefined;
    const points = (read.mustInclude ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 6);
    return {
        prompt,
        surface,
        goal: clean(read.goal),
        audience: clean(read.audience),
        tone: clean(read.tone),
        mustInclude: points.length ? points : undefined,
        clarify: clean(read.clarify),
    };
}
