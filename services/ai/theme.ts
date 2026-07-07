import { generateObject } from "ai";
import type { ArtifactContent } from "@model/artifact";
import { finalizeTheme } from "@themes";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import { zTheme } from "./schema";
import type { ThemeGen } from "./schema";
import { themeFromPromptParts, themeFromArtifactParts } from "./prompts/theme";

// The generate-theme runtime — one small structured call produces a coherent theme (name + mood + isDark +
// token set). Fast by design: a tiny, tightly-constrained output, so it defaults to the fast model. A later
// deterministic pass (contrast validation + OKLCH harmony) guarantees quality on top of the model's taste.

export interface ThemeOpts {
    isDark?: boolean;
    model?: string; // override the task default (e.g. compare Flash vs Pro)
    signal?: AbortSignal;
}

// From a free-text mood/brief, e.g. "warm mid-century, terracotta and cream, editorial serif".
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
    // Guarantee legibility + tame neon before it ships — the model designs, the math makes it safe.
    return { ...object, tokens: finalizeTheme(object.tokens) };
}

// Matched to an existing artifact — reads its content's mood and designs a theme that fits it.
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
    // Guarantee legibility + tame neon before it ships — the model designs, the math makes it safe.
    return { ...object, tokens: finalizeTheme(object.tokens) };
}
