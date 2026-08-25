import { LAYOUT_PRESETS } from "@model/artifact";
import {
    BULLET_MARKERS,
    BUTTON_SHAPES,
    BUTTON_SIZES,
    BUTTON_VARIANTS,
    CALLOUT_TONES,
    CARD_STYLES,
    CHART_TYPES,
    DIAGRAM_ICONS,
    DIAGRAM_NUMBERS,
    DIAGRAM_SHAPES,
    DIAGRAM_STYLES,
    DIAGRAM_TYPES,
    FAQ_COLLAPSE,
    FLEX_DIRECTION,
    FLEX_JUSTIFY,
    IMAGE_FIT,
    POPUP_VARIANTS,
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
                desc: "a real image URL if you have one; otherwise a short plain-language phrase for the photo you want ('aerial view of a wind farm at dusk') and the module sources or generates it. Write it as a phrase with spaces, never as a hyphenated slug or a filename",
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
            {
                key: "alt",
                type: "string",
                desc: "one plain sentence describing what the picture shows, for screen readers and search. Write it whenever the picture carries meaning; leave it out for pure decoration",
            },
        ],
    },
    {
        type: "video",
        label: "Video",
        category: "media",
        when: "an embeddable video (YouTube/Vimeo/mp4). In a published doc or site it is a real player the reader presses, so reach for it whenever a demo, a walkthrough, or a founder's thirty seconds says the thing faster than prose; every static surface (the editor canvas, a thumbnail, an export) paints the poster instead",
        fields: [
            {
                key: "src",
                type: "string",
                desc: "the video URL (YouTube, Vimeo, or mp4). Only a real one you know; there is no way to source a clip from a description",
            },
            {
                key: "poster",
                type: "string",
                desc: "the still frame every static surface paints: a short plain-language phrase for the shot you want, written the same way as an image `src`. A YouTube link falls back to the provider's own thumbnail, and anything else paints a bare dark box, so set one",
            },
            {
                key: "aspect",
                type: "number",
                default: 1.78,
                desc: "width ÷ height of the player frame; 1.78 is 16:9",
            },
            {
                key: "controls",
                type: "boolean",
                default: true,
                desc: "show the player's own transport controls",
            },
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
                desc: "which chart to draw. `column` = vertical bars comparing a few categories; `bar` = the same read horizontally, which suits long category names; `line`/`area` = a trend along an ordered axis, `area` when the volume is the point and `stacked` when the parts make a whole; `pie`/`donut` = shares of a single total, at most six slices; `treemap`/`pack` = many magnitudes at once, `treemap` when they tile a whole and `pack` when they read as loose bubbles; `scatter`/`bubble` = how two (or three) measures relate; `radar` = one subject scored on several axes; `heatmap` = a grid of intensities; `gauge`/`progress` = one value against its maximum, radial or linear; `waterfall` = how a starting number becomes an ending one through gains and losses.",
            },
            {
                key: "values",
                type: "text",
                required: true,
                desc: "one series per line (\\n); points comma-separated within a line. e.g. '48, 62, 55, 71' or two lines for two series. scatter=x row+y row; bubble=x+y+size rows; gauge and progress='value, max'; heatmap=one row of cells per grid row (categories label the columns, seriesNames the rows); waterfall=one row of signed deltas that accumulate left to right (categories name each step); pack=one row of magnitudes.",
            },
            {
                key: "categories",
                type: "string",
                desc: "category / slice labels, comma-separated (match the point count)",
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
                desc: "which diagram. For a LINEAR sequence of steps use `process` (connected steps, reads left-to-right), NOT `flow`. `steps` = a staircase of escalating stages; `cycle` = a repeating loop; `funnel` = narrowing stages; `pyramid` = layered levels; `timeline` = dated milestones; `roadmap` = phases across time columns (set `axes` to the columns); `matrix` = a labeled grid; `quadrant` = a 2×2 that reads exactly 4 items; `hub` = one centre with satellites (first item is the centre); `target` = nested scopes, widest first; `venn` = two or three overlapping sets, where a fourth item names the overlap and anything past it is dropped; `pictogram` = countable marks per row, where every row draws the same number of marks (set by the largest value) and fills its own, so the rows compare; give each item a value. The graph types need `links`: `flow` for a branching process with decisions, `org` for a reporting hierarchy, `mindmap` for one centre radiating into branches.",
            },
            {
                key: "items",
                type: "text",
                required: true,
                desc: "the node labels, comma-separated, or one per line, which is required if any label contains a comma. An entry may add a short supporting phrase after a pipe ('Label | why it matters'), rendered smaller under the label. A number after a second pipe ('Label | detail | 2') is read by `funnel`, where it sizes each band so the stages are proportional (give every stage one, or none). `pictogram` reads it as the number of marks to draw (whole numbers, at most 20), and `roadmap` as how many columns the phase spans (phases lay end to end in the order given and wrap to a new lane when one no longer fits, so a span is the only placement control). Other types ignore it. For a conversion funnel write the readable metric as the detail and the raw number as the value ('Visitors | 12.4K | 12400'), so the stage reads its figure and the band still scales.",
            },
            {
                key: "links",
                type: "text",
                desc: "edges, for the graph types only. `org` and `mindmap` take 'Parent>Child, Parent>Child'; `flow` takes 'A->B, B->C' with an optional ':label' tail ('Ready?->Ship:yes'). Each name must match an items label exactly; the item no edge points at becomes the root or the entry point. In a `flow` a label ending in '?' draws as a decision diamond and the ends of the path draw as pills, so no extra syntax is needed. Omit for every other type.",
            },
            {
                key: "axes",
                type: "text",
                desc: "captions, comma-separated, only for: `quadrant` (4 axis ends: x low, x high, y low, y high), `matrix` (column headers then row headers), `roadmap` (the time columns, e.g. 'Q1, Q2, Q3, Q4'; without it the lane still draws over four unlabelled columns)",
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
                desc: `optional per-item styling, positional: entry i styles item i, so give one entry per item ({} for an unstyled one) or omit the field entirely. Each entry may set: icon, one of ${DIAGRAM_ICONS.join(" | ")}, a leading glyph on the node (all types except pyramid/funnel; a timeline renders it as the milestone marker on the line) that replaces that item's number badge; emphasis: true, promoting the node to the solid treatment (the hub centre and org root already have it); color, overriding that item's ramp color with a hex or a theme role name (\`accent\`, \`ink\`, ...), roles staying live when the theme changes. In a \`pictogram\` the icon is the mark itself, so set one per row there. Elsewhere icons earn their place on peer-value sets (hub spokes, matrix cells, quadrants) and milestones. Never invent an icon key. An entry may also set weight, a positive width ratio vs the item's row siblings (\`process\` only; 1 = equal share); omit it unless the content genuinely wants uneven emphasis.`,
            },
        ],
    },

    {
        type: "comparison",
        label: "Comparison",
        category: "composite",
        container: true,
        when: "two things weighed against each other, before/after, us/them, option A vs option B",
        fields: [
            childrenField(
                "exactly four `text` elements, two per panel: left heading (style 'h3') then left body (style 'body'), then right heading and right body",
            ),
        ],
    },
    {
        type: "feature",
        label: "Feature",
        category: "composite",
        container: true,
        when: "one capability or benefit as a titled block; three of them in a row `container` is the standard feature grid, and it beats hand-rolling the same thing out of cards",
        fields: [
            childrenField(
                "two or three `text` elements in order: an optional eyebrow (style 'label'), the title (style 'h3'), then a sentence or two (style 'body')",
            ),
        ],
    },
    {
        type: "pricing",
        label: "Pricing tier",
        category: "composite",
        container: true,
        when: "one priced plan. Two to four of them side by side in a row `container` is how a page shows pricing; a `table` of the same tiers reads as a spreadsheet",
        fields: [
            childrenField(
                "five, in order: the tier name (`text`, style 'label'), the price (`text`, style 'h1', e.g. '$49'), the line under it (`text`, style 'caption'), what is included (a `bullets` with marker 'check'), and the action (a `button` with an href)",
            ),
        ],
    },
    {
        type: "testimonial",
        label: "Testimonial",
        category: "composite",
        container: true,
        when: "one customer's own words, with a face and an attribution",
        fields: [
            childrenField(
                "exactly four, read by position: the quote (`text`, style 'quote'), the face ({ type: 'avatar', data: { size: 52, src: '<a generic person description>' } }), the name (`text`, style 'body'), then the role and company (`text`, style 'caption')",
            ),
        ],
    },
    {
        type: "profile",
        label: "Profile",
        category: "composite",
        container: true,
        when: "one person in a team, a speaker line-up, or an author note, centred under their portrait",
        fields: [
            childrenField(
                "in order: the face ({ type: 'avatar', data: { size: 88, src: '<a generic person description>' } }), the name (`text`, style 'h3', align 'center'), the role (`text`, style 'caption', align 'center'), and optionally one more caption line",
            ),
        ],
    },
    {
        type: "cta",
        label: "Call-to-action card",
        category: "composite",
        container: true,
        when: "the tinted card that asks for the single action the piece exists to get; use it where the ask needs a panel of its own rather than a whole banded section",
        fields: [
            childrenField(
                "three, in order: the headline (`text`, style 'h2', align 'center'), one supporting line (`text`, style 'body', align 'center'), and the `button`",
            ),
        ],
    },
    {
        type: "faq",
        label: "FAQ",
        category: "composite",
        container: true,
        when: "questions a reader actually asks, answered in a line or two each",
        fields: [
            childrenField(
                "`text` elements in question/answer pairs: question (style 'h3') then its answer (style 'body'), repeated. Always an even count",
            ),
            {
                key: "collapse",
                type: "enum",
                values: FAQ_COLLAPSE,
                default: "expanded",
                desc: "expanded shows every answer at once; collapsible turns each question into an accordion row a reader opens. With collapsible, an answer whose data sets open: true starts open",
            },
        ],
    },
    {
        type: "tabs",
        label: "Tabs",
        category: "composite",
        container: true,
        when: "two to four alternative views of the same subject, where a reader wants one at a time (audiences, plans, before/after in depth)",
        fields: [
            childrenField(
                "one element per tab, usually a `container` holding that panel's content; keep the panels comparable in length",
            ),
            {
                key: "labels",
                type: "string",
                desc: "the tab names, comma-separated, in panel order; keep each to one or two words",
            },
            {
                key: "active",
                type: "number",
                default: 0,
                desc: "which panel shows by default, 0-based; a static render (export, print) shows only this one",
            },
        ],
    },
    {
        type: "popup",
        label: "Popup",
        category: "composite",
        container: true,
        when: "a detail worth keeping off the page until a reader asks for it: a definition, a caveat, a short list of links behind one trigger",
        fields: [
            childrenField(
                "the elements that make up the floating panel, in order; keep it to a few lines, since a popup that needs scrolling belongs in the flow instead",
            ),
            {
                key: "label",
                type: "string",
                default: "Details",
                desc: "the trigger's own text, one or two words",
            },
            {
                key: "variant",
                type: "enum",
                values: POPUP_VARIANTS,
                default: "panel",
                desc: "panel is a paragraph or two behind the trigger; menu is a tight column, whose children should be `button` elements with an href each",
            },
            {
                key: "open",
                type: "boolean",
                default: false,
                desc: "whether the panel is open on the editing canvas, where it floats over the page rather than taking room in it. A reader always starts with it shut, and a static render (export, print) shows the trigger alone",
            },
        ],
    },
    {
        type: "container",
        label: "Container",
        category: "container",
        container: true,
        when: "the default way to put several elements in one cell: a stacked title+subtitle+body, an N-column row of stats, or a bordered panel for a feature, a plan, a person",
        fields: [
            childrenField("the contained elements in order"),
            {
                key: "direction",
                type: "enum",
                values: FLEX_DIRECTION,
                default: "col",
                desc: "stack children (col) or lay them side by side (row)",
            },
            {
                key: "align",
                type: "enum",
                values: TEXT_ALIGN,
                desc: "cross-axis alignment of children",
            },
            {
                key: "justify",
                type: "enum",
                values: FLEX_JUSTIFY,
                desc: "row only: spread the leftover width between / around / evenly instead of packing the children together. `between` pins the first child to the left edge and the last to the right, which is how a footer row is built; `evenly` is the logo strip",
            },
            {
                key: "surface",
                type: "enum",
                values: CARD_STYLES,
                desc: "omit for a plain stack; set it to draw the container as a panel (solid filled / outline / left sideline / top topline / plain)",
            },
        ],
    },

    {
        type: "button",
        label: "Button",
        category: "interactive",
        when: "a call to action, 'Get started', 'Book a demo'; also every item in a site's nav bar",
        fields: [
            { key: "label", type: "string", required: true, desc: "the button text" },
            {
                key: "variant",
                type: "enum",
                values: BUTTON_VARIANTS,
                default: "filled",
                desc: "filled, outline, soft, or ghost. A nav item is `ghost`, so the bar reads as links rather than a row of buttons",
            },
            {
                key: "size",
                type: "enum",
                values: BUTTON_SIZES,
                default: "md",
                desc: "`sm` for a nav item, `md` for the page's ordinary actions, `lg` for the one button a hero or a closing band is built around",
            },
            {
                key: "shape",
                type: "enum",
                values: BUTTON_SHAPES,
                default: "rounded",
                desc: "`pill` is what marks the nav bar's own call to action apart from the ghost links beside it; `sharp` suits a blockier theme",
            },
            {
                key: "href",
                type: "string",
                desc: "where the button goes: a full URL, which opens in a new tab, or `#<section id>` to scroll to another section of this same piece. Set a URL only when you know a real destination; a section link is always safe, since you know the ids you wrote",
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
        "A section's content is ONE element tree. A leaf is `{ type, data }`; a `container` nests children in `data.children`. Available element types:",
        "",
        ELEMENTS.map(elementBlock).join("\n"),
        "",
        `Text \`style\` values (typographic roles): ${TEXT_STYLES.join(", ")}. Use exactly one \`h1\` per section.`,
        "To place several elements together, wrap them in a `container` (direction 'col' to stack, 'row' for side-by-side). An N-up grid is a row `container` with one child per cell. Give it `surface` to draw it as a panel.",
    ].join("\n");
}

export function layoutCatalog(): string {
    const rows = LAYOUTS.map(
        (g) =>
            `- \`${g.id}\`, ${g.widths} (${g.columns} column${g.columns > 1 ? "s" : ""}), ${g.when}`,
    ).join("\n");
    return [
        "## Section layout",
        'A section is `{ id, root }`, where `root` is one element tree. For side-by-side columns, make `root` a `container` with `direction: "row"` whose children each carry `layout: { width: { pct } }` (their column share, summing to ~100). To stack, use `direction: "col"`. Nest to any depth. For a full-width section, `root` is a single element. These named presets are handy starting splits (custom widths are fine too):',
        "",
        rows,
    ].join("\n");
}

// Web only. The layering the site templates were built from, taught once in prose the way
// `layoutCatalog` teaches column widths: `dock`, `frame.aspect`, and the `#id` link grammar are
// universal fields, so they belong here rather than repeated in each element's own entry.
export function siteAnatomy(): string {
    return [
        "## How a site is built",
        "A website is not a document with wider margins. Four things are what make a page read as a real site, and each one is authorable from the fields above.",
        "",
        '**1. One docked topbar, in the first section only.** Make the first section\'s `root` a `container` (direction \'col\') whose FIRST child is a `container` with `"direction": "row"` and `"layout": { "dock": "top" }`. Docking lifts that row out of the content flow and anchors it to the top edge of the section\'s band, so the hero copy still centres below it. It has to be a direct child of that root container, and no other section gets one. Inside the row, in order: the brand or site name as a `text` (style \'label\') carrying `"layout": { "width": "fill" }`, which takes the slack and pushes everything after it hard right; then each nav item carrying `"layout": { "width": "fit" }`. A nav item is a `button` with `"variant": "ghost"` and `"size": "sm"`; the last one is the bar\'s call to action, `"variant": "filled"`, `"size": "sm"`, `"shape": "pill"`. Past about five links, fold the extras into one `popup` with `"variant": "menu"` whose children are those same ghost buttons.',
        "",
        "**2. Every nav item names a real section.** An `href` of `#<section id>` scrolls the reader to that section of this same page, so the ids you write are the link targets: `#pricing` only works if a section is called `pricing`. Give sections meaningful ids (`hero`, `features`, `pricing`, `faq`, `contact`) rather than s1 and s2, and label each nav item with the words that section's own headline uses. Keep external URLs to one or two, for a real destination you actually know. The hero's own button links DOWN the page to the section that answers it, and the closing band repeats that link, which is the bookend.",
        "",
        '**3. The hero is a band, and the page keeps a rhythm after it.** Give the first section `"frame": { "aspect": 2.3 }` (16:7, and 1.78 is 16:9 if it should sit shorter) with a full-bleed background image and a `scrim` around 0.55: on a scrolling page that number is a minimum height, so the section opens as a tall band with its content centred in it. A slim interlude between two dense sections is the same trick at `"frame": { "aspect": 3.2 }` (16:5): a full-bleed photo with one line of type over it and nothing else. Then alternate the section backgrounds down the page instead of running ten identical bands: default surface, then a tinted one (`"background": { "kind": "color", "color": "<a soft tint that suits the theme>" }, "bleed": true`), then an image band, then plain again. The band before the footer carries a colour of its own and holds the last ask.',
        "",
        '**4. Use the blocks a reader can act on.** `faq` with `"collapse": "collapsible"` for the questions someone has before signing up, `tabs` for two to four takes on one feature area, `video` where a demo explains it faster than a paragraph, `pricing` tiers side by side in a row rather than a pricing table, `testimonial` for a customer\'s words, `profile` for the people, `feature` for a capability grid. Close on a footer section: one row `container` with `"justify": "between"`, each column a `fit`-width stack of a label and its caption lines.',
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
