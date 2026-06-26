import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit, grow } from "@model/size";

type TextStyle = "h1" | "h2" | "body" | "eyebrow";

interface TextData {
    text: string;
    style: TextStyle;
    align?: "start" | "center" | "end";
    color?: string;
}

const STYLE: Record<TextStyle, { size: number; weight: number; fontId: string }> = {
    h1: { size: 46, weight: 600, fontId: "display" },
    h2: { size: 30, weight: 600, fontId: "display" },
    body: { size: 17, weight: 400, fontId: "ui" },
    eyebrow: { size: 13, weight: 600, fontId: "mono" },
};

export const textElement: ElementSpec<TextData> = {
    type: "text",
    label: "Text",
    category: "text",
    tier: "primitive",
    create: () => ({ text: "New text", style: "body" }),
    layout: (data: TextData, _ctx: LayoutCtx): EngineNode => {
        const s = STYLE[data.style];
        return {
            w: grow(),
            h: fit(),
            text: {
                text: data.text,
                fontId: s.fontId,
                size: s.size,
                weight: s.weight,
                color: data.color,
                align: data.align ?? "start",
                wrap: "words",
            },
        };
    },
    controls: [
        {
            key: "style",
            label: "Style",
            control: "select",
            options: [
                { label: "Heading", value: "h1" },
                { label: "Subhead", value: "h2" },
                { label: "Body", value: "body" },
                { label: "Eyebrow", value: "eyebrow" },
            ],
        },
    ],
};

register(textElement);
