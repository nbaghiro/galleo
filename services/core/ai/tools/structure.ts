import type { Patch, TurnEvent } from "@model/ai";
import { THEMES } from "@themes";
import { implement } from "@services/core/ai/tools";

interface StructureEdit {
    patch: Patch;
    summary: string;
}

const edit = { patch: (e: StructureEdit) => e.patch, note: (e: StructureEdit) => e.summary };

const FORMAT_NAME: Record<string, string> = { deck: "Deck", doc: "Doc", web: "Site" };

export const reorderSectionTool = implement(
    "reorder-section",
    async function* (input): AsyncGenerator<TurnEvent, StructureEdit> {
        return {
            patch: {
                artifact: [{ op: "moveSection", id: input.sectionId, afterId: input.afterId }],
            },
            summary: `Move “${input.label ?? "section"}”${input.afterId ? "" : " to the front"}`,
        };
    },
    edit,
);

export const removeSectionTool = implement(
    "remove-section",
    async function* (input): AsyncGenerator<TurnEvent, StructureEdit> {
        return {
            patch: { artifact: [{ op: "removeSection", id: input.sectionId }] },
            summary: `Remove “${input.label ?? "this section"}”`,
        };
    },
    edit,
);

export const setFormatTool = implement(
    "set-format",
    async function* (input): AsyncGenerator<TurnEvent, StructureEdit> {
        return {
            patch: { artifact: [{ op: "setMeta", format: input.format }] },
            summary: `Switch to ${FORMAT_NAME[input.format] ?? input.format}`,
        };
    },
    edit,
);

export const setThemeTool = implement(
    "set-theme",
    async function* (input): AsyncGenerator<TurnEvent, StructureEdit> {
        const t = THEMES[input.theme];
        if (!t) throw new Error(`there is no built-in theme "${input.theme}"`);
        return {
            patch: { artifact: [{ op: "setMeta", theme: input.theme }] },
            summary: `Switch theme to ${t.name}`,
        };
    },
    edit,
);
