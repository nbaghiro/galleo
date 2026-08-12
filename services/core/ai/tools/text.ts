import type { ModelTier } from "@model/billing";
import { generateText } from "ai";
import { implement } from "../tools";
import { modelFor, type ModelOverrides } from "../../models";
import { modelCall } from "../provider";
import { rewriteTextParts, translateTextParts } from "../prompts/text";
import type { Section } from "@model/artifact";
import { findPassage, replacePassage, textNodes } from "../locate";

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
        ...modelCall(modelId, 0.5),
        system: parts.system,
        prompt: parts.prompt,
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
        ...modelCall(modelId, 0.5),
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
    return clean(out, text);
}

export const rewriteTextTool = implement("rewrite-text", async function* (input, ctx) {
    return await rewriteText(input.text, input.instruction, {
        signal: ctx.signal,
        tier: ctx.tier,
        models: ctx.models,
    });
});

export const translateTextTool = implement("translate-text", async function* (input, ctx) {
    return await translateText(input.text, input.language, {
        signal: ctx.signal,
        tier: ctx.tier,
        models: ctx.models,
    });
});

// unlike rewrite-text's bare string, this returns the section with the passage already replaced
export const rewritePassageTool = implement(
    "rewrite-passage",
    async function* (input, ctx): AsyncGenerator<never, Section> {
        const section = ctx.artifact?.sections.find((s) => s.id === input.sectionId);
        if (!section) throw new Error(`There is no section “${input.sectionId}” in this piece.`);
        const hit = findPassage(section.root, input.find);
        if (!hit) {
            const available = textNodes(section.root)
                .map((n) => `“${n.text.slice(0, 60)}”`)
                .join(", ");
            throw new Error(
                `No passage matching that text in ${input.sectionId}. Its passages are: ${available || "none"}.`,
            );
        }
        const rewritten = await rewriteText(hit.text, input.instruction, {
            signal: ctx.signal,
            tier: ctx.tier,
            models: ctx.models,
        });
        return replacePassage(section, hit.path, rewritten.trim() || hit.text);
    },
);
