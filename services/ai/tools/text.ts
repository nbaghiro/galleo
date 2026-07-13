import { z } from "zod";
import { register } from "./registry";
import { rewriteText, translateText } from "../text";

export const rewriteTextTool = register({
    id: "rewrite-text",
    describe:
        "Rewrite ONE passage of text per an instruction (make it punchier, shorter, longer, more formal, fix grammar, …). Returns just the rewritten text.",
    input: z.object({
        text: z.string().describe("the passage to rewrite"),
        instruction: z.string().describe("how to change it, e.g. 'make it more concise'"),
    }),
    async *run(input, ctx) {
        return await rewriteText(input.text, input.instruction, { signal: ctx.signal });
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
        return await translateText(input.text, input.language, { signal: ctx.signal });
    },
});
