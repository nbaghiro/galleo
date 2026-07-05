import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode, TextLeaf } from "@engine/node";
import type { ColorToken, FontRole, Tokens } from "@themes/theme";
import type { Mark } from "@model/text";
import { register, getElement } from "@elements/spec";
import { fit, grow, fixed } from "@model/geometry";
import { fontStack } from "@themes/theme";
import { toRuns } from "@model/text";

type TextStyle =
    // Familiar doc-ladder labels backed by semantic keys (Title=h1, Heading=h2, Subheading=h3) — the
    // web/HTML level rides in the key for export + outline + a11y.
    "h1" | "subtitle" | "h2" | "h3" | "body" | "caption" | "quote" | "label";

interface TextData {
    text: string;
    style: TextStyle;
    align?: "start" | "center" | "end";
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

export const textElement: ElementSpec<TextData> = {
    type: "text",
    label: "Text",
    category: "text",
    tier: "primitive",
    create: () => ({ text: "New text", style: "body" }),
    richText: true, // inline marks (bold/italic/link/color/…) via the marks-aware editor + format bar
    bar: ["style", "align"], // surfaced compactly in the on-canvas format bar (marks come from richText)
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
            options: [
                { label: "Title", value: "h1" },
                { label: "Subtitle", value: "subtitle" },
                { label: "Heading", value: "h2" },
                { label: "Subheading", value: "h3" },
                { label: "Body", value: "body" },
                { label: "Caption", value: "caption" },
                { label: "Quote", value: "quote" },
                { label: "Label", value: "label" },
            ],
        },
        { key: "align", label: "Align", control: "align" },
        { key: "color", label: "Color override", control: "color", group: "Appearance" },
    ],
};

register(textElement);
import type { ElementInstance } from "@model/artifact";

type Marker = "dot" | "number" | "dash" | "check";

interface BulletsData {
    children: ElementInstance[];
    marker?: Marker;
}

function markerNode(marker: Marker, i: number, ctx: LayoutCtx): EngineNode {
    const t = (text: string, color: string, weight?: number): EngineNode => ({
        w: fit(),
        h: fit(),
        text: {
            text,
            fontId: fontStack("mono", ctx.theme),
            size: 14,
            weight,
            color,
            align: "start",
            wrap: "none",
        },
    });
    if (marker === "number") return t(`${i + 1}.`, ctx.theme.accent, 600);
    if (marker === "dash") return t("—", ctx.theme.muted);
    if (marker === "check") return t("✓", ctx.theme.accent, 700);
    return { w: fixed(8), h: fixed(8), fill: { color: ctx.theme.accent, radius: 99 } };
}

const arrangeBullets = (d: BulletsData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 12,
    children: kids.map(
        (k, i): EngineNode => ({
            w: grow(),
            h: fit(),
            direction: "row",
            gap: 12,
            alignY: "start",
            children: [markerNode(d.marker ?? "dot", i, ctx), k],
        }),
    ),
});

function composeBullets(d: BulletsData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const bulletsElement: ElementSpec<BulletsData> = {
    type: "bullets",
    label: "List",
    category: "text",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "First point", style: "body" } },
            { type: "text", data: { text: "Second point", style: "body" } },
            { type: "text", data: { text: "Third point", style: "body" } },
        ],
        marker: "dot",
    }),
    layout: (d, ctx) => arrangeBullets(d, ctx, composeBullets(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange: arrangeBullets,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [
        {
            key: "marker",
            label: "Marker",
            control: "segmented",
            options: [
                { label: "•", value: "dot" },
                { label: "1.", value: "number" },
                { label: "–", value: "dash" },
                { label: "✓", value: "check" },
            ],
        },
    ],
};

register(bulletsElement);

// A note box (note/tip/warn) with an accent bar and real text children — the body edits inline.
type Tone = "note" | "info" | "tip" | "success" | "warn" | "caution" | "question";

interface CalloutData {
    children: ElementInstance[];
    tone?: Tone;
}

function toneColor(tone: Tone | undefined, t: Tokens): string {
    switch (tone) {
        case "info":
            return "#2d5bff";
        case "tip":
            return "#3f8f4f";
        case "success":
            return "#2e9e5b";
        case "warn":
            return "#d98324";
        case "caution":
            return "#c2402c";
        case "question":
            return "#7a5af0";
        default:
            return t.accent; // note
    }
}

const arrangeCallout = (d: CalloutData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    fill: {
        color: ctx.theme.bg,
        radius: Math.round(ctx.theme.radius / 1.6),
        border: { color: ctx.theme.line, width: 1 },
    },
    children: [
        { w: fixed(4), h: grow(), fill: { color: toneColor(d.tone, ctx.theme) } },
        {
            w: grow(),
            h: fit(),
            direction: "col",
            gap: 6,
            padding: { top: 14, bottom: 14, left: 16, right: 16 },
            children: kids,
        },
    ],
});

export const calloutElement: ElementSpec<CalloutData> = {
    type: "callout",
    label: "Callout",
    category: "text",
    tier: "smart",
    create: () => ({
        children: [
            {
                type: "text",
                data: {
                    text: "Heads up — callouts hold real text you can edit inline.",
                    style: "body",
                },
            },
        ],
        tone: "note",
    }),
    layout: (d, ctx) =>
        arrangeCallout(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange: arrangeCallout,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [
        {
            key: "tone",
            label: "Tone",
            control: "select",
            options: [
                { label: "Note", value: "note" },
                { label: "Info", value: "info" },
                { label: "Tip", value: "tip" },
                { label: "Success", value: "success" },
                { label: "Warning", value: "warn" },
                { label: "Caution", value: "caution" },
                { label: "Question", value: "question" },
            ],
        },
    ],
};

register(calloutElement);

interface CodeData {
    code: string;
}

export const codeElement: ElementSpec<CodeData> = {
    type: "code",
    label: "Code",
    category: "text",
    tier: "smart",
    create: () => ({ code: "const galleo = createEditor();\ngalleo.render(artifact);" }),
    layout: (d: CodeData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 2,
        padding: { top: 16, bottom: 16, left: 18, right: 18 },
        fill: {
            color: ctx.theme.bg,
            radius: Math.round(ctx.theme.radius / 2),
            border: { color: ctx.theme.line, width: 1 },
        },
        children: d.code.split("\n").map(
            (line): EngineNode => ({
                w: grow(),
                h: fit(),
                text: {
                    text: line.length ? line : " ",
                    fontId: fontStack("mono", ctx.theme),
                    size: 13.5,
                    color: ctx.theme.ink,
                    align: "start",
                    wrap: "words",
                },
            }),
        ),
    }),
    controls: [
        { key: "code", label: "Code", control: "text", multiline: true, placeholder: "// code" },
    ],
};

register(codeElement);

// A quote is a statement + attribution — both real text children.
interface QuoteData {
    children: ElementInstance[];
}

const arrangeQuote = (_d: QuoteData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 10,
    children: kids,
});

function composeQuote(d: QuoteData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const quoteElement: ElementSpec<QuoteData> = {
    type: "quote",
    label: "Quote",
    category: "text",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "Taste is the only moat left.", style: "h3" } },
            { type: "text", data: { text: "— the thesis", style: "caption" } },
        ],
    }),
    layout: (d, ctx) => arrangeQuote(d, ctx, composeQuote(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange: arrangeQuote,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [],
};

register(quoteElement);
