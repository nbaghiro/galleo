import { z } from "zod";
import type { Patch, TurnEvent } from "@model/ai";
import { THEMES } from "@themes";
import { register } from "./registry";

// Structural edits to the CURRENT artifact (the open one or the in-chat draft) — reorder / remove a section,
// switch format, switch theme. Each is a deterministic patch op (no model call), returned with a human
// summary; the chat surface presents it as an Apply/Discard proposal (no preview — nothing new to render).
// applyPatch runs the same op whether the target is the editor artifact or a draft, so one path covers both.

interface StructureEdit {
    patch: Patch;
    summary: string;
}

const FORMAT_NAME: Record<string, string> = { deck: "Deck", doc: "Doc", web: "Site" };

export const reorderSectionTool = register({
    id: "reorder-section",
    describe:
        "Move a section to a new position in the current artifact. sectionId = the section to move; afterId = the id of the section it should follow, or null to move it to the front. label = its short heading, for the summary.",
    input: z.object({
        sectionId: z.string(),
        afterId: z.string().nullable(),
        label: z.string().optional().describe("the section's heading, for the summary"),
    }),
    async *run(input): AsyncGenerator<TurnEvent, StructureEdit> {
        return {
            patch: [{ op: "moveSection", id: input.sectionId, afterId: input.afterId }],
            summary: `Move “${input.label ?? "section"}”${input.afterId ? "" : " to the front"}`,
        };
    },
});

export const removeSectionTool = register({
    id: "remove-section",
    describe:
        "Remove a section from the current artifact. sectionId = the section to delete; label = its short heading, for the summary.",
    input: z.object({
        sectionId: z.string(),
        label: z.string().optional().describe("the section's heading, for the summary"),
    }),
    async *run(input): AsyncGenerator<TurnEvent, StructureEdit> {
        return {
            patch: [{ op: "removeSection", id: input.sectionId }],
            summary: `Remove “${input.label ?? "this section"}”`,
        };
    },
});

export const setFormatTool = register({
    id: "set-format",
    describe:
        "Re-render the current artifact in a different format — deck (slides), doc (a document), or web (a page). The content is the same; only the layout changes.",
    input: z.object({ format: z.enum(["deck", "doc", "web"]) }),
    async *run(input): AsyncGenerator<TurnEvent, StructureEdit> {
        return {
            patch: [{ op: "setMeta", format: input.format }],
            summary: `Switch to ${FORMAT_NAME[input.format] ?? input.format}`,
        };
    },
});

export const setThemeTool = register({
    id: "set-theme",
    describe:
        "Switch the current artifact to one of Galleo's built-in themes. theme = the theme id (from the theme list in the prompt). Use it for 'make it darker/warmer/more editorial' etc. — pick the theme whose mood fits.",
    input: z.object({ theme: z.string().describe("a built-in theme id") }),
    async *run(input): AsyncGenerator<TurnEvent, StructureEdit> {
        const t = THEMES[input.theme];
        if (!t) throw new Error(`there is no built-in theme "${input.theme}"`);
        return {
            patch: [{ op: "setMeta", theme: input.theme }],
            summary: `Switch theme to ${t.name}`,
        };
    },
});
