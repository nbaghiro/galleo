import type { BriefDraft, Surface } from "@model/ai";
import type { ModelTier } from "@model/billing";
import { generateObject } from "ai";
import { resolveModel, thinklessOpts } from "./provider";
import { modelFor } from "./models";
import { briefParts, type BriefRead } from "./prompts/brief";
import { zBriefDraft, type BriefDraftGen } from "./schema";

export interface BriefOpts {
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
    const modelId = modelFor("outline", opts.tier);
    const { object } = await generateObject({
        model: resolveModel(modelId),
        schema: zBriefDraft,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
        providerOptions: thinklessOpts(modelId),
        // a re-read runs hot: the point is to land somewhere else
        temperature: opts.previous ? 1 : 0.7,
    });
    return normalizeBrief(prompt, object, surface);
}

// The count/emptiness rules live here rather than in the schema, so a read that's merely untidy
// still lands instead of failing validation and looking like an outage.
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
