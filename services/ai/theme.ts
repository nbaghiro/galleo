import { generateObject } from "ai";
import type { ArtifactContent } from "@model/artifact";
import { finalizeTheme } from "@themes";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import { zTheme } from "./schema";
import type { ThemeGen } from "./schema";
import { themeFromPromptParts, themeFromArtifactParts } from "./prompts/theme";

export interface ThemeOpts {
    isDark?: boolean;
    model?: string; // override the task default
    signal?: AbortSignal;
}

export async function generateThemeFromPrompt(
    prompt: string,
    opts: ThemeOpts = {},
): Promise<ThemeGen> {
    const parts = themeFromPromptParts(prompt, opts.isDark);
    const { object } = await generateObject({
        model: resolveModel(opts.model ?? defaultModelFor("theme")),
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
        model: resolveModel(opts.model ?? defaultModelFor("theme")),
        schema: zTheme,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
    return { ...object, tokens: finalizeTheme(object.tokens) };
}
