import type { Section, ElementInstance } from "@model/artifact";
import { LAYOUT_PRESETS, rowGroup } from "@model/section";

// Blueprint sections — a planned-but-unwritten section stood up from its column plan, so its real engine
// skeleton (layoutSectionSkeleton) shows the exact layout the writer is told to fill. Used by the
// generation modal's build view and the editor's insert-a-section flow, so both preview the same ghost the
// model then fills in.

// The minimal plan a blueprint needs — a Beat (@model/ai) or the modal's SectionSlot both satisfy it.
export interface SectionBlueprint {
    id: string;
    layout?: string; // a named layout preset (its column count + widths), e.g. "split-6040"
    blocks?: string[]; // the block kind leading each column, in order
    image?: boolean; // the section leads with a prominent image (used to guess a trailing image column)
}

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
            return {
                type: "group",
                data: { direction: "row", children: [card(), card(), card()] },
            };
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

// A stand-in section for a planned beat — each column filled with ITS planned block's placeholder, so the
// skeleton is the exact layout the writer will fill. Falls back to a text default when a beat has no blocks.
export function placeholderSection(plan: SectionBlueprint): Section {
    const fractions = LAYOUT_PRESETS[plan.layout ?? "full"] ?? [1];
    const n = plan.blocks?.length ?? fractions.length;
    const columns = Array.from({ length: n }, (_, i) => {
        const kind = plan.blocks?.[i] ?? (plan.image && n > 1 && i === n - 1 ? "image" : "text");
        return placeholderBlock(kind);
    });
    const root =
        n === 1 ? columns[0]! : rowGroup(columns, fractions.length === n ? fractions : undefined);
    return { id: plan.id, root };
}
