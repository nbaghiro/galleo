import { heading, stack } from "./system";
import type { PromptParts } from "./system";

const REWRITE_PERSONA = `You are a precise copy editor. You rewrite a single passage on request and return only the rewritten text — same language as the input, no quotes, no commentary, no markdown.`;

export const REWRITE_ACTIONS = {
    punchier: "Make it punchier and more vivid — stronger verbs, tighter phrasing.",
    shorter: "Make it shorter without losing the point.",
    longer: "Expand it with a little more specific, concrete detail.",
    professional: "Make the tone more polished and professional.",
    casual: "Make the tone warmer and more conversational.",
    simpler: "Simplify the language; clearer and easier to read.",
    fix: "Fix grammar, spelling, and punctuation only; keep the meaning and voice.",
} as const;

export type RewriteAction = keyof typeof REWRITE_ACTIONS;

export function instructionFor(action: RewriteAction | string): string {
    return (REWRITE_ACTIONS as Record<string, string>)[action] ?? action;
}

export function rewriteParts(
    text: string,
    action: RewriteAction | string,
    context?: string,
): PromptParts {
    return {
        system: REWRITE_PERSONA,
        prompt: stack(
            context && heading("Context (do not rewrite this)", context),
            heading("Instruction", instructionFor(action)),
            heading("Text to rewrite", text),
            "Return only the rewritten text.",
        ),
    };
}
