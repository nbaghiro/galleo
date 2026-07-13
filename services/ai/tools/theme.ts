import { z } from "zod";
import { register } from "./registry";
import { generateThemeFromPrompt } from "../theme";

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
