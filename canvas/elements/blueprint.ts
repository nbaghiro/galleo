import type { Section, ElementInstance } from "@model/artifact";
import { LAYOUT_PRESETS, rowGroup, elementRegionId } from "@model/artifact";

// a Beat (@model/ai) or the modal's SectionSlot both satisfy it
export interface SectionBlueprint {
    id: string;
    layout?: string; // named layout preset, e.g. "split-6040"
    blocks?: string[]; // block kind leading each column, in order
    image?: boolean; // leads with a prominent image → guess a trailing image column
}

// the outline's own words, when the plan carries them
export interface OutlineCopy {
    heading?: string;
    lead?: string;
    points?: string[];
}

export type OutlineField =
    | { kind: "heading" }
    | { kind: "lead" }
    | { kind: "point"; index: number };

// Shown for an empty field so the region still paints and stays tappable.
export const OUTLINE_PLACEHOLDER = {
    heading: "Untitled section",
    lead: "The one thing the reader leaves with…",
    point: "What this section actually says…",
} as const;

// kinds that carry data the outline has no words for, so copy never lands in them
const MEDIA_KINDS = new Set(["image", "chart", "stat", "table", "diagram"]);

const t = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});

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
                        t("Attribution", "caption"),
                    ],
                },
            };
        case "cards": {
            const card = (): ElementInstance => ({
                type: "container",
                data: {
                    surface: "solid",
                    children: [t("Card title", "h3"), t("A short supporting line.", "body")],
                },
            });
            return {
                type: "container",
                data: { direction: "row", children: [card(), card(), card()] },
            };
        }
        default:
            return {
                type: "container",
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

// column kinds in order, and which one copy belongs in (the first that isn't media)
function columnPlan(plan: SectionBlueprint): { kinds: string[]; copyAt: number } {
    const fractions = LAYOUT_PRESETS[plan.layout ?? "full"] ?? [1];
    const n = plan.blocks?.length ?? fractions.length;
    const kinds = Array.from(
        { length: n },
        (_, i) => plan.blocks?.[i] ?? (plan.image && n > 1 && i === n - 1 ? "image" : "text"),
    );
    const at = kinds.findIndex((k) => !MEDIA_KINDS.has(k));
    return { kinds, copyAt: at < 0 ? 0 : at };
}

function assemble(plan: SectionBlueprint, columns: ElementInstance[]): Section {
    const fractions = LAYOUT_PRESETS[plan.layout ?? "full"] ?? [1];
    const root =
        columns.length === 1
            ? columns[0]!
            : rowGroup(columns, fractions.length === columns.length ? fractions : undefined);
    return { id: plan.id, root };
}

export function placeholderSection(plan: SectionBlueprint): Section {
    const { kinds } = columnPlan(plan);
    return assemble(
        plan,
        kinds.map((k) => placeholderBlock(k)),
    );
}

// The outline's words as a real Section, so the engine owns its type scale, splits and theme
// instead of the card re-deciding them. `fields` maps a painted region back to what it edits.
export function outlineSection(plan: SectionBlueprint & OutlineCopy): {
    section: Section;
    fields: Record<string, OutlineField>;
} {
    const { kinds, copyAt } = columnPlan(plan);
    const points = plan.points?.length ? plan.points : [""];
    const copy: ElementInstance = {
        type: "container",
        data: {
            children: [
                t(plan.heading?.trim() || OUTLINE_PLACEHOLDER.heading, "h2"),
                t(plan.lead?.trim() || OUTLINE_PLACEHOLDER.lead, "body"),
                {
                    type: "bullets",
                    data: {
                        children: points.map((p) =>
                            t(p.trim() || OUTLINE_PLACEHOLDER.point, "body"),
                        ),
                    },
                },
            ],
        },
    };
    const columns = kinds.map((k, i) => (i === copyAt ? copy : placeholderBlock(k)));

    // paths mirror composeElement's descent: root is the sole column, or a row of them
    const prefix = columns.length === 1 ? [] : [copyAt];
    const at = (path: number[]): string => elementRegionId({ section: plan.id, path });
    const fields: Record<string, OutlineField> = {
        [at([...prefix, 0])]: { kind: "heading" },
        [at([...prefix, 1])]: { kind: "lead" },
    };
    points.forEach((_, i) => {
        fields[at([...prefix, 2, i])] = { kind: "point", index: i };
    });
    return { section: assemble(plan, columns), fields };
}
