import type { ElementInstance, Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@model/theme";
import type { SectionArchetype } from "@model/eval";
import type { MeasureText, Rect, RenderCommand } from "@engine/node";
import { DEFAULT_THEME } from "@themes";
import { DEFAULT_PROFILE } from "@engine/profile";
import { layoutSection } from "./commands";

// What shape a section takes once it is laid out, judged from geometry rather than from element
// names. Two sections can reach the same shape with different elements (a "grid" made of cards or of
// stats) and the same elements can make different shapes (two texts stacked is a statement; two
// texts side by side is a split), so the tree alone cannot answer this and the boxes can.

/** A media command wide enough to be composition rather than decoration. */
const MEDIA_MIN = 0.18; // share of the section's width

/** Two boxes count as side by side when they overlap vertically but not horizontally. */
const beside = (a: Rect, b: Rect): boolean =>
    a.x + a.w <= b.x + 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;

const area = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);

function collect(el: ElementInstance | undefined, out: string[]): void {
    if (!el) return;
    if (el.type !== "group") out.push(el.type);
    for (const k of childrenOf(el)) collect(k, out);
}

const childrenOf = (el: ElementInstance): ElementInstance[] =>
    (el.data as { children?: ElementInstance[] }).children ?? [];

/**
 * A repeated unit: a sibling that holds several leaves of its own (a card, a stat with its label, a
 * captioned image). Three of them side by side is a grid. Counting bare leaves instead would call
 * any section with three paragraphs a grid, which is why the composite test is the one that matters.
 */
const isUnit = (el: ElementInstance): boolean => {
    const leaves: string[] = [];
    collect(el, leaves);
    return leaves.length >= 2;
};

const DATA_TYPES = new Set(["chart", "diagram", "table", "stat", "kpi", "metric"]);
const LIST_TYPES = new Set(["list", "checklist", "steps", "timeline", "numbered"]);

export interface SectionShape {
    id: string;
    archetype: SectionArchetype;
    /**
     * A finer signature than the archetype: the shape plus whatever element drives it. Rhythm reads
     * this rather than the archetype, because a chart, a flow diagram, and a table are all `data`
     * and all look nothing like each other, so three of them in a row is variety, not monotony.
     */
    key: string;
    /** Share of the section's area covered by its largest media or data element. */
    dominance: number;
    /** Rendered text characters, the difference between a statement and a wall of copy. */
    textLength: number;
}

/**
 * Classify one section. Deterministic and layout-derived, so it is free to run over a whole corpus
 * and stable enough to gate on, unlike anything a model decides.
 */
export function classifySection(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): SectionShape {
    const { commands, height } = layoutSection(section, width, measure, theme, format);
    const total = Math.max(1, width * height);
    const types: string[] = [];
    collect(section.root, types);

    const texts = commands.filter((c): c is Extract<RenderCommand, { kind: "text" }> =>
        Boolean(c.kind === "text" && c.text.text.trim()),
    );
    const textLength = texts.reduce((n, c) => n + c.text.text.trim().length, 0);
    const media = commands.filter((c) => c.kind === "image" || c.kind === "surface");
    const biggest = media.reduce((m, c) => Math.max(m, area(c.box)), 0);
    const dominance = biggest / total;

    const hasData = types.some((t) => DATA_TYPES.has(t));
    const hasList = types.some((t) => LIST_TYPES.has(t));

    // a media element covering most of the section, with text over it rather than beside it
    const bleeding = media.some((c) => c.box.w >= width * 0.95 && area(c.box) >= total * 0.6);

    const sideBySide = (a: Rect, b: Rect): boolean => beside(a, b) || beside(b, a);
    const units = childrenOf(section.root).filter(isUnit).length;

    // whichever element gives the section its character, for the rhythm signature
    const driver =
        types.find((t) => DATA_TYPES.has(t)) ?? types.find((t) => LIST_TYPES.has(t)) ?? "";
    const shape = (a: SectionArchetype): SectionShape => ({
        id: section.id,
        archetype: a,
        key: driver ? `${a}:${driver}` : a,
        dominance,
        textLength,
    });

    if (bleeding) return shape("bleed");
    // before data: a row of three stats is a repeated shape, not a chart
    if (units >= 3) return shape("grid");
    if (hasData) return shape("data");
    if (hasList) return shape("list");
    // text and media in separate columns rather than stacked
    const wideMedia = media.filter((m) => m.box.w >= width * MEDIA_MIN);
    if (wideMedia.some((m) => texts.some((t) => sideBySide(t.box, m.box)))) return shape("split");
    if (textLength > 700) return shape("dense");
    return shape("statement");
}

export const classifySections = (
    sections: Section[],
    width: number,
    measure: MeasureText,
    theme?: Tokens,
    format?: FormatDescriptor,
): SectionShape[] => sections.map((s) => classifySection(s, width, measure, theme, format));
