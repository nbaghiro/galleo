import { PERSONA } from "./persona";
import { heading, stack } from "./system";
import type { PromptParts } from "./system";

const RETURN_RULE =
    "Return ONLY the edited text — no preamble, no explanation, no surrounding quotes, no markdown fences, no notes. Preserve the passage's meaning and its inline emphasis, and keep it about the same length unless the instruction says otherwise.";

function contextNote(context: string | undefined): string | undefined {
    return context
        ? heading("Surrounding text (context only — do NOT return or repeat this)", context)
        : undefined;
}

export function rewriteTextParts(text: string, instruction: string, context?: string): PromptParts {
    return {
        system: stack(
            PERSONA,
            `Right now you are editing one short passage of text inside a larger document. ${RETURN_RULE}`,
        ),
        prompt: stack(
            heading("How to edit it", instruction),
            contextNote(context),
            heading(
                context ? "The passage to rewrite (return only this, rewritten)" : "The text",
                text,
            ),
            "Return only the edited text.",
        ),
    };
}

export function translateTextParts(text: string, language: string, context?: string): PromptParts {
    return {
        system: stack(
            PERSONA,
            `You are also a professional translator. Translate the passage into ${language}, preserving meaning, tone, names, numbers, and any inline emphasis. ${RETURN_RULE}`,
        ),
        prompt: stack(
            contextNote(context),
            heading(`Translate this into ${language}`, text),
            `Return only the ${language} translation.`,
        ),
    };
}
