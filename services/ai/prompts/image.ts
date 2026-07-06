import { describeTheme } from "./catalog";
import { heading, stack } from "./system";
import type { PromptParts } from "./system";

// The image capability's text half — an art director that turns a terse subject (the descriptive phrase the
// generator put in an image's `src`, or a few words the user typed in the picker) into a single vivid,
// on-theme prompt for the image model (services/media/generate.ts). Output validates against `zImagePrompt`.
// This is optional polish: the raw subject already works; this makes the result match the artifact's mood.

const ART_DIRECTOR = `You are an art director writing prompts for an image generator. You turn a rough subject into one precise, evocative image prompt: name the subject, the composition and lens, the light and palette, the mood and medium (photograph / illustration / render). No text, letters, logos, or watermarks in the image. Return one prompt only — no options, no commentary.`;

export interface ImageBrief {
    subject: string; // the phrase to expand
    themeId?: string; // match the artifact's mood/palette
    aspect?: string; // "16:9" | "1:1" | "3:4" | …
    nearbyText?: string; // the headline/caption the image sits with, for relevance
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
