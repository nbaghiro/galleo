import { describeTheme } from "./catalog";
import { heading, stack } from "./system";
import type { PromptParts } from "./system";

// What a rough prompt is refined *into*. Each kind names the craft, because "make this better" with
// no craft behind it returns adjectives; naming the lens is what produces a usable prompt.
export type RefineKind = "image" | "video" | "theme";

const CRAFT: Record<RefineKind, string> = {
    image: "You are an art director briefing an image generator. Name the subject, the composition and lens, the light and palette, the mood, and the medium (photograph / illustration / render). Never ask for text, letters, logos, or watermarks inside the image.",
    video: "You are a cinematographer briefing a short-clip generator. Name the subject, the shot and camera move, the light and palette, the pace, and the medium. Describe one continuous shot, no cuts, no dialogue, no on-screen text.",
    theme: "You are a designer briefing a theme generator. Name the mood, the palette in plain colour words, the type pairing in broad terms (a serif display with a grotesque body, say), and how sharp or soft the shapes are. Describe the feel. Never specific hex values or font files.",
};

// One sentence, because a prompt that sprawls steers the generator less, not more.
const LENGTH: Record<RefineKind, string> = {
    image: "One sentence, under 60 words.",
    video: "One sentence, under 60 words.",
    theme: "Two sentences at most.",
};

const RETURN_RULE =
    "Return ONLY the refined prompt, no preamble, no options, no explanation, no surrounding quotes, no markdown.";

/**
 * Expand a rough user prompt into a fuller one for the named kind of generation.
 *
 * Always user-triggered: the refined text goes back to the box the user typed in, so they can edit
 * it before spending anything on the generation itself. The result is just a prompt — every
 * generation path keeps taking a plain string, refined or not.
 */
export function refinePromptParts(kind: RefineKind, prompt: string, context?: string): PromptParts {
    return {
        system: stack(CRAFT[kind], LENGTH[kind], RETURN_RULE),
        prompt: stack(
            heading("The rough prompt", prompt),
            context &&
                heading("It sits alongside this (context only, do not describe it)", context),
            "Keep the subject the user asked for. Add craft, not a different idea.",
            "Write the refined prompt.",
        ),
    };
}

/** The active theme, folded in as context so a refined image prompt matches the piece it lands in. */
export const themeContext = (themeId: string | undefined): string | undefined =>
    themeId ? describeTheme(themeId) : undefined;
