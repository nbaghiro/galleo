import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
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
    color?: string;
}

// One text primitive covers every text role via `style` (size/weight/font + a default tone that
// `color` can override). Composites are built from these, so all text edits the same way.
interface TextStyleSpec {
    size: number;
    weight: number;
    fontId: string;
    color?: string;
}

const FALLBACK: TextStyleSpec = { size: 17, weight: 400, fontId: "ui" };

const STYLE: Record<TextStyle, TextStyleSpec> = {
    display: { size: 46, weight: 600, fontId: "display" },
    h1: { size: 40, weight: 600, fontId: "display" },
    h2: { size: 30, weight: 600, fontId: "display" },
    title: { size: 26, weight: 600, fontId: "display" },
    stat: { size: 44, weight: 600, fontId: "display" },
    lead: { size: 20, weight: 400, fontId: "ui", color: "#5b5346" },
    body: { size: 17, weight: 400, fontId: "ui" },
    caption: { size: 14, weight: 400, fontId: "ui", color: "#8c8273" },
    eyebrow: { size: 13, weight: 600, fontId: "mono", color: "#9a4f24" },
    byline: { size: 14, weight: 600, fontId: "mono", color: "#8c8273" },
};

export const textElement: ElementSpec<TextData> = {
    type: "text",
    label: "Text",
    category: "text",
    tier: "primitive",
    create: () => ({ text: "New text", style: "body" }),
    layout: (data: TextData, _ctx: LayoutCtx): EngineNode => {
        const s = STYLE[data.style] ?? FALLBACK;
        return {
            w: grow(),
            h: fit(),
            text: {
                text: data.text,
                fontId: s.fontId,
                size: s.size,
                weight: s.weight,
                color: data.color ?? s.color,
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
