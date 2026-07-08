import type { Section, ElementInstance } from "@model/artifact";
import { GRID_TEMPLATES } from "@model/elements";

// Blueprint sections — a planned-but-unwritten section stood up from its grid + per-cell block plan, so
// its real engine skeleton (layoutSectionSkeleton) shows the exact layout the writer is told to fill. Used
// by the generation modal's build view and the editor's insert-a-section flow, so both preview the same
// ghost the model then fills in.

// The minimal plan a blueprint needs — a Beat (@model/ai) or the modal's SectionSlot both satisfy it.
export interface SectionBlueprint {
    id: string;
    grid?: string;
    blocks?: string[]; // the block kind leading each grid cell, in cell order
    image?: boolean; // the section leads with a prominent image (used to guess a trailing image cell)
}

// The cell keys a grid exposes (fill each with one element).
export const gridKeys = (id: string | undefined): readonly string[] =>
    GRID_TEMPLATES.find((g) => g.id === id)?.cells ?? ["a"];

const t = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});

// A stand-in element for a planned block kind — a real element the engine can skeletonize, so a stat cell
// reads as a stat ghost, a chart cell as a chart ghost, and so on, matching what the writer will produce.
export function placeholderBlock(kind: string): ElementInstance {
    switch (kind) {
        case "image":
            return { type: "image", data: { src: "", aspect: 1.4 } };
        case "stat":
            return {
                type: "stat",
                data: { children: [t("92%", "h1"), t("key metric", "caption")] },
            };
        case "chart":
            return {
                type: "chart",
                data: { type: "bar", values: "48, 62, 55, 71", categories: "A, B, C, D" },
            };
        case "diagram":
            return {
                type: "diagram",
                data: { type: "process", items: "Step one, Step two, Step three" },
            };
        case "table":
            return {
                type: "table",
                data: { data: "Plan, Price\nBasic, $9\nPro, $29", header: true },
            };
        case "bullets":
            return {
                type: "bullets",
                data: {
                    children: [
                        t("First supporting point", "body"),
                        t("Second supporting point", "body"),
                        t("Third supporting point", "body"),
                    ],
                },
            };
        case "quote":
            return {
                type: "quote",
                data: {
                    children: [
                        t("A pulled quotation that carries the point.", "h3"),
                        t("— Attribution", "caption"),
                    ],
                },
            };
        case "cards": {
            const card = (): ElementInstance => ({
                type: "card",
                data: { children: [t("Card title", "h3"), t("A short supporting line.", "body")] },
            });
            return { type: "group", data: { columns: 3, children: [card(), card(), card()] } };
        }
        default:
            return {
                type: "group",
                data: {
                    children: [
                        t("Section heading", "h2"),
                        t(
                            "A supporting line of body copy that runs the width of the column.",
                            "body",
                        ),
                        t("Another line of supporting copy.", "body"),
                    ],
                },
            };
    }
}

// A stand-in section for a planned beat — each cell filled with ITS planned block's placeholder, so the
// skeleton is the exact layout the writer will fill. Falls back to a text default when a beat has no blocks.
export function placeholderSection(plan: SectionBlueprint): Section {
    const keys = gridKeys(plan.grid);
    const cells: Record<string, { element: ElementInstance }> = {};
    keys.forEach((key, i) => {
        const kind =
            plan.blocks?.[i] ??
            (plan.image && keys.length > 1 && i === keys.length - 1 ? "image" : "text");
        cells[key] = { element: placeholderBlock(kind) };
    });
    return { id: plan.id, grid: plan.grid ?? "full", cells } as Section;
}
