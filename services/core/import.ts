import type { ArtifactContent, ElementInstance, Section, SectionBackground } from "@model/artifact";
import type { Mark } from "@model/text";
import type { TextStyle } from "@model/elements";
import { colGroup, emptyRegion, rowGroup } from "@model/artifact";
import type { ThemeInput } from "@themes";
import { createTheme, listThemes } from "@services/core/themes";
import { designCatalog, designsToContent } from "@services/core/designs";
import { contrastRatio, hexToRgb, luminance, mix, THEME_LIST } from "@themes";
import {
    parasText,
    parsePptx,
    type Box,
    type ColorScheme,
    type PptxDeck,
    type PptxLayout,
    type PptxPara,
    type PptxShape,
    type PptxSlide,
} from "@services/utils/pptx";
import { storageFull, storeUpload, type WorkspaceStorage } from "./media";

// The import decision layer: a parsed PowerPoint deck (@services/utils/pptx) mapped into artifact
// content. Slides are absolutely positioned while the engine is flow-based, so the heart of this
// file is flow inference: shapes band into rows by vertical overlap, rows split into columns by
// horizontal separation, and each column becomes a stack — the exact section root shape
// composeSection expects. `storeMedia` is injectable like extract's ImageReader, so tests never
// touch the database.

export const MAX_PPTX_BYTES = 40_000_000;

/** Typed failure the route maps to a status; anything else is a real 500. */
export class ImportError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 402 | 502,
    ) {
        super(message);
    }
}

export type MediaStore = (media: { data: string; mime: string; name?: string }) => Promise<string>;

const dbStore =
    (workspaceId: string): MediaStore =>
    async (m) =>
        (await storeUpload(workspaceId, m)).url;

interface Placed {
    box: Box;
    el: ElementInstance;
}

// shapes whose vertical intervals overlap belong to one row; a small tolerance keeps hand-nudged
// baselines together without merging genuinely stacked content
export function bandRows(items: Placed[]): Placed[][] {
    const sorted = [...items].sort((a, b) => a.box.y - b.box.y);
    const rows: Placed[][] = [];
    let cur: Placed[] = [];
    let bottom = -Infinity;
    for (const it of sorted) {
        const joins = cur.length > 0 && bottom - it.box.y > Math.min(it.box.h, 48) * 0.3;
        if (joins) {
            cur.push(it);
            bottom = Math.max(bottom, it.box.y + it.box.h);
        } else {
            if (cur.length) rows.push(cur);
            cur = [it];
            bottom = it.box.y + it.box.h;
        }
    }
    if (cur.length) rows.push(cur);
    return rows;
}

// within a row, x-interval clusters are columns; overlapping shapes stack inside one column
export function bandColumns(row: Placed[]): Placed[][] {
    const sorted = [...row].sort((a, b) => a.box.x - b.box.x);
    const cols: { right: number; items: Placed[] }[] = [];
    for (const it of sorted) {
        const last = cols[cols.length - 1];
        if (last && it.box.x < last.right - 8) {
            last.items.push(it);
            last.right = Math.max(last.right, it.box.x + it.box.w);
        } else {
            cols.push({ right: it.box.x + it.box.w, items: [it] });
        }
    }
    return cols.map((c) => [...c.items].sort((a, b) => a.box.y - b.box.y));
}

const stackOf = (els: ElementInstance[]): ElementInstance =>
    els.length === 1 ? els[0]! : colGroup(els);

function rowNode(row: Placed[]): ElementInstance {
    const cols = bandColumns(row);
    if (cols.length === 1) return stackOf(cols[0]!.map((p) => p.el));
    const widths = cols.map((c) => {
        const left = Math.min(...c.map((p) => p.box.x));
        const right = Math.max(...c.map((p) => p.box.x + p.box.w));
        return Math.max(1, right - left);
    });
    const total = widths.reduce((a, b) => a + b, 0);
    return rowGroup(
        cols.map((c) => stackOf(c.map((p) => p.el))),
        widths.map((w) => w / total),
    );
}

export function assembleRoot(items: Placed[]): ElementInstance {
    if (items.length === 0) return emptyRegion();
    const rows = bandRows(items);
    if (rows.length === 1) return rowNode(rows[0]!);
    return colGroup(rows.map(rowNode));
}

// our type ramp in px (STYLE in @elements/text/text) bucketed from the run's pt size × 4/3
export function styleForSize(px: number | undefined, fallback: TextStyle): TextStyle {
    if (px === undefined) return fallback;
    if (px >= 40) return "h1";
    if (px >= 27) return "h2";
    if (px >= 20) return "h3";
    if (px >= 13) return "body";
    return "caption";
}

const dominantSizePx = (paras: PptxPara[]): number | undefined => {
    let best: number | undefined;
    for (const p of paras)
        for (const r of p.runs) if (r.sz !== undefined) best = Math.max(best ?? 0, (r.sz * 4) / 3);
    return best;
};

function marksOf(paras: PptxPara[]): { text: string; marks: Mark[] } {
    let text = "";
    const marks: Mark[] = [];
    paras.forEach((p, i) => {
        if (i > 0) text += "\n";
        for (const r of p.runs) {
            const from = text.length;
            text += r.text;
            const to = text.length;
            if (to === from) continue;
            if (r.b) marks.push({ from, to, type: "b" });
            if (r.i) marks.push({ from, to, type: "i" });
            if (r.u) marks.push({ from, to, type: "u" });
        }
    });
    return { text, marks };
}

function textElementOf(paras: PptxPara[], style: TextStyle): ElementInstance {
    const { text, marks } = marksOf(paras);
    const align = paras[0]?.align;
    // an all-bold block is a styling choice, not emphasis inside prose
    const allBold = paras.every((p) => p.runs.every((r) => r.b || !r.text.trim()));
    const kept = allBold ? marks.filter((m) => m.type !== "b") : marks;
    return {
        type: "text",
        data: {
            text,
            style,
            ...(align && align !== "start" ? { align } : {}),
            ...(kept.length ? { marks: kept } : {}),
        },
    };
}

const bulletsElementOf = (paras: PptxPara[], numbered: boolean): ElementInstance => ({
    type: "bullets",
    data: {
        marker: numbered ? "number" : "dot",
        children: paras.map((p) => textElementOf([{ ...p, align: undefined }], "body")),
    },
});

// a body placeholder's paragraphs default to bulleted in PowerPoint (the list style lives on the
// master, which we do not chase); explicit buChar/buNone always wins
const isBullet = (p: PptxPara, bodyRole: boolean, count: number): boolean =>
    p.bullet !== undefined ? p.bullet : bodyRole && count > 1;

export function textBlocksOf(
    paras: PptxPara[],
    role: "title" | "ctrTitle" | "subTitle" | "body" | undefined,
): ElementInstance[] {
    const kept = paras.filter((p) => parasText([p]).length > 0);
    if (!kept.length) return [];
    if (role === "ctrTitle") return [textElementOf(kept, "h1")];
    if (role === "title") return [textElementOf(kept, styleForSize(dominantSizePx(kept), "h2"))];
    if (role === "subTitle") return [textElementOf(kept, "subtitle")];

    const out: ElementInstance[] = [];
    let run: { bullet: boolean; numbered: boolean; paras: PptxPara[] } | null = null;
    const flush = (): void => {
        if (!run) return;
        if (run.bullet) out.push(bulletsElementOf(run.paras, run.numbered));
        else {
            const style = styleForSize(dominantSizePx(run.paras), "body");
            out.push(textElementOf(run.paras, style));
        }
        run = null;
    };
    for (const p of kept) {
        const bullet = isBullet(p, role === "body", kept.length);
        const numbered = bullet && !!p.numbered;
        if (!run || run.bullet !== bullet || run.numbered !== numbered) {
            flush();
            run = { bullet, numbered, paras: [p] };
        } else run.paras.push(p);
    }
    flush();
    return out;
}

const GEOM_SHAPES: [RegExp, string][] = [
    [/^(rect|roundRect|snip)/, "rectangle"],
    [/^ellipse$/, "ellipse"],
    [/^triangle$/, "triangle"],
    [/^star/, "star"],
    [/^line$/, "line"],
    [/arrow/i, "arrow"],
];

const shapeKindOf = (geom: string | undefined): string | null => {
    if (!geom) return null;
    for (const [re, kind] of GEOM_SHAPES) if (re.test(geom)) return kind;
    return null;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const CHART_ELEMENT: Record<string, string> = {
    bar: "barChart",
    column: "columnChart",
    line: "lineChart",
    area: "areaChart",
    pie: "pieChart",
    donut: "donutChart",
    radar: "radarChart",
    scatter: "scatterChart",
};

// the chart grammar splits on commas and newlines, so labels shed both
const plainLabel = (s: string): string =>
    s
        .replace(/[,\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

function chartElementOf(chart: {
    type: string;
    categories: string[];
    series: { name?: string; values: number[] }[];
}): ElementInstance {
    const type = CHART_ELEMENT[chart.type] ? chart.type : "column";
    const n = Math.max(...chart.series.map((s) => s.values.length), 0);
    const categories = Array.from(
        { length: n },
        (_, i) => plainLabel(chart.categories[i] ?? "") || `${i + 1}`,
    );
    return {
        type: CHART_ELEMENT[type]!,
        data: {
            type,
            values: chart.series.map((s) => s.values.join(", ")).join("\n"),
            categories: categories.join(", "),
            seriesNames: chart.series
                .map((s, i) => plainLabel(s.name ?? "") || `Series ${i + 1}`)
                .join(", "),
        },
    };
}

function tableElementOf(cells: string[][], header: boolean): ElementInstance {
    const cols = Math.max(...cells.map((r) => r.length), 1);
    const flat: ElementInstance[] = [];
    for (const row of cells)
        for (let i = 0; i < cols; i++)
            flat.push({ type: "text", data: { text: row[i] ?? "", style: "caption" } });
    return {
        type: "table",
        data: { cols, rows: cells.length, header, cells: flat },
    };
}

interface SlideMapCtx {
    slideW: number;
    slideH: number;
    scale: number; // deck px → artifact px (1280-wide)
    mediaUrl: (path: string) => string | undefined;
}

function elementOf(shape: PptxShape, ctx: SlideMapCtx): ElementInstance | null {
    if (shape.kind === "picture") {
        const src = ctx.mediaUrl(shape.media.path);
        if (!src) return null;
        return {
            type: "image",
            data: {
                src,
                aspect: round2(Math.max(0.05, shape.box.w / Math.max(1, shape.box.h))),
                fit: "cover",
                radius: 0,
                ...(shape.alt ? { alt: shape.alt } : {}),
            },
        };
    }
    if (shape.kind === "table") return tableElementOf(shape.cells, shape.header);
    if (shape.kind === "chart") return chartElementOf(shape.chart);

    const role = shape.role === "meta" ? undefined : shape.role;
    const blocks = textBlocksOf(shape.paras, role);
    if (blocks.length === 0) {
        const kind = shapeKindOf(shape.geom);
        if (!kind || !shape.fill) return null;
        // a filled autoshape with no words is a graphic accent
        return {
            type: "shape",
            data: {
                kind,
                fill: shape.fill,
                height: Math.max(24, Math.round(shape.box.h * ctx.scale)),
            },
        };
    }
    const inner = stackOf(blocks);
    if (shape.fill) {
        // a filled text box reads as a card
        return {
            type: "container",
            data: { surface: "solid", bg: shape.fill, children: blocks },
        };
    }
    return inner;
}

const BG_COVERAGE = 0.88;

const coversSlide = (box: Box, w: number, h: number): boolean =>
    box.w * box.h >= BG_COVERAGE * w * h && box.x <= 0.06 * w && box.y <= 0.06 * h;

function slideBackgroundOf(
    slide: PptxSlide,
    ctx: SlideMapCtx,
    deckDark: boolean,
): { bg?: SectionBackground; consumed: Set<PptxShape> } {
    const consumed = new Set<PptxShape>();
    let bg: SectionBackground | undefined;
    if (slide.bg?.image) {
        const src = ctx.mediaUrl(slide.bg.image.path);
        if (src) bg = { kind: "image", image: src, scrim: 0, dark: deckDark };
    } else if (slide.bg?.color) {
        bg = { kind: "color", color: slide.bg.color };
    }
    // the z-bottom shape covering the slide is a hand-made background, whatever the part says
    const first = slide.shapes[0];
    if (first && coversSlide(first.box, ctx.slideW, ctx.slideH)) {
        if (first.kind === "picture") {
            const src = ctx.mediaUrl(first.media.path);
            if (src) {
                bg = { kind: "image", image: src, scrim: 0, dark: deckDark };
                consumed.add(first);
            }
        } else if (first.kind === "sp" && first.fill && parasText(first.paras).length === 0) {
            bg = { kind: "color", color: first.fill };
            consumed.add(first);
        }
    }
    return { bg, consumed };
}

const dist = (a: string, b: string): number => {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
};

const isHex = (s: string | undefined): s is string => !!s && /^#[0-9a-fA-F]{6}$/.test(s);

/**
 * A deck's named family matched to the closest face we vendor. Passing the file's own font through
 * would be a licensing question answered by accident, and a guard already limits us to the vendored
 * set. The classes are coarse on purpose: the eye reads weight and width before it reads a foundry.
 */
type FaceClass = "serif" | "geometric" | "condensed" | "mono" | "grotesque";

const FACE_CLASSES: [RegExp, FaceClass][] = [
    [/mono|consol|courier|menlo|code/i, "mono"],
    [/narrow|condensed|impact|compressed/i, "condensed"],
    [
        /times|georgia|garamond|cambria|constantia|palatino|book|didot|baskerville|caslon|minion|merriweather|charter|serif/i,
        "serif",
    ],
    [
        /futura|century gothic|avenir|poppins|montserrat|gill sans|questrial|circular|nunito/i,
        "geometric",
    ],
];

const FACES: Record<FaceClass, { display: string; body: string }> = {
    serif: { display: "Newsreader", body: "Lora" },
    geometric: { display: "Sora", body: "Jost" },
    condensed: { display: "Oswald", body: "Barlow" },
    mono: { display: "Space Grotesk", body: "IBM Plex Mono" },
    grotesque: { display: "Archivo", body: "Hanken Grotesk" },
};

export function vendoredFace(name: string | undefined, role: "display" | "body"): string {
    const cls = (name && FACE_CLASSES.find(([re]) => re.test(name))?.[1]) || "grotesque";
    return FACES[cls][role];
}

/**
 * The deck's own look as a Galleo theme. `nearestThemeId` below answers "which of ours is closest",
 * right for a one-off import of someone's slides and wrong for a template whose brand must survive.
 * OOXML carries a palette and a type pairing and nothing else: radius, border, shadow and scrim
 * take the library's defaults rather than an invented reading.
 */
export function themeFromDeck(deck: Pick<PptxDeck, "scheme" | "fonts" | "title">): ThemeInput {
    const bg = isHex(deck.scheme.lt1) ? deck.scheme.lt1 : "#ffffff";
    const ink = isHex(deck.scheme.dk1) ? deck.scheme.dk1 : "#111111";
    const accent = isHex(deck.scheme.accent1) ? deck.scheme.accent1 : ink;
    const dark = luminance(bg) < 0.5;
    return {
        name: deck.title?.trim() || "Imported deck",
        mood: null,
        isDark: dark,
        tokens: {
            bg,
            surface: mix(bg, ink, 0.04),
            ink,
            soft: mix(ink, bg, 0.25),
            muted: mix(ink, bg, 0.45),
            accent,
            onAccent:
                contrastRatio(accent, "#ffffff") >= contrastRatio(accent, ink) ? "#ffffff" : ink,
            line: mix(ink, bg, 0.85),
            radius: 12,
            fontDisplay: vendoredFace(deck.fonts.major, "display"),
            fontBody: vendoredFace(deck.fonts.minor, "body"),
            fontMono: "IBM Plex Mono",
            headingWeight: 700,
        },
    };
}

export function nearestThemeId(scheme: ColorScheme): string {
    const bg = scheme.lt1;
    const ink = scheme.dk1;
    const accent = scheme.accent1;
    if (!isHex(bg) || !isHex(ink)) return "studio";
    let best = "studio";
    let bestScore = Infinity;
    for (const t of THEME_LIST) {
        let score = dist(bg, t.tokens.bg) + dist(ink, t.tokens.ink);
        if (isHex(accent)) score += 0.5 * dist(accent, t.tokens.accent);
        if (score < bestScore) {
            bestScore = score;
            best = t.id;
        }
    }
    return best;
}

const ARTIFACT_W = 1280;
const MIN_SHAPE_AREA = 0.002; // of the slide; smaller is decoration

const scaleBox = (b: Box, k: number): Box => ({
    x: b.x * k,
    y: b.y * k,
    w: b.w * k,
    h: b.h * k,
});

function slideTitleText(slide: PptxSlide): string | undefined {
    for (const s of slide.shapes) {
        if (s.kind !== "sp" || (s.role !== "title" && s.role !== "ctrTitle")) continue;
        const t = parasText(s.paras);
        if (t) return t.split("\n")[0];
    }
    return undefined;
}

function sectionOf(slide: PptxSlide, index: number, ctx: SlideMapCtx, deckDark: boolean): Section {
    const { bg, consumed } = slideBackgroundOf(slide, ctx, deckDark);
    const placed: Placed[] = [];
    for (const shape of slide.shapes) {
        if (consumed.has(shape)) continue;
        if (shape.kind === "sp" && shape.role === "meta") continue;
        const area = (shape.box.w * shape.box.h) / (ctx.slideW * ctx.slideH);
        if (area < MIN_SHAPE_AREA && shape.kind !== "picture") continue;
        const el = elementOf(shape, ctx);
        if (el) placed.push({ box: scaleBox(shape.box, ctx.scale), el });
    }
    return {
        id: `s-${index + 1}`,
        root: assembleRoot(placed),
        ...(bg ? { background: bg } : {}),
        ...(slide.notes ? { notes: { spoken: slide.notes, source: "human" as const } } : {}),
    };
}

export function deckToContent(
    deck: PptxDeck,
    mediaUrl: SlideMapCtx["mediaUrl"],
    themeId?: string,
): ArtifactContent {
    const scale = ARTIFACT_W / Math.max(1, deck.w);
    const pageH = Math.round(deck.h * scale);
    const ctx: SlideMapCtx = { slideW: deck.w, slideH: deck.h, scale, mediaUrl };
    const deckDark = isHex(deck.scheme.lt1) ? luminance(deck.scheme.lt1) < 0.5 : false;
    return {
        format: "deck",
        theme: themeId ?? nearestThemeId(deck.scheme),
        sections: deck.slides.map((s, i) => sectionOf(s, i, ctx, deckDark)),
        ...(pageH !== 720 ? { page: { width: ARTIFACT_W, height: pageH } } : {}),
    };
}

// A layout has slots and no words, so each is named the way PowerPoint names its own. The labels
// are never generated into anything; they carry the shape `sectionForms` reads back off this.
const SLOT_LABEL: Record<string, { text: string; style: TextStyle }> = {
    title: { text: "Title", style: "h1" },
    ctrTitle: { text: "Title", style: "h1" },
    subTitle: { text: "Subtitle", style: "subtitle" },
    body: { text: "Body text", style: "body" },
};

const slotElement = (slot: PptxLayout["slots"][number]): ElementInstance =>
    slot.role === "media"
        ? {
              type: "media",
              data: { kind: "photo", src: "", aspect: slot.box.w / Math.max(1, slot.box.h) },
          }
        : {
              type: "text",
              data: {
                  text: SLOT_LABEL[slot.role]?.text ?? "Body text",
                  style: SLOT_LABEL[slot.role]?.style ?? "body",
              },
          };

/**
 * A template file's layouts as sections. A .potx keeps its whole look in the master and ships no
 * slides, so without this an upload that is *only* a template imports as nothing.
 */
export function layoutsToContent(deck: PptxDeck, themeId?: string): ArtifactContent {
    const scale = ARTIFACT_W / Math.max(1, deck.w);
    const pageH = Math.round(deck.h * scale);
    const usable = deck.layouts.filter((l) => l.slots.length > 0);
    return {
        format: "deck",
        theme: themeId ?? nearestThemeId(deck.scheme),
        sections: usable.map((layout, i) => ({
            id: `s${i + 1}`,
            root: assembleRoot(
                layout.slots.map((slot) => ({
                    box: scaleBox(slot.box, scale),
                    el: slotElement(slot),
                })),
            ),
        })),
        ...(pageH !== 720 ? { page: { width: ARTIFACT_W, height: pageH } } : {}),
    };
}

export interface Imported {
    content: ArtifactContent;
    title: string;
    // what the template lent and what it could not, so a substituted font is told rather than found
    adopted?: {
        designs: { id: string; name: string; kind: string }[];
        fonts: { asked?: string; using: string }[];
        note: string;
    };
}

const uniqueMedia = (deck: PptxDeck): Map<string, { mime: string; data: string }> => {
    const out = new Map<string, { mime: string; data: string }>();
    for (const slide of deck.slides) {
        if (slide.bg?.image) out.set(slide.bg.image.path, slide.bg.image);
        for (const s of slide.shapes) if (s.kind === "picture") out.set(s.media.path, s.media);
    }
    return out;
};

/** The workspace theme for this deck, reusing an identical one rather than adding a duplicate. */
async function adoptDeckTheme(workspaceId: string, deck: PptxDeck): Promise<string | undefined> {
    const want = themeFromDeck(deck);
    const key = JSON.stringify(want.tokens);
    const existing = (await listThemes(workspaceId)).find(
        (t) => t.name === want.name && JSON.stringify(t.tokens) === key,
    );
    return existing ? existing.id : (await createTheme(workspaceId, want))?.id;
}

export async function importPptx(
    ws: WorkspaceStorage,
    input: { data: Uint8Array; name?: string },
    store: MediaStore = dbStore(ws.id),
    // "designs" reads the file as a template: its layouts become a library of designs a run can be
    // planned against, rather than its slides becoming someone else's content.
    as: "content" | "designs" = "content",
): Promise<Imported> {
    if (input.data.byteLength > MAX_PPTX_BYTES)
        throw new ImportError(
            `That file is too large to import (limit ${Math.round(MAX_PPTX_BYTES / 1_000_000)} MB).`,
            400,
        );
    const deck = await parsePptx(input.data).catch(() => {
        throw new ImportError(
            `${input.name ?? "That file"} couldn't be opened — is it a valid .pptx?`,
            400,
        );
    });
    const wantDesigns = as === "designs";
    const fromLayouts = wantDesigns || deck.slides.length === 0;
    if (fromLayouts && deck.layouts.every((l) => l.slots.length === 0))
        throw new ImportError(
            wantDesigns
                ? "That file has no slide layouts, so there are no designs to take from it."
                : "That presentation has no slides or layouts to import.",
            400,
        );

    const media = uniqueMedia(deck);
    const incoming = [...media.values()].reduce((n, m) => n + (m.data.length * 3) / 4, 0);
    if (incoming > 0 && (await storageFull(ws, incoming)))
        throw new ImportError("storage limit reached", 402);

    const urls = new Map<string, string>();
    for (const [path, m] of media) urls.set(path, await store({ data: m.data, mime: m.mime }));

    // the deck keeps its own palette rather than snapping to the nearest built-in, which stays the
    // fallback: failing to save a theme is not worth losing the import over
    const themeId = await adoptDeckTheme(ws.id, deck).catch(() => undefined);
    const content = wantDesigns
        ? designsToContent(deck, themeId ?? nearestThemeId(deck.scheme))
        : fromLayouts
          ? layoutsToContent(deck, themeId)
          : deckToContent(deck, (path) => urls.get(path), themeId);
    const fileTitle = input.name?.replace(/\.[^.]+$/, "").trim();
    const adopted = wantDesigns
        ? {
              designs: designCatalog(deck).map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
              fonts: [
                  {
                      ...(deck.fonts.major ? { asked: deck.fonts.major } : {}),
                      using: vendoredFace(deck.fonts.major, "display"),
                  },
                  {
                      ...(deck.fonts.minor ? { asked: deck.fonts.minor } : {}),
                      using: vendoredFace(deck.fonts.minor, "body"),
                  },
              ],
              note: "Colours and type pairing carried over. Each design is rebuilt from Galleo's own elements, so it renders and edits everywhere; a fixed logo, exact type sizes and drawn effects do not travel.",
          }
        : undefined;

    const title = wantDesigns
        ? `${fileTitle ?? deck.title ?? "Template"} designs`
        : (deck.title ?? slideTitleText(deck.slides[0]!) ?? fileTitle ?? "Imported presentation");
    return { content, title, ...(adopted ? { adopted } : {}) };
}

// A public Google Slides deck serves its own PowerPoint conversion from a fixed export path, so a
// pasted link needs no OAuth. The host and path are ours, only the file id comes from the user.
export function slidesFileId(url: string): string | null {
    const d = /\/presentation\/d\/([\w-]{20,})/.exec(url);
    if (d) return d[1]!;
    const q = /[?&]id=([\w-]{20,})/.exec(url);
    return q ? q[1]! : null;
}

export async function fetchSlidesPptx(
    url: string,
    fetcher: typeof fetch = fetch,
): Promise<{ data: Uint8Array; name?: string }> {
    const id = slidesFileId(url);
    if (!id)
        throw new ImportError(
            "That doesn't look like a Google Slides link — paste the presentation's URL.",
            400,
        );
    const res = await fetcher(`https://docs.google.com/presentation/d/${id}/export/pptx`, {
        redirect: "follow",
    }).catch(() => {
        throw new ImportError("Google Slides couldn't be reached — try again in a moment.", 502);
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || type.includes("text/html"))
        throw new ImportError(
            'That presentation isn\'t shared publicly. In Google Slides, set sharing to "Anyone with the link", or download it as PowerPoint and import the file.',
            400,
        );
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_PPTX_BYTES)
        throw new ImportError(
            `That presentation is too large to import (limit ${Math.round(MAX_PPTX_BYTES / 1_000_000)} MB).`,
            400,
        );
    return { data: buf };
}
