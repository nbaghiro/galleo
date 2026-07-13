import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode, TextLeaf } from "@engine/node";
import type { ColorToken, FontRole } from "@themes";
import type { Mark } from "@model/text";
import type { TextAlign, TextStyle } from "@model/elements";
import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { fontStack } from "@themes";
import { toRuns } from "@model/text";
import { TEXT_STYLES } from "@model/elements";

interface TextData {
    text: string;
    style: TextStyle;
    align?: TextAlign;
    color?: string; // explicit override; else the style's theme tone
    marks?: Mark[]; // inline formatting, offset ranges over `text`; absent → plain
}

interface TextStyleSpec {
    size: number;
    weight: number;
    fontId: FontRole;
    tone: ColorToken;
}

const FALLBACK: TextStyleSpec = { size: 17, weight: 400, fontId: "ui", tone: "ink" };

const STYLE: Record<TextStyle, TextStyleSpec> = {
    h1: { size: 44, weight: 600, fontId: "display", tone: "ink" },
    subtitle: { size: 22, weight: 400, fontId: "ui", tone: "soft" },
    h2: { size: 32, weight: 600, fontId: "display", tone: "ink" },
    h3: { size: 24, weight: 600, fontId: "display", tone: "ink" },
    body: { size: 17, weight: 400, fontId: "ui", tone: "ink" },
    caption: { size: 14, weight: 400, fontId: "ui", tone: "muted" },
    quote: { size: 21, weight: 400, fontId: "ui", tone: "soft" },
    label: { size: 13, weight: 600, fontId: "mono", tone: "accent" },
};

// Semantic keys (h1/h2/h3) carry the web/HTML level for export + outline + a11y.
const STYLE_LABELS: Record<TextStyle, string> = {
    h1: "Title",
    subtitle: "Subtitle",
    h2: "Heading",
    h3: "Subheading",
    body: "Body",
    caption: "Caption",
    quote: "Quote",
    label: "Label",
};

export const textElement: ElementSpec<TextData> = {
    type: "text",
    label: "Text",
    category: "text",
    tier: "primitive",
    create: () => ({ text: "New text", style: "body" }),
    richText: true,
    bar: ["style", "align", "color"], // color = block-level override; per-range color comes from marks
    layout: (data: TextData, ctx: LayoutCtx): EngineNode => {
        const s = STYLE[data.style] ?? FALLBACK;
        const text: TextLeaf = {
            text: data.text,
            fontId: fontStack(s.fontId, ctx.theme),
            size: s.size,
            weight: s.fontId === "display" ? ctx.theme.headingWeight : s.weight,
            color: data.color ?? ctx.theme[s.tone],
            align: data.align ?? "start",
            wrap: "words",
        };
        // only build runs when marks exist; plain text leaf stays unchanged.
        if (data.marks && data.marks.length > 0) {
            text.runs = toRuns(data.text, data.marks);
        }
        return { w: grow(), h: fit(), text };
    },
    controls: [
        // no "Content" control: text is richText, edited inline, so a docked textarea renders nowhere.
        {
            key: "style",
            label: "Style",
            control: "select",
            options: TEXT_STYLES.map((v) => ({ value: v, label: STYLE_LABELS[v] })),
        },
        { key: "align", label: "Align", control: "align" },
        { key: "color", label: "Color override", control: "color", group: "Appearance" },
    ],
};

register(textElement);
