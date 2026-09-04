import type { ModelTier } from "@model/billing";
import { generateObject } from "ai";
import { finalizeTheme } from "@themes";
import { implement } from "@services/core/ai/tools";
import { modelFor, type ModelOverrides } from "@services/core/models";
import { modelCall } from "@services/core/ai/provider";
import { zTheme, type ThemeGen } from "@services/core/ai/schema";
import { themeFromPromptParts } from "@services/core/ai/prompts/theme";

interface ThemeOpts {
    models?: ModelOverrides;
    isDark?: boolean;
    model?: string; // override the task default
    tier?: ModelTier;
    signal?: AbortSignal;
}

async function generateThemeFromPrompt(prompt: string, opts: ThemeOpts = {}): Promise<ThemeGen> {
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

implement(
    "generate-theme",
    async function* (input, ctx) {
        return await generateThemeFromPrompt(input.prompt, {
            isDark: input.isDark,
            tier: ctx.tier,
            models: ctx.models,
        });
    },
    {
        present: (t) => ({
            type: "theme",
            name: t.name,
            mood: t.mood,
            isDark: t.isDark,
            tokens: t.tokens,
        }),
        note: (t) =>
            `Designed “${t.name}” (${t.mood}, ${t.isDark ? "dark" : "light"}). The user applies it; it isn't saved until they do.`,
    },
);
