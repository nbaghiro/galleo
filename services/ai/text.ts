import { generateText } from "ai";
import type { ModelTier } from "@model/billing";
import { resolveModel, providerOpts } from "./provider";
import { modelFor, type ModelOverrides } from "./models";
import { rewriteTextParts, translateTextParts } from "./prompts/text";

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
