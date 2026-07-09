import { z } from "zod";
import { register } from "./registry";
import { generateThemeFromPrompt } from "../theme";

// The theme tool — create a full theme (name, mood, tokens) from a text prompt. Wraps the existing theme
// generator; the result is a ThemeInput each surface previews/saves its own way.

export const generateThemeTool = register({
    id: "generate-theme",
    describe:
        "Create a theme (palette, mood, light/dark) from a text prompt — e.g. 'a warm editorial magazine look'.",
    input: z.object({
        prompt: z.string().describe("the look/mood to design toward"),
        isDark: z
            .boolean()
            .optional()
            .describe("force a dark theme (else inferred from the prompt)"),
    }),
    async *run(input) {
        return await generateThemeFromPrompt(input.prompt, { isDark: input.isDark });
    },
});
