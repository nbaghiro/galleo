import { z } from "zod";
import type { Section } from "@model/artifact";
import { register } from "./registry";
import { rewriteText, translateText } from "../text";
import { findPassage, replacePassage, textNodes } from "../locate";

export const rewriteTextTool = register({
    id: "rewrite-text",
    describe:
        "Rewrite ONE passage of text per an instruction (make it punchier, shorter, longer, more formal, fix grammar, …). Returns just the rewritten text.",
    input: z.object({
        text: z.string().describe("the passage to rewrite"),
        instruction: z.string().describe("how to change it, e.g. 'make it more concise'"),
    }),
    async *run(input, ctx) {
        return await rewriteText(input.text, input.instruction, {
            signal: ctx.signal,
            tier: ctx.tier,
            models: ctx.models,
        });
    },
});

export const translateTextTool = register({
    id: "translate-text",
    describe:
        "Translate ONE passage of text into a target language. Returns just the translated text.",
    input: z.object({
        text: z.string().describe("the passage to translate"),
        language: z.string().describe("the target language, e.g. 'Spanish' or 'Japanese'"),
    }),
    async *run(input, ctx) {
        return await translateText(input.text, input.language, {
            signal: ctx.signal,
            tier: ctx.tier,
            models: ctx.models,
        });
    },
});

// unlike rewrite-text's bare string, this returns the section with the passage already replaced
export const rewritePassageTool = register({
    id: "rewrite-passage",
    describe:
        "Rewrite ONE passage inside a section, leaving the rest of it untouched. Use this when the user wants specific wording changed (a headline, a bullet, a sentence) rather than the whole section rewritten. `find` must be copied from the section's real text.",
    input: z.object({
        sectionId: z.string().describe("the id of the section the passage is in"),
        find: z
            .string()
            .describe("the passage to rewrite, copied VERBATIM from the section's current text"),
        instruction: z
            .string()
            .describe("how to change it, e.g. 'make it punchier' or 'cut it to six words'"),
    }),
    async *run(input, ctx): AsyncGenerator<never, Section> {
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
});
