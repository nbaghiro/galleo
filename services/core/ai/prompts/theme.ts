import type { ArtifactContent } from "@model/artifact";
import { artifactSpine, heading, stack } from "./system";
import type { PromptParts } from "./system";

// Must stay in sync with the pickers in app/views/ThemeEditor.tsx (move to @themes eventually).
const DISPLAY_FONTS = [
    "Fraunces",
    "Playfair Display",
    "Cormorant Garamond",
    "Bodoni Moda",
    "Newsreader",
    "Spectral",
    "Marcellus",
    "Cinzel",
    "Prata",
    "Yeseva One",
    "Anton",
    "Oswald",
    "Space Grotesk",
    "Bricolage Grotesque",
    "Sora",
    "Archivo",
    "Quicksand",
];
const BODY_FONTS = [
    "Hanken Grotesk",
    "Manrope",
    "Mulish",
    "Jost",
    "Figtree",
    "Outfit",
    "Nunito",
    "Albert Sans",
    "Plus Jakarta Sans",
    "Barlow",
    "Inter Tight",
    "Lora",
];
const MONO_FONTS = [
    "DM Mono",
    "IBM Plex Mono",
    "Geist Mono",
    "Space Mono",
    "JetBrains Mono",
    "Fragment Mono",
    "Overpass Mono",
];

const THEME_PERSONA = `You are a brand and type designer who builds coherent color-and-type systems. A great theme is not a random palette — it is a mood expressed as a system: a foundation color, a subtle surface lift above it, a legible ink, one confident accent, and a type pairing that carries the personality.`;

const THEME_RULES = stack(
    heading(
        "Token rules",
        [
            "- Colors are #rrggbb. Ensure strong contrast: ink on surface must be easily legible (light theme = dark ink on light surface; dark theme = light ink on dark surface).",
            "- `surface` is a subtle lift from `bg` (not identical, not jarring). `soft` and `muted` step down from `ink`. `line` is a low-contrast divider. `accent` is the one brand color; `onAccent` must read clearly on it.",
            "- The accent is confident but NEVER fluorescent — pick a sophisticated, slightly-restrained saturation. A dark theme's accent is a jewel tone (deep teal, amber, garnet), not a neon glow.",
            "- Avoid highlighter yellow, chartreuse, and lime-green accents entirely — they read cheap and vanish on light backgrounds. For a warm/sunny mood use a deep gold or amber; for a fresh mood use emerald or teal.",
            "- radius: 0 for sharp/brutalist/editorial, 4–8 for classic, 14–26 for soft/organic. headingWeight: 400 for elegant serifs, 600–800 for bold/grotesque.",
            "- border: 0–1 for soft themes, 2–4 for blocky/brutalist. shadow: 'none', a soft lift, a hard offset (brutalist), or an accent glow.",
        ].join("\n"),
    ),
    heading(
        "Fonts — pick one from each list",
        `display (headings): ${DISPLAY_FONTS.join(", ")}\nbody (paragraphs/UI): ${BODY_FONTS.join(", ")}\nmono (labels): ${MONO_FONTS.join(", ")}`,
    ),
);

export function themeFromPromptParts(prompt: string, isDark?: boolean): PromptParts {
    return {
        system: stack(THEME_PERSONA, THEME_RULES),
        prompt: stack(
            heading("Design a theme for", prompt),
            isDark !== undefined ? `It should be a ${isDark ? "dark" : "light"} theme.` : undefined,
            "Return the full theme (name, mood, isDark, tokens).",
        ),
    };
}

export function themeFromArtifactParts(content: ArtifactContent, hint?: string): PromptParts {
    return {
        system: stack(THEME_PERSONA, THEME_RULES),
        prompt: stack(
            artifactSpine(content),
            hint && heading("Extra direction", hint),
            "Design a custom theme whose mood fits this artifact's content and voice. Return the full theme.",
        ),
    };
}
