import type { ArtifactContent, Section, ElementInstance } from "@model/artifact";
import type { PptxDeck, PptxLayout } from "@services/utils/pptx";
import {
    bgTone,
    bullets,
    card,
    chart,
    col,
    diagram,
    grid,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    w,
} from "@model/authoring";

// A template names its layouts ("Quote", "VS Slide", "1_Timeline Chart"), which says what a design
// is for far better than its geometry does; the structure is only the tie-breaker.
export type DesignKind =
    | "cover"
    | "agenda"
    | "divider"
    | "statement"
    | "split"
    | "cards"
    | "comparison"
    | "timeline"
    | "table"
    | "chart"
    | "quote"
    | "photo"
    | "closing";

export interface TemplateDesign {
    id: string; // slug of the layout's own name; the id a beat names to choose this design
    name: string; // the layout's name, as the file wrote it
    kind: DesignKind;
    columns: number; // how many sibling slots the design repeats, from its worked example
    image: boolean; // the design leads with a picture
}

// First match wins, so the specific names sit above the generic ones. Forgiving about spelling
// ("coloumn" is in a real deck), strict about word boundaries, since "Graphic" is not a chart.
const NAMED: [RegExp, DesignKind][] = [
    [/master title|title slide|cover/i, "cover"],
    [/table of content|agenda/i, "agenda"],
    [/section title|divider|chapter/i, "divider"],
    [/quote|testimonial/i, "quote"],
    [/thank you|closing|q ?& ?a/i, "closing"],
    [/timeline|roadmap/i, "timeline"],
    [/\bvs\b|versus|compar/i, "comparison"],
    [/\btables?\b/i, "table"],
    [/\bcharts?\b|\bgraphs?\b/i, "chart"],
    [/full pic|full image|full photo/i, "photo"],
    [/spotlight|award|profile|headshot/i, "split"],
    [/coloumn|column|icons?\b/i, "cards"],
    [/overview|image|graphic|picture/i, "split"],
    [/only text|text slide/i, "statement"],
];

/** The design a layout is for: its name first, its shape only where the name says nothing. */
export function designKindOf(name: string | undefined, slots: PptxLayout["slots"]): DesignKind {
    // a file writes its names with underscores ("1_Table Slide"), and an underscore is a word
    // character, so word boundaries only mean anything once they are spaces
    const words = (name ?? "").replace(/[_-]+/g, " ");
    for (const [re, kind] of NAMED) if (words && re.test(words)) return kind;
    const media = slots.filter((s) => s.role === "media").length;
    const text = slots.length - media;
    if (media && text === 0) return "photo";
    if (media) return "split";
    if (text >= 4) return "cards";
    return "statement";
}

export const designId = (name: string, index: number): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || `design-${index + 1}`;

/** The template's design library, one entry per layout the file declares. */
export function designCatalog(deck: PptxDeck): TemplateDesign[] {
    const out: TemplateDesign[] = [];
    const seen = new Set<string>();
    deck.layouts.forEach((layout, i) => {
        const name = layout.name?.trim() || `Layout ${i + 1}`;
        const id = designId(name, i);
        if (seen.has(id) || layout.slots.length === 0) return;
        seen.add(id);
        const kind = designKindOf(name, layout.slots);
        // a repeating design says how many times in its own name, and that beats counting slots:
        // the repeats are often drawn decoration, so a visibly three-up layout declares one
        const stated = /(\d+)[\s_-]*(?:text[\s_-]*)?(?:coloumn|column|up|part|step)/i.exec(
            name,
        )?.[1];
        const repeated = layout.slots.filter((s) => s.role === "body" || s.role === "media").length;
        out.push({
            id,
            name,
            kind,
            // past four the row the presets can name is spent, and the cards case builds a grid
            columns: Math.min(6, Math.max(1, stated ? Number(stated) : repeated)),
            image: layout.slots.some((s) => s.role === "media"),
        });
    });
    return out;
}

// The copy a design library carries. A design has no words of its own, and inventing some would
// read as content rather than as a slot, so every label says what belongs there.
const LABEL = {
    title: "Title",
    sub: "Subtitle",
    body: "Body text goes here, a sentence or two at the length this design is drawn for.",
    point: "Supporting point",
    caption: "Caption",
} as const;

const columnCard = (i: number): ElementInstance =>
    card(t(`${LABEL.sub} ${i + 1}`, "h3"), t(LABEL.body, "body"));

const nOf = <T>(n: number, make: (i: number) => T): T[] =>
    Array.from({ length: n }, (_, i) => make(i));

/**
 * A design as a Galleo section, built from our own elements so it renders, edits and reflows like
 * anything else rather than being a frozen picture. What the file expresses and we cannot (offset
 * overlapping panels, drawn geometry) becomes the nearest honest arrangement instead of a fake.
 */
export function designSection(d: TemplateDesign): Section {
    const heading = t(LABEL.title, "h1");
    const lead = t(LABEL.body, "body");
    const cols = d.columns;
    switch (d.kind) {
        case "cover":
            return section(d.id, col(t("EYEBROW", "label"), heading, t(LABEL.sub, "subtitle")), {
                bleed: true,
                background: bgTone("contrast"),
            });
        case "divider":
            return section(d.id, col(t("SECTION", "label"), heading), {
                bleed: true,
                background: bgTone("accent"),
            });
        case "agenda":
            return section(
                d.id,
                col(
                    t(LABEL.title, "h2"),
                    row(
                        ...nOf(Math.max(2, Math.min(3, cols)), (i) =>
                            card(t(`0${i + 1}`, "h2"), t(LABEL.sub, "body")),
                        ),
                    ),
                ),
            );
        case "quote":
            return section(d.id, quote(LABEL.body, "Name, role"), { background: bgTone("accent") });
        case "table":
            return section(
                d.id,
                col(
                    t(LABEL.title, "h2"),
                    table("Column,Column,Column\nRow,Row,Row\nRow,Row,Row", true, 1),
                ),
            );
        case "chart":
            return section(
                d.id,
                split(60, col(t(LABEL.title, "h2"), lead), chart("bar", "48, 62, 55, 71")),
            );
        case "timeline":
            return section(
                d.id,
                col(
                    t(LABEL.title, "h2"),
                    diagram("process", nOf(cols, (i) => `Step ${i + 1}`).join(", ")),
                ),
            );
        case "comparison":
            return section(
                d.id,
                col(
                    t(LABEL.title, "h2"),
                    row(
                        w(50, card(t(LABEL.sub, "h3"), t(LABEL.body, "body"))),
                        w(50, card(t(LABEL.sub, "h3"), t(LABEL.body, "body"))),
                    ),
                ),
            );
        case "cards":
            // one row while it fits; past four, a grid keeps the columns aligned across rows
            return section(
                d.id,
                col(
                    t(LABEL.title, "h2"),
                    cols > 4
                        ? grid(3, ...nOf(cols, columnCard))
                        : row(...nOf(Math.max(2, cols), columnCard)),
                ),
            );
        case "photo":
            return section(d.id, col(t("EYEBROW", "label"), heading), {
                bleed: true,
                background: { kind: "image", image: "a wide photograph", scrim: 0.5 },
            });
        case "closing":
            return section(d.id, col(heading, t(LABEL.sub, "subtitle")), {
                bleed: true,
                background: bgTone("accent"),
            });
        case "split":
            return section(
                d.id,
                split(
                    55,
                    col(t(LABEL.title, "h2"), lead, bullets(LABEL.point, LABEL.point, LABEL.point)),
                    img(
                        "https://images.pexels.com/photos/154738/pexels-photo-154738.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        4 / 3,
                    ),
                ),
            );
        default:
            return section(d.id, col(t(LABEL.title, "h2"), lead, stat("00", LABEL.caption)));
    }
}

/** The template's designs as an artifact: one section per design, in the file's own order. */
export function designsToContent(deck: PptxDeck, themeId: string): ArtifactContent {
    const catalog = designCatalog(deck);
    return {
        format: "deck",
        theme: themeId,
        sections: catalog.map((d) => designSection(d)),
    };
}
