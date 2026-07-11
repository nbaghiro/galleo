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
    color?: string; // explicit override; otherwise the style's theme tone is used
    marks?: Mark[]; // optional inline formatting (offset ranges over `text`); absent → plain text
}

// One text primitive covers every text role via `style` (size/weight/font + a theme color `tone`).
// Composites are built from these, so all text edits — and themes — the same way.
interface TextStyleSpec {
    size: number;
    weight: number;
    fontId: FontRole;
    tone: ColorToken;
}

const FALLBACK: TextStyleSpec = { size: 17, weight: 400, fontId: "ui", tone: "ink" };

const STYLE: Record<TextStyle, TextStyleSpec> = {
    // The user-facing ladder (Title / Subtitle / Heading / Subheading / Body / Caption / Quote).
    h1: { size: 44, weight: 600, fontId: "display", tone: "ink" }, // Title
    subtitle: { size: 22, weight: 400, fontId: "ui", tone: "soft" }, // Subtitle
    h2: { size: 32, weight: 600, fontId: "display", tone: "ink" }, // Heading
    h3: { size: 24, weight: 600, fontId: "display", tone: "ink" }, // Subheading
    body: { size: 17, weight: 400, fontId: "ui", tone: "ink" }, // Body
    caption: { size: 14, weight: 400, fontId: "ui", tone: "muted" }, // Caption
    quote: { size: 21, weight: 400, fontId: "ui", tone: "soft" }, // Quote
    label: { size: 13, weight: 600, fontId: "mono", tone: "accent" }, // Label (overline / eyebrow)
};

// Familiar doc-ladder labels backed by semantic keys (Title=h1, Heading=h2, Subheading=h3) — the
// web/HTML level rides in the key for export + outline + a11y.
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
    richText: true, // inline marks (bold/italic/link/color/…) via the marks-aware editor + format bar
    bar: ["style", "align", "color"], // surfaced compactly in the on-canvas format bar (marks come from richText); `color` is the block-level override (per-range color still comes from marks)
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
        // Additive: only when inline marks exist do we flatten them into styled runs. With no marks
        // the leaf is byte-for-byte what it was before, so plain text renders exactly as today.
        if (data.marks && data.marks.length > 0) {
            text.runs = toRuns(data.text, data.marks);
        }
        return { w: grow(), h: fit(), text };
    },
    controls: [
        {
            key: "text",
            label: "Content",
            control: "text",
            multiline: true,
            placeholder: "Type text…",
        },
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
