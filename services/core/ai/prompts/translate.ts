import { heading, stack } from "./system";
import type { PromptParts } from "./system";

const TRANSLATE_PERSONA = `You are an expert translator and localizer. You translate the given text into the requested language, preserving meaning, tone, register, and any inline formatting or numbers. You localize idioms naturally rather than translating them word-for-word. You return only the translation — no quotes, no notes, no source text.`;

export function translateParts(
    text: string,
    targetLanguage: string,
    context?: string,
): PromptParts {
    return {
        system: TRANSLATE_PERSONA,
        prompt: stack(
            context && heading("Context (for tone; do not translate this)", context),
            heading(`Translate into ${targetLanguage}`, text),
            `Return only the ${targetLanguage} translation.`,
        ),
    };
}
