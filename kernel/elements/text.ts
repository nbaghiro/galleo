import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ColorToken } from "@themes/theme";
import { register } from "@elements/registry";
import { fit, grow } from "@model/size";

type TextStyle =
    | "display"
    | "h1"
    | "h2"
    | "title"
    | "stat"
    | "lead"
    | "body"
    | "caption"
    | "eyebrow"
    | "byline";

interface TextData {
    text: string;
    style: TextStyle;
    align?: "start" | "center" | "end";
    color?: string; // explicit override; otherwise the style's theme tone is used
}

// One text primitive covers every text role via `style` (size/weight/font + a theme color `tone`).
// Composites are built from these, so all text edits — and themes — the same way.
interface TextStyleSpec {
    size: number;
    weight: number;
    fontId: string;
    tone: ColorToken;
}

const FALLBACK: TextStyleSpec = { size: 17, weight: 400, fontId: "ui", tone: "ink" };

const STYLE: Record<TextStyle, TextStyleSpec> = {
    display: { size: 46, weight: 600, fontId: "display", tone: "ink" },
    h1: { size: 40, weight: 600, fontId: "display", tone: "ink" },
    h2: { size: 30, weight: 600, fontId: "display", tone: "ink" },
    title: { size: 26, weight: 600, fontId: "display", tone: "ink" },
    stat: { size: 44, weight: 600, fontId: "display", tone: "ink" },
    lead: { size: 20, weight: 400, fontId: "ui", tone: "soft" },
    body: { size: 17, weight: 400, fontId: "ui", tone: "ink" },
    caption: { size: 14, weight: 400, fontId: "ui", tone: "muted" },
    eyebrow: { size: 13, weight: 600, fontId: "mono", tone: "accent" },
    byline: { size: 14, weight: 600, fontId: "mono", tone: "muted" },
};

export const textElement: ElementSpec<TextData> = {
    type: "text",
    label: "Text",
    category: "text",
    tier: "primitive",
    create: () => ({ text: "New text", style: "body" }),
    layout: (data: TextData, ctx: LayoutCtx): EngineNode => {
        const s = STYLE[data.style] ?? FALLBACK;
        return {
            w: grow(),
            h: fit(),
            text: {
                text: data.text,
                fontId: s.fontId,
                size: s.size,
                weight: s.weight,
                color: data.color ?? ctx.theme[s.tone],
                align: data.align ?? "start",
                wrap: "words",
            },
        };
    },
    controls: [
        { key: "text", label: "Text", control: "text" },
        {
            key: "style",
            label: "Style",
            control: "select",
            options: [
                { label: "Display", value: "display" },
                { label: "Heading", value: "h1" },
                { label: "Subhead", value: "h2" },
                { label: "Title", value: "title" },
                { label: "Stat", value: "stat" },
                { label: "Lead", value: "lead" },
                { label: "Body", value: "body" },
                { label: "Caption", value: "caption" },
                { label: "Eyebrow", value: "eyebrow" },
                { label: "Byline", value: "byline" },
            ],
        },
    ],
};

register(textElement);
