import { PERSONA } from "./persona";
import { heading, stack } from "./system";
import type { PromptParts } from "./system";

// Text-level edits — rewrite and translate ONE selected passage. These are the high-volume, latency-sensitive
// ops (a user tweaking a headline), so they run on the fast, thinkless model (services/ai/text.ts) and keep
// the prompt tiny: no element catalog, no artifact digest — just the passage, the instruction, and a hard
// "return only the edited text" rule so the result drops straight back into the selection.

const RETURN_RULE =
    "Return ONLY the edited text — no preamble, no explanation, no surrounding quotes, no markdown fences, no notes. Preserve the passage's meaning and its inline emphasis, and keep it about the same length unless the instruction says otherwise.";

// Where a sub-selection sits inside its surrounding text — given only so the edit stays coherent with the
// rest of the sentence; the model must NOT return or touch this, only the passage.
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
