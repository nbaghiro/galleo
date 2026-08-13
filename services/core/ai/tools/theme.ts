import type { ModelTier } from "@model/billing";
import { generateObject } from "ai";
import { finalizeTheme } from "@themes";
import { implement } from "../tools";
import { modelFor, type ModelOverrides } from "../../models";
import { modelCall } from "../provider";
import { zTheme, type ThemeGen } from "../schema";
import { themeFromPromptParts } from "../prompts/theme";

interface ThemeOpts {
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
        ...modelCall(modelFor("theme", opts.tier, opts.models), 0.7),
        schema: zTheme,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
    return { ...object, tokens: finalizeTheme(object.tokens) };
}

export const generateThemeTool = implement("generate-theme", async function* (input, ctx) {
    return await generateThemeFromPrompt(input.prompt, {
        isDark: input.isDark,
        tier: ctx.tier,
        models: ctx.models,
    });
});
