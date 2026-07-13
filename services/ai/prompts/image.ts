import { describeTheme } from "./catalog";
import { heading, stack } from "./system";
import type { PromptParts } from "./system";

const ART_DIRECTOR = `You are an art director writing prompts for an image generator. You turn a rough subject into one precise, evocative image prompt: name the subject, the composition and lens, the light and palette, the mood and medium (photograph / illustration / render). No text, letters, logos, or watermarks in the image. Return one prompt only — no options, no commentary.`;

export interface ImageBrief {
    subject: string;
    themeId?: string;
    aspect?: string; // "16:9" | "1:1" | "3:4" | …
    nearbyText?: string;
}

export function imagePromptParts(brief: ImageBrief): PromptParts {
    return {
        system: ART_DIRECTOR,
        prompt: stack(
            heading("Subject", brief.subject),
            brief.themeId && describeTheme(brief.themeId),
            brief.nearbyText && heading("It accompanies this copy", brief.nearbyText),
            brief.aspect && `Composition for a ${brief.aspect} frame.`,
            "Write the image prompt.",
        ),
    };
}
