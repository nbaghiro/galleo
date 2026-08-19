import { LAYOUT_PRESETS } from "@model/artifact";
import {
    BULLET_MARKERS,
    BUTTON_VARIANTS,
    CALLOUT_TONES,
    CARD_STYLES,
    CHART_TYPES,
    DIAGRAM_ICONS,
    DIAGRAM_NUMBERS,
    DIAGRAM_SHAPES,
    DIAGRAM_STYLES,
    DIAGRAM_TYPES,
    FLEX_DIRECTION,
    IMAGE_FIT,
    TEXT_ALIGN,
    TEXT_STYLES,
} from "@model/elements";
import { THEME_LIST, resolveTheme } from "@themes";

// The vocabulary the LLM writes against, and the markdown it is handed. Data and renderer sit
// together so a new element can't be described in the prompt without being declared here first;
// the Zod shape in ../schema.ts validates what comes back against the same names.

// guidance only: the model can author custom widths
interface LayoutPreset {
    id: string;
    columns: number;
    widths: string; // human description of the column split
    when: string;
}

const LAYOUT_HINTS: Record<string, { widths: string; when: string }> = {
    full: {
        widths: "one full-width column",
        when: "a hero, a single statement, one big image, or a centered moment",
    },
    "split-6040": {
        widths: "60% / 40%",
        when: "text-forward with a supporting image/visual on the right",
    },
    "split-4060": {
        widths: "40% / 60%",
        when: "an image/visual on the left, text on the right",
    },
    "two-col": { widths: "50% / 50%", when: "two balanced ideas or a compare/contrast" },
    "three-up": {
        widths: "three equal thirds",
        when: "three features, steps, stats, or cards side by side",
    },
};

export const LAYOUTS: readonly LayoutPreset[] = Object.keys(LAYOUT_PRESETS).map((id) => {
    const h = LAYOUT_HINTS[id] ?? { widths: "", when: "" };
    return { id, columns: LAYOUT_PRESETS[id]!.length, widths: h.widths, when: h.when };
});

type FieldType = "string" | "text" | "number" | "boolean" | "enum" | "children" | "json";

interface FieldSpec {
    key: string;
    type: FieldType;
    required?: boolean;
    values?: readonly string[]; // for type "enum"
    default?: string | number | boolean;
    desc: string; // guidance for the LLM
}

interface ElementSchema {
    type: string; // the ElementInstance.type to emit
    label: string;
    category: string;
    container?: boolean; // true → data.children holds nested elements
    when: string;
    fields: readonly FieldSpec[];
}

const childrenField = (desc: string): FieldSpec => ({
    key: "children",
    type: "children",
    required: true,
    desc,
});

export const ELEMENTS: readonly ElementSchema[] = [
    {
        type: "text",
        label: "Text",
        category: "text",
        when: "any standalone piece of writing, a title, a paragraph, an eyebrow label, a caption",
        fields: [
            {
                key: "text",
                type: "text",
                required: true,
                desc: "the writing itself; real, specific copy. Never lorem ipsum or placeholders",
            },
            {
                key: "style",
                type: "enum",
                required: true,
                values: TEXT_STYLES,
                default: "body",
                desc: "the typographic role; one `h1` per section max",
            },
            {
                key: "align",
                type: "enum",
                values: TEXT_ALIGN,
                desc: "text alignment; omit for default left/start",
            },
        ],
    },
    {
        type: "bullets",
        label: "List",
        category: "text",
        container: true,
        when: "3–6 short parallel points; prefer over a wall of body text",
        fields: [
            childrenField(
                "one `text` element per row, each { type:'text', data:{ text, style:'body' } }",
            ),
            {
                key: "marker",
                type: "enum",
                values: BULLET_MARKERS,
                default: "dot",
                desc: "dot • / number 1. / dash / check ✓ / arrow → / checkbox (a toggleable checklist: a done item sets checked: true in that child text's data)",
            },
        ],
    },
    {
        type: "callout",
        label: "Callout",
        category: "text",
        container: true,
        when: "one point that must stand out, a warning, a tip, a key takeaway",
        fields: [
            childrenField("the callout body, usually one `text` (style 'body')"),
            {
                key: "tone",
                type: "enum",
                values: CALLOUT_TONES,
                default: "note",
                desc: "sets the accent color/meaning",
            },
        ],
    },
    {
        type: "quote",
        label: "Quote",
        category: "text",
        container: true,
        when: "a pulled quotation or testimonial with attribution",
        fields: [
            childrenField(
                "exactly two `text` elements: the quote (style 'h3') then the attribution (style 'caption')",
            ),
        ],
    },
    {
        type: "code",
        label: "Code",
        category: "text",
        when: "a code snippet or monospaced technical content",
        fields: [
            {
                key: "code",
                type: "text",
                required: true,
                desc: "the code; use \\n for line breaks",
            },
        ],
    },

    {
        type: "image",
        label: "Image",
        category: "media",
        when: "a photo or illustration; the workhorse visual",
        fields: [
            {
                key: "src",
                type: "string",
                required: true,
                desc: "an image URL; if unknown. Use a short descriptive phrase and the module will source/generate it",
            },
            {
                key: "aspect",
                type: "number",
                default: 1.5,
                desc: "width ÷ height (1.5 = landscape, 1 = square, 0.8 = portrait)",
            },
            {
                key: "fit",
                type: "enum",
                values: IMAGE_FIT,
                default: "cover",
                desc: "cover (fill+crop) or contain (letterbox)",
            },
            {
                key: "radius",
                type: "number",
                desc: "corner radius in px; omit to inherit the theme",
            },
        ],
    },
    {
        type: "video",
        label: "Video",
        category: "media",
        when: "an embeddable video (YouTube/Vimeo/mp4)",
        fields: [
            { key: "src", type: "string", desc: "the video URL (YouTube, Vimeo, or mp4)" },
            { key: "autoplay", type: "boolean", desc: "start playing muted on view" },
            { key: "loop", type: "boolean", desc: "loop playback" },
        ],
    },

    {
        type: "stat",
        label: "Stat",
        category: "data",
        container: true,
        when: "a single headline number with a label, the most persuasive way to show one metric",
        fields: [
            childrenField(
                "two `text` elements: the value (style 'h1', e.g. '92%') then its label (style 'caption')",
            ),
        ],
    },
    {
        type: "table",
        label: "Table",
        category: "data",
        when: "tabular data, a comparison grid, a pricing matrix, a schedule",
        fields: [
            {
                key: "data",
                type: "text",
                required: true,
                desc: "rows separated by newline (\\n), cells by comma. First row is the header.",
            },
            {
                key: "header",
                type: "boolean",
                default: true,
                desc: "render the first row as a bold header",
            },
        ],
    },

    {
        type: "chart",
        label: "Chart",
        category: "data",
        when: "quantitative data worth visualizing, trends, comparisons, distributions, proportions",
        fields: [
            {
                key: "type",
                type: "enum",
                required: true,
                values: CHART_TYPES,
                desc: "which chart to draw",
            },
            {
                key: "values",
                type: "text",
                required: true,
                desc: "one series per line (\\n); points comma-separated within a line. e.g. '48, 62, 55, 71' or two lines for two series. scatter=x row+y row; bubble=x+y+size rows; gauge='value, max'; heatmap=one row of cells per grid row (categories label the columns, seriesNames the rows).",
            },
            {
                key: "categories",
                type: "string",
                desc: "x-axis / slice labels, comma-separated (match the point count)",
            },
            {
                key: "seriesNames",
                type: "string",
                desc: "legend labels for multi-series charts, comma-separated",
            },
            { key: "stacked", type: "boolean", desc: "stack series (bar/column/area)" },
            { key: "smooth", type: "boolean", desc: "smooth the line (line/area)" },
        ],
    },

    {
        type: "diagram",
        label: "Diagram",
        category: "data",
        when: "a relationship the reader should see as structure, a process, a cycle, staged growth, a hierarchy, a timeline, a 2×2",
        fields: [
            {
                key: "type",
                type: "enum",
                required: true,
                values: DIAGRAM_TYPES,
                desc: "which diagram. For a LINEAR sequence of steps use `process` (connected steps, reads left-to-right). `steps` = a staircase of escalating stages; `cycle` = a repeating loop; `funnel` = narrowing stages; `pyramid` = layered levels; `timeline` = dated milestones; `matrix` = a labeled grid; `quadrant` = a 2×2 that reads exactly 4 items; `hub` = one centre with satellites (first item is the centre). Reserve `org` for a genuine hierarchy. It requires the `links` field.",
            },
            {
                key: "items",
                type: "text",
                required: true,
                desc: "the node labels, comma-separated, or one per line, which is required if any label contains a comma. An entry may add a short supporting phrase after a pipe ('Label | why it matters'), rendered smaller under the label. A number after a second pipe ('Label | detail | 2') is read by `funnel`, where it sizes each band so the stages are proportional (give every stage one, or none). Other types ignore it.",
            },
            {
                key: "links",
                type: "text",
                desc: "edges for `org` only: 'Parent>Child, Parent>Child' building the hierarchy. Each name must match an items label exactly; the item no edge points at becomes the root. Omit for every other type.",
            },
            {
                key: "axes",
                type: "text",
                desc: "captions, comma-separated, only for: `quadrant` (4 axis ends: x low, x high, y low, y high), `matrix` (column headers then row headers)",
            },
            {
                key: "style",
                type: "enum",
                values: DIAGRAM_STYLES,
                desc: "node treatment: `solid` (filled, default) · `tinted` (soft wash of the color) · `card` (paper panels with a hairline and shadow) · `outline` (stroked). Omit unless the design calls for a lighter look.",
            },
            {
                key: "shape",
                type: "enum",
                values: DIAGRAM_SHAPES,
                desc: "node silhouette, honored by process/cycle/hub/matrix: `chevron` turns a process into arrow bands, `pill` softens peer sets, `hexagon` reads technical. Omit for the default `rounded`.",
            },
            {
                key: "numbers",
                type: "enum",
                values: DIAGRAM_NUMBERS,
                desc: "leading-edge badge on each node, honored by process/steps/cycle/hub/matrix: `number` (1 2 3) for sequences, `letter` (A B C) for peer options. Omit otherwise.",
            },
            {
                key: "itemsMeta",
                type: "json",
                desc: `optional per-item styling, positional: entry i styles item i, so give one entry per item ({} for an unstyled one) or omit the field entirely. Each entry may set: icon, one of ${DIAGRAM_ICONS.join(" | ")}, a leading glyph on the node (all types except pyramid/funnel; a timeline renders it as the milestone marker on the line) that replaces that item's number badge; emphasis: true, promoting the node to the solid treatment (the hub centre and org root already have it); color, overriding that item's ramp color with a hex or a theme role name (\`accent\`, \`ink\`, ...), roles staying live when the theme changes. Icons earn their place on peer-value sets (hub spokes, matrix cells, quadrants) and milestones. Never invent an icon key. An entry may also set weight, a positive width ratio vs the item's row siblings (\`process\` only; 1 = equal share); omit it unless the content genuinely wants uneven emphasis.`,
            },
        ],
    },

    {
        type: "card",
        label: "Card",
        category: "container",
        container: true,
        when: "group a small cluster of elements into a bordered/filled panel, a feature, a plan, a person",
        fields: [
            childrenField(
                "the card's contents, typically a `text` title (h3) + a `text` body, or a stat",
            ),
            {
                key: "style",
                type: "enum",
                values: CARD_STYLES,
                default: "solid",
                desc: "solid filled / outline / left sideline / top topline / plain",
            },
            {
                key: "direction",
                type: "enum",
                values: FLEX_DIRECTION,
                default: "col",
                desc: "stack children (col) or lay them in a row",
            },
        ],
    },
    {
        type: "group",
        label: "Group",
        category: "container",
        container: true,
        when: "the default way to put several elements in one cell (a stacked title+subtitle+body, or an N-column grid of cards/stats)",
        fields: [
            childrenField("the grouped elements in order"),
            {
                key: "columns",
                type: "number",
                desc: "1–6; >1 lays children out as an N-column grid (great for 3 cards/stats)",
            },
            {
                key: "direction",
                type: "enum",
                values: FLEX_DIRECTION,
                default: "col",
                desc: "stack (col) or row; ignored when columns > 1",
            },
            {
                key: "align",
                type: "enum",
                values: TEXT_ALIGN,
                desc: "cross-axis alignment of children",
            },
        ],
    },

    {
        type: "button",
        label: "Button",
        category: "interactive",
        when: "a call to action, 'Get started', 'Book a demo'",
        fields: [
            { key: "label", type: "string", required: true, desc: "the button text" },
            {
                key: "variant",
                type: "enum",
                values: BUTTON_VARIANTS,
                default: "filled",
                desc: "filled, outline, soft, or ghost",
            },
        ],
    },
    {
        type: "badge",
        label: "Badge",
        category: "branding",
        when: "a tiny status pill, 'NEW', 'OUT SEPT 4', a tag",
        fields: [
            { key: "text", type: "string", required: true, desc: "the badge text; keep it short" },
        ],
    },
    {
        type: "divider",
        label: "Divider",
        category: "layout",
        when: "a thin rule to separate content within a cell",
        fields: [{ key: "thickness", type: "number", default: 2, desc: "line thickness in px" }],
    },
] as const;

function fieldLine(f: FieldSpec): string {
    const bits: string[] = [];
    if (f.required) bits.push("required");
    if (f.type === "enum" && f.values) bits.push(`one of: ${f.values.join(" | ")}`);
    else bits.push(f.type);
    if (f.default !== undefined) bits.push(`default ${JSON.stringify(f.default)}`);
    return `    - ${f.key} (${bits.join(", ")}), ${f.desc}`;
}

function elementBlock(e: ElementSchema): string {
    const head = `- \`${e.type}\`${e.container ? " [container]" : ""}, ${e.when}`;
    const fields = e.fields.map(fieldLine).join("\n");
    return `${head}\n${fields}`;
}

export function elementCatalog(): string {
    return [
        "## Elements",
        "A section's content is ONE element tree. A leaf is `{ type, data }`; a container (`group`/`card`/…) nests children in `data.children`. Available element types:",
        "",
        ELEMENTS.map(elementBlock).join("\n"),
        "",
        `Text \`style\` values (typographic roles): ${TEXT_STYLES.join(", ")}. Use exactly one \`h1\` per section.`,
        "To place several elements together, wrap them in a `group` (direction 'col' to stack, 'row' for side-by-side) or a `card`. Set `group.columns` for an N-up grid.",
    ].join("\n");
}

export function layoutCatalog(): string {
    const rows = LAYOUTS.map(
        (g) =>
            `- \`${g.id}\`, ${g.widths} (${g.columns} column${g.columns > 1 ? "s" : ""}), ${g.when}`,
    ).join("\n");
    return [
        "## Section layout",
        'A section is `{ id, root }`, where `root` is one element tree. For side-by-side columns, make `root` a `group` with `direction: "row"` whose children each carry `layout: { width: { pct } }` (their column share, summing to ~100). To stack. Use `direction: "col"`. Nest to any depth. For a full-width section, `root` is a single element. These named presets are handy starting splits (custom widths are fine too):',
        "",
        rows,
    ].join("\n");
}

export function describeTheme(id: string): string {
    const t = resolveTheme(id);
    const mode = t.dark ? "dark" : "light";
    return `The active theme is "${t.name}" (${t.tag}, ${mode}). Write in a register that fits a ${t.tag} ${mode} design.`;
}

export function themeCatalog(): string {
    const rows = THEME_LIST.map(
        (t) => `- \`${t.id}\`, ${t.name} (${t.tag}, ${t.dark ? "dark" : "light"})`,
    ).join("\n");
    return ["## Themes", "Pick a theme id whose mood fits the content:", "", rows].join("\n");
}
