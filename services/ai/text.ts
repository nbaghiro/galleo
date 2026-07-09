import { generateText } from "ai";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import { rewriteTextParts, translateTextParts } from "./prompts/text";

// Text-level AI edits — rewrite and translate ONE passage of text. The fastest, highest-volume ops (a user
// polishing a headline / a body line), so they run on the fast, thinkless model (DEFAULT_MODELS.rewrite /
// .translate = Gemini Flash, thinking off) via plain generateText — no JSON envelope, no retries, minimal
// latency. The editor splices the returned string back into the selection; the chat/MCP surfaces call the
// same functions through the rewrite-text / translate-text tools.

// Flash runs "thinking" by default, which only adds latency to a one-line rewrite — disable it so the round
// trip is as short as possible. Ignored by non-Google providers, so this stays provider-agnostic.
const FAST_OPTS = { google: { thinkingConfig: { thinkingBudget: 0 } } };

export interface TextOpts {
    context?: string; // the full surrounding text, when only a sub-range is being edited
    signal?: AbortSignal;
}

// Strip anything a model wraps around the bare text — a code fence, or a pair of quotes it added (but only
// when the original wasn't already quoted, so a genuinely quoted passage keeps its quotes).
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
        providerOptions: FAST_OPTS,
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
        providerOptions: FAST_OPTS,
        abortSignal: opts.signal,
    });
    return clean(out, text);
}
