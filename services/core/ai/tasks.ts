import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { BriefDraft, Surface } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { ModelTier } from "@model/billing";
import { finalizeTheme } from "@themes";
import { modelFor, samplingFor, type ModelOverrides } from "../models";
import { resolveModel, providerOpts } from "./provider";
import { zBriefDraft, zTheme, type BriefDraftGen, type ThemeGen } from "./schema";
import { briefParts, type BriefRead } from "./prompts/brief";
import { rewriteTextParts, translateTextParts } from "./prompts/text";
import { themeFromPromptParts, themeFromArtifactParts } from "./prompts/theme";
import { PERSONA } from "./prompts/persona";
import { artifactDigest, artifactSpine } from "./prompts/system";

// The one-shot calls: a single request in, a finished value out. Anything that streams a turn or
// drives tools lives in run.ts / chat.ts.

export interface TextOpts {
    models?: ModelOverrides;
    context?: string; // surrounding text, when only a sub-range is edited
    tier?: ModelTier;
    signal?: AbortSignal;
}

// strip fences/quotes the model added — but keep quotes if the original was already quoted
function clean(out: string, original: string): string {
    let t = out
        .trim()
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    const orig = original.trim();
    const wrapped = (q: string): boolean => t.length >= 2 && t.startsWith(q) && t.endsWith(q);
    const origHas = (q: string): boolean => orig.startsWith(q) || orig.endsWith(q);
    if ((wrapped('"') && !origHas('"')) || (wrapped("'") && !origHas("'")))
        t = t.slice(1, -1).trim();
    return t;
}

export async function rewriteText(
    text: string,
    instruction: string,
    opts: TextOpts = {},
): Promise<string> {
    const parts = rewriteTextParts(text, instruction, opts.context);
    const modelId = modelFor("rewrite", opts.tier, opts.models);
    const { text: out } = await generateText({
        model: resolveModel(modelId),
        system: parts.system,
        prompt: parts.prompt,
        providerOptions: providerOpts(modelId),
        abortSignal: opts.signal,
    });
    return clean(out, text);
}

export async function translateText(
    text: string,
    language: string,
    opts: TextOpts = {},
): Promise<string> {
    const parts = translateTextParts(text, language, opts.context);
    const modelId = modelFor("translate", opts.tier, opts.models);
    const { text: out } = await generateText({
        model: resolveModel(modelId),
        system: parts.system,
        prompt: parts.prompt,
        providerOptions: providerOpts(modelId),
        abortSignal: opts.signal,
    });
    return clean(out, text);
}

export interface ThemeOpts {
    models?: ModelOverrides;
    isDark?: boolean;
    model?: string; // override the task default
    tier?: ModelTier;
    signal?: AbortSignal;
}

export async function generateThemeFromPrompt(
    prompt: string,
    opts: ThemeOpts = {},
): Promise<ThemeGen> {
    const parts = themeFromPromptParts(prompt, opts.isDark);
    const { object } = await generateObject({
        model: resolveModel(modelFor("theme", opts.tier, opts.models)),
        schema: zTheme,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
    return { ...object, tokens: finalizeTheme(object.tokens) };
}

export async function generateThemeFromArtifact(
    content: ArtifactContent,
    hint?: string,
    opts: ThemeOpts = {},
): Promise<ThemeGen> {
    const parts = themeFromArtifactParts(content, hint);
    const { object } = await generateObject({
        model: resolveModel(modelFor("theme", opts.tier, opts.models)),
        schema: zTheme,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
    return { ...object, tokens: finalizeTheme(object.tokens) };
}

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

export interface SuggestOpts {
    tier?: ModelTier;
    models?: ModelOverrides;
}

export async function suggestSections(
    content: ArtifactContent,
    opts: SuggestOpts = {},
): Promise<string[]> {
    const modelId = modelFor("outline", opts.tier, opts.models);
    const { object } = await generateObject({
        model: resolveModel(modelId),
        schema: zSuggest,
        system: SUGGEST_SYSTEM,
        prompt: `${artifactSpine(content)}\n\n${artifactDigest(content)}\n\nPropose 6 section ideas that fit this artifact.`,
        providerOptions: providerOpts(modelId),
        ...samplingFor(modelId, 0.8),
    });
    return object.suggestions
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
}
