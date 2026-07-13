import { generateText } from "ai";
import { resolveModel, thinklessOpts } from "./provider";
import { defaultModelFor } from "./models";
import { rewriteTextParts, translateTextParts } from "./prompts/text";

export interface TextOpts {
    context?: string; // surrounding text, when only a sub-range is edited
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
    const { text: out } = await generateText({
        model: resolveModel(defaultModelFor("rewrite")),
        system: parts.system,
        prompt: parts.prompt,
        providerOptions: thinklessOpts(defaultModelFor("rewrite")),
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
    const { text: out } = await generateText({
        model: resolveModel(defaultModelFor("translate")),
        system: parts.system,
        prompt: parts.prompt,
        providerOptions: thinklessOpts(defaultModelFor("translate")),
        abortSignal: opts.signal,
    });
    return clean(out, text);
}
