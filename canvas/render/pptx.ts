// PowerPoint (.pptx) export — the whole pptx module in one place. Every artifact (deck / doc / web)
// exports as a DECK: each section runs through the deck profile's `sectionSlides` (tall sections auto-
// paginate into several 16:9 windows), and each page becomes one editable PowerPoint slide. Native where
// we can — solid/bordered rects → autoshapes, text → text boxes with styled runs and baked-in line breaks
// (so PowerPoint never re-flows) — and rasterized where we must: images and self-painted surfaces
// (charts/diagrams) become crisp PNGs positioned at their box, so nothing is ever silently dropped. Theme
// fonts are embedded (Google woff2 → TTF → OOXML embedded font) so the exact typeface renders anywhere.
//
// Three sections: (1) pure RenderCommand→spec MAPPERS (unit-tested, DOM-free), (2) FONT embedding (pure
// OOXML patchers + the network/wasm/zip IO), (3) the EXPORT shell that assembles slides and downloads.
// pptxgenjs / jszip / wawoff2 are dynamically imported so they stay out of the main bundle (and off the
// unit-test path) until an export actually runs.

import type { ArtifactContent } from "@model/artifact";
import type { FillLeaf, Rect, RenderCommand, TextLeaf } from "@engine/node";
import type { RunLine } from "./commands";
import type { Tokens } from "@themes";
import type PptxGenJS from "pptxgenjs";
import { resolveProfile } from "@engine/profile";
import { layoutRuns, sectionSlides } from "./commands";
import { EXPORT_SCALE, renderToCanvas } from "./backends";
import type { ExportOptions } from "./export";

// (wawoff2 is an untyped module — its ambient types live in wawoff2.d.ts, which must be a standalone
// declaration file, not an in-module `declare module`.)

// ====================================================================================================
// 1. Mappers — pure, DOM-free RenderCommand → pptxgenjs specs. Unit-tested; touch no DOM, import nothing
//    above `canvas`.
// ====================================================================================================

// The deck frame is a fixed 16:9 PowerPoint slide. Every artifact (deck / doc / web) exports as a deck,
// so each section's slide page is contained into this one slide size (letterboxed for odd aspects).
export const SLIDE_PX_W = 1280;
export const SLIDE_PX_H = 720;
export const PX_PER_IN = 96; // 1280×720 → 13.333in × 7.5in at 96 dpi (widescreen)
export const SLIDE_IN_W = SLIDE_PX_W / PX_PER_IN;
export const SLIDE_IN_H = SLIDE_PX_H / PX_PER_IN;

const PT_PER_PX = 0.75; // 72pt / 96px
const PPTX_BOLD_MIN = 600; // PowerPoint has only bold/regular; this weight and up maps to bold
const PPTX_MONO = "Consolas"; // a widely-installed mono for inline-code runs
const DEFAULT_INK = "1A1A1A"; // matches the backends' text fallback (#1a1a1a)

export const inch = (px: number): number => px / PX_PER_IN;
export const pt = (px: number): number => px * PT_PER_PX;

// --- colour ---

const hex2 = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");

// A CSS colour (theme tokens are hex; scrims / code bg / highlights can be rgb/rgba) → a pptx hex string
// (RRGGBB, no #) plus optional transparency 0..100. Returns null for anything unparseable so the caller
// can omit the fill entirely rather than paint black.
export function cssColor(css: string | undefined): { color: string; transparency?: number } | null {
    if (!css) return null;
    const s = css.trim();
    if (s.startsWith("#")) {
        let h = s.slice(1);
        if (h.length === 3)
            h = h
                .split("")
                .map((c) => c + c)
                .join("");
        if (h.length === 8) {
            const a = parseInt(h.slice(6, 8), 16) / 255;
            return { color: h.slice(0, 6).toUpperCase(), transparency: Math.round((1 - a) * 100) };
        }
        if (h.length === 6) return { color: h.toUpperCase() };
        return null;
    }
    const m = s.match(/^rgba?\(([^)]+)\)/i);
    if (m) {
        const parts = m[1]!.split(",").map((p) => p.trim());
        if (parts.length < 3) return null;
        const [r, g, b] = parts.map((p) => parseFloat(p));
        const a = parts.length >= 4 ? parseFloat(parts[3]!) : 1;
        const color = `${hex2(r!)}${hex2(g!)}${hex2(b!)}`.toUpperCase();
        return a < 1 ? { color, transparency: Math.round((1 - a) * 100) } : { color };
    }
    return null;
}

export const cssColorHex = (css: string | undefined): string | null => cssColor(css)?.color ?? null;

// --- font ---

// The family name PowerPoint should use, pulled from a CSS family stack ("'Fraunces', serif") or a full
// `font` shorthand ("italic 700 44px 'Fraunces', serif"). We name the real family so it matches the
// embedded font (below) wherever it's installed.
export function familyFromFont(font: string): string {
    let s = font;
    const px = s.indexOf("px ");
    if (px >= 0) s = s.slice(px + 3); // drop the "<weight> <size>px " head of a shorthand
    const first = s.split(",")[0]!.trim();
    return first.replace(/^['"]|['"]$/g, "") || "Arial";
}

// Numeric weight from a `font` shorthand ("italic 700 44px …" → 700); defaults to 400 when absent.
export function weightFromFont(font: string): number {
    const m = font.match(/(?:^|\s)(\d{3})\s+\d/);
    return m ? parseInt(m[1]!, 10) : 400;
}

export const italicFromFont = (font: string): boolean => font.trimStart().startsWith("italic");

// --- slide fit transform ---

export interface Transform {
    fit: number;
    offX: number;
    offY: number;
}

// The single transform that maps a slide page's command coordinates into the fixed 16:9 slide (px space,
// 0..1280 × 0..720). It composes TWO fits, exactly mirroring what renderSlidePage does on canvas:
//   1. the page's intra-content fit (its `contentH` scaled into its own frame `h`, centered), then
//   2. containing the page's own w×h frame into the fixed 1280×720 slide (letterbox odd aspects).
// For a standard 1280×720 deck page both reduce to identity/step-1, so nothing shifts.
export function slideTransform(page: { w: number; h: number; contentH: number }): Transform {
    const contentFit = Math.min(1, page.h / page.contentH);
    const offXc = (page.w - page.w * contentFit) / 2;
    const offYc = (page.h - page.contentH * contentFit) / 2;
    const slideScale = Math.min(SLIDE_PX_W / page.w, SLIDE_PX_H / page.h);
    const off2X = (SLIDE_PX_W - page.w * slideScale) / 2;
    const off2Y = (SLIDE_PX_H - page.h * slideScale) / 2;
    return {
        fit: contentFit * slideScale,
        offX: off2X + offXc * slideScale,
        offY: off2Y + offYc * slideScale,
    };
}

const placeRect = (r: Rect, t: Transform): Rect => ({
    x: t.offX + r.x * t.fit,
    y: t.offY + r.y * t.fit,
    w: r.w * t.fit,
    h: r.h * t.fit,
});

const scaleFill = (f: FillLeaf, fit: number): FillLeaf => ({
    ...f,
    radius: f.radius !== undefined ? f.radius * fit : undefined,
    border: f.border ? { ...f.border, width: f.border.width * fit } : undefined,
});

// Map a command into fixed-slide px space: box placed by the transform, and every intrinsic length
// (font size, line height, corner radius, border/stroke width) scaled by `fit` — the paint callback of a
// surface is resolution-independent, so it rides along unchanged. Clip rides in the same space.
export function frameCommand(c: RenderCommand, t: Transform): RenderCommand {
    const box = placeRect(c.box, t);
    const clip = c.clip ? placeRect(c.clip, t) : undefined;
    switch (c.kind) {
        case "rect":
            return { ...c, box, clip, fill: c.fill ? scaleFill(c.fill, t.fit) : undefined };
        case "text":
            return {
                ...c,
                box,
                clip,
                text: {
                    ...c.text,
                    size: c.text.size * t.fit,
                    lineHeight: (c.text.lineHeight ?? c.text.size * 1.35) * t.fit,
                },
            };
        case "image":
            return {
                ...c,
                box,
                clip,
                image: {
                    ...c.image,
                    radius: c.image.radius !== undefined ? c.image.radius * t.fit : undefined,
                    border: c.image.border
                        ? { ...c.image.border, width: c.image.border.width * t.fit }
                        : undefined,
                },
            };
        default:
            return { ...c, box, clip };
    }
}

// Move a (framed) command so its box sits at the origin — for rasterizing one command onto its own
// box-sized canvas. Clip is made box-relative too.
export function localize(c: RenderCommand): RenderCommand {
    const dx = c.box.x;
    const dy = c.box.y;
    const box = { ...c.box, x: 0, y: 0 };
    const clip = c.clip ? { ...c.clip, x: c.clip.x - dx, y: c.clip.y - dy } : undefined;
    return { ...c, box, clip };
}

// --- command classification ---

// How a command is emitted: a native editable shape, a native editable text box, or a rasterized image.
// Rects go native unless they need a gradient or a clip (neither expressible as a plain autoshape); box-
// shadow is intentionally NOT a trigger — the canvas backend (PNG/PDF/present) doesn't paint shadows
// either, so a plain shape matches those exports. Images and self-painted surfaces (charts/diagrams)
// always rasterize — pptx can't express scrim/zoom/arbitrary-radius crops or arbitrary vector paths.
export type Emit = "shape" | "text" | "raster";

export function classify(c: RenderCommand): Emit {
    if (c.kind === "text") return "text";
    if (c.kind === "rect") return c.fill?.gradient || c.clip ? "raster" : "shape";
    return "raster"; // image, surface
}

// --- shape spec ---

export interface ShapeSpec {
    round: boolean;
    options: PptxGenJS.ShapeProps;
}

// A native autoshape for a solid/bordered rect (already framed). Returns null when there is nothing to
// paint (no fill and no border), so the caller skips it.
export function rectShapeSpec(c: RenderCommand): ShapeSpec | null {
    if (c.kind !== "rect") return null;
    const f = c.fill;
    const fillC = f?.color && !f.gradient ? cssColor(f.color) : null;
    const border = f?.border;
    if (!fillC && !border) return null;
    const radius = f?.radius ?? 0;
    const options: PptxGenJS.ShapeProps = {
        x: inch(c.box.x),
        y: inch(c.box.y),
        w: inch(c.box.w),
        h: inch(c.box.h),
        fill: fillC
            ? { type: "solid", color: fillC.color, transparency: fillC.transparency }
            : { type: "none" },
        line: border
            ? {
                  color: cssColor(border.color)?.color ?? DEFAULT_INK,
                  width: pt(border.width),
                  dashType: border.style === "dashed" ? "dash" : "solid",
              }
            : { type: "none" },
    };
    if (c.opacity !== undefined && options.fill && "transparency" in options.fill)
        options.fill.transparency = Math.round((1 - c.opacity) * 100);
    if (radius > 0) options.rectRadius = inch(radius);
    return { round: radius > 0, options };
}

// --- text spec ---

export interface TextSpec {
    runs: PptxGenJS.TextProps[];
    options: PptxGenJS.TextPropsOptions;
}

const hAlign = (a: TextLeaf["align"]): PptxGenJS.HAlign =>
    a === "center" ? "center" : a === "end" ? "right" : "left";

// If a leaf carries no styled runs, wrap its plain text as one run so a single measure/emit path (the
// engine's runs pipeline) serves everything.
export function leafForRuns(leaf: TextLeaf): TextLeaf {
    return leaf.runs && leaf.runs.length > 0 ? leaf : { ...leaf, runs: [{ text: leaf.text }] };
}

// Whether pre-measured lines carry any visible text (an all-empty box is skipped, not emitted).
export const hasText = (lines: RunLine[]): boolean =>
    lines.some((l) => l.frags.some((f) => f.text.length > 0));

// One editable text box per leaf: the pre-wrapped lines (from the engine's own layoutRuns, so breaks
// match the screen exactly) are flattened into styled runs, with a forced breakLine at each line end but
// the last. wrap/autoFit OFF means PowerPoint never re-flows — the whole reason a native deck stays
// faithful. `box`/`text` are the FRAMED (fixed-slide px) geometry.
export function textSpec(text: TextLeaf, box: Rect, lines: RunLine[]): TextSpec {
    const baseColor = cssColor(text.color)?.color ?? DEFAULT_INK;
    const runs: PptxGenJS.TextProps[] = [];
    lines.forEach((line, li) => {
        const lastLine = li === lines.length - 1;
        if (line.frags.length === 0) {
            runs.push({ text: "", options: lastLine ? {} : { breakLine: true } });
            return;
        }
        line.frags.forEach((f, fi) => {
            const endOfLine = fi === line.frags.length - 1;
            runs.push({
                text: f.text,
                options: {
                    bold: weightFromFont(f.font) >= PPTX_BOLD_MIN || undefined,
                    italic: italicFromFont(f.font) || undefined,
                    underline: f.underline ? { style: "sng" } : undefined,
                    strike: f.strike ? "sngStrike" : undefined,
                    color: cssColor(f.color)?.color ?? baseColor,
                    fontFace: f.code ? PPTX_MONO : familyFromFont(f.font),
                    highlight: f.highlight ? cssColor(f.highlight)?.color : undefined,
                    breakLine: endOfLine && !lastLine ? true : undefined,
                },
            });
        });
    });
    const options: PptxGenJS.TextPropsOptions = {
        x: inch(box.x),
        y: inch(box.y),
        w: inch(box.w),
        h: inch(box.h),
        align: hAlign(text.align),
        valign: "top",
        margin: 0,
        fontFace: familyFromFont(text.fontId),
        fontSize: pt(text.size),
        color: baseColor,
        lineSpacing: pt(text.lineHeight ?? text.size * 1.35),
        wrap: false,
        autoFit: false,
    };
    return { runs, options };
}

// The free-tier "Made with Galleo" mark, bottom-right, matching stampBrand's copy/placement.
export function brandSpec(): TextSpec {
    return {
        runs: [{ text: "Made with Galleo", options: {} }],
        options: {
            x: SLIDE_IN_W - 2.2,
            y: SLIDE_IN_H - 0.42,
            w: 2,
            h: 0.28,
            align: "right",
            valign: "middle",
            margin: 0,
            fontFace: "Arial",
            fontSize: 9,
            color: "FFFFFF",
            transparency: 40,
        },
    };
}

// ====================================================================================================
// 2. Font embedding — pptxgenjs references font families by name but embeds no font data, so a machine
//    without the theme's Google fonts shows "missing fonts" and substitutes. We fetch the real font (the
//    woff2 the app already loads from Google), transcode it to TTF, and inject it into the .pptx as an
//    OOXML embedded font. The string/URL logic is pure + unit-tested; the network + woff2 transcode + zip
//    surgery are the IO functions. Any failure degrades gracefully to a plain (un-embedded) export.
// ====================================================================================================

export type FontSlot = "regular" | "bold" | "italic" | "boldItalic";

// PowerPoint has four embed slots per typeface; our granular weights collapse to bold≥600 (the same
// PPTX_BOLD_MIN cutoff textSpec uses) × italic.
export function slotFor(weight: number, italic: boolean): FontSlot {
    const bold = weight >= PPTX_BOLD_MIN;
    return bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
}
const SLOT_ORDER: FontSlot[] = ["regular", "bold", "italic", "boldItalic"];

// Families we never embed: the system fonts textSpec substitutes (inline code → Consolas) and the brand
// mark's Arial. Everything else (the theme families) gets embedded.
export const PPTX_SYSTEM_FONTS = new Set(["Consolas", "Arial"]);

// The Google Fonts CSS request for one family at one weight/style. A browser fetch gets woff2 back (the
// modern-UA format); display=swap is harmless and matches how the app loads fonts.
export function googleCssUrl(family: string, weight: number, italic: boolean): string {
    const fam = family.trim().replace(/\s+/g, "+");
    return `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
}

// The font URL in a Google Fonts CSS response, preferring the `latin` subset block (falling back to the
// first font if the labels ever change). Google serves woff2 to modern browsers and plain ttf/otf to
// unknown/legacy user-agents; we accept either and flag whether a woff2→TTF transcode is needed.
export interface FontSrc {
    url: string;
    woff2: boolean;
}

export function parseFontUrl(css: string): FontSrc | null {
    const pick = (block: string): FontSrc | null => {
        const m = block.match(/url\((https:[^)]+\.(?:woff2|ttf|otf))\)/);
        return m ? { url: m[1]!, woff2: m[1]!.endsWith(".woff2") } : null;
    };
    for (const block of css.split("/*"))
        if (/^\s*latin\s*\*\//.test(block)) {
            const hit = pick(block);
            if (hit) return hit;
        }
    return pick(css);
}

const xmlEsc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- pure OOXML patchers ---

export interface EmbedFamilyXml {
    typeface: string;
    slots: { slot: FontSlot; relId: string }[];
}

export function embeddedFontListXml(families: EmbedFamilyXml[]): string {
    const fonts = families
        .map((f) => {
            const slots = [...f.slots]
                .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
                .map((s) => `<p:${s.slot} r:id="${s.relId}"/>`)
                .join("");
            return `<p:embeddedFont><p:font typeface="${xmlEsc(f.typeface)}"/>${slots}</p:embeddedFont>`;
        })
        .join("");
    return `<p:embeddedFontLst>${fonts}</p:embeddedFontLst>`;
}

// Turn on font embedding on the root and splice the embeddedFontLst in schema order (after notesSz, before
// defaultTextStyle — CT_Presentation requires embeddedFontLst to precede defaultTextStyle).
export function patchPresentationXml(xml: string, families: EmbedFamilyXml[]): string {
    let out = xml;
    if (!/\bembedTrueTypeFonts=/.test(out))
        out = out.replace(/<p:presentation\b([^>]*)>/, '<p:presentation$1 embedTrueTypeFonts="1">');
    const lst = embeddedFontListXml(families);
    if (out.includes("<p:defaultTextStyle"))
        out = out.replace("<p:defaultTextStyle", lst + "<p:defaultTextStyle");
    else out = out.replace("</p:presentation>", lst + "</p:presentation>");
    return out;
}

const FONT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";

export function patchPresentationRels(xml: string, rels: { id: string; target: string }[]): string {
    const inserts = rels
        .map((r) => `<Relationship Id="${r.id}" Type="${FONT_REL_TYPE}" Target="${r.target}"/>`)
        .join("");
    return xml.replace("</Relationships>", inserts + "</Relationships>");
}

export function patchContentTypes(xml: string): string {
    if (xml.includes('Extension="fntdata"')) return xml;
    return xml.replace(
        "</Types>",
        '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>',
    );
}

// --- IO: fetch + transcode + zip surgery ---

// A resolved family with its transcoded TTFs, ready to embed.
export interface EmbedFamily {
    typeface: string;
    slots: { slot: FontSlot; ttf: Uint8Array }[];
}

// Fetch one (family, weight, italic) from Google Fonts and transcode woff2 → TTF. Returns null on any
// failure (offline, no such weight/style, transcode error) so the slot is simply skipped.
export async function fetchFontTtf(
    family: string,
    weight: number,
    italic: boolean,
): Promise<Uint8Array | null> {
    try {
        const css = await (await fetch(googleCssUrl(family, weight, italic))).text();
        const src = parseFontUrl(css);
        if (!src) return null;
        const bytes = new Uint8Array(await (await fetch(src.url)).arrayBuffer());
        if (!src.woff2) return bytes; // already a usable sfnt (ttf/otf)
        const { decompress } = await import("wawoff2");
        return await decompress(bytes);
    } catch {
        return null;
    }
}

// Inject the resolved families into a generated .pptx (arraybuffer), returning the re-zipped bytes with
// embedded fonts. Adds one ppt/fonts/fontN.fntdata per slot and patches content-types, rels, and
// presentation.xml.
export async function embedFontsIntoPptx(
    pptxBytes: ArrayBuffer,
    families: EmbedFamily[],
): Promise<Uint8Array> {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(pptxBytes);

    const rels: { id: string; target: string }[] = [];
    const familyXml: EmbedFamilyXml[] = [];
    let fileN = 1;
    for (const fam of families) {
        const slots: EmbedFamilyXml["slots"] = [];
        for (const s of fam.slots) {
            const file = `font${fileN}.fntdata`;
            zip.file(`ppt/fonts/${file}`, s.ttf);
            const relId = `rIdFont${fileN}`;
            rels.push({ id: relId, target: `fonts/${file}` });
            slots.push({ slot: s.slot, relId });
            fileN++;
        }
        familyXml.push({ typeface: fam.typeface, slots });
    }

    const patch = async (path: string, fn: (xml: string) => string): Promise<void> => {
        const file = zip.file(path);
        if (file) zip.file(path, fn(await file.async("string")));
    };
    await patch("[Content_Types].xml", patchContentTypes);
    await patch("ppt/_rels/presentation.xml.rels", (xml) => patchPresentationRels(xml, rels));
    await patch("ppt/presentation.xml", (xml) => patchPresentationXml(xml, familyXml));

    return zip.generateAsync({ type: "uint8array" });
}

// ====================================================================================================
// 3. Export shell — assembles the deck slide-by-slide from the mappers, embeds the fonts, downloads.
//    Browser-only (canvas measure, pptxgenjs, download); dynamically imports pptxgenjs.
// ====================================================================================================

let sharedCtx: CanvasRenderingContext2D | undefined;
function measureCtx(): CanvasRenderingContext2D {
    if (!sharedCtx) {
        const cx = document.createElement("canvas").getContext("2d");
        if (!cx) throw new Error("no 2d canvas context available");
        sharedCtx = cx;
    }
    return sharedCtx;
}

// Rasterize one framed command onto a transparent, box-sized canvas (device-scaled for crispness) and
// return it as a PNG data URL for addImage. Reuses the shared 2D backend, so a chart/image/gradient in
// the pptx is pixel-identical to the same thing in the PNG/PDF export.
async function rasterUrl(framed: RenderCommand): Promise<string | undefined> {
    const { w, h } = framed.box;
    if (w < 0.5 || h < 0.5) return undefined;
    const canvas = await renderToCanvas([localize(framed)], w, h, "rgba(0,0,0,0)", EXPORT_SCALE);
    return canvas.toDataURL("image/png");
}

function downloadBytes(bytes: Uint8Array, filename: string): void {
    const type = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Accumulates the distinct (typeface, slot) fonts a deck actually paints, so only those are fetched +
// embedded. Keyed typeface → slot → the representative weight/style to fetch for that slot.
type UsedFonts = Map<string, Map<FontSlot, { weight: number; italic: boolean }>>;

function recordFont(used: UsedFonts, font: string, code: boolean): void {
    const family = code ? "Consolas" : familyFromFont(font);
    if (PPTX_SYSTEM_FONTS.has(family)) return;
    const weight = weightFromFont(font);
    const italic = italicFromFont(font);
    const slot = slotFor(weight, italic);
    let slots = used.get(family);
    if (!slots) used.set(family, (slots = new Map()));
    if (!slots.has(slot)) slots.set(slot, { weight, italic });
}

// Fetch + transcode every recorded font, in parallel, dropping any that fail to resolve.
async function resolveFonts(used: UsedFonts): Promise<EmbedFamily[]> {
    const families = await Promise.all(
        [...used].map(async ([typeface, slotMap]) => {
            const slots = (
                await Promise.all(
                    [...slotMap].map(async ([slot, meta]) => {
                        const ttf = await fetchFontTtf(typeface, meta.weight, meta.italic);
                        return ttf ? { slot, ttf } : null;
                    }),
                )
            ).filter((s): s is { slot: FontSlot; ttf: Uint8Array } => s !== null);
            return slots.length ? { typeface, slots } : null;
        }),
    );
    return families.filter((f): f is EmbedFamily => f !== null);
}

export async function exportPptx(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    const brand = opts?.brand ?? false;
    // Fonts must be resolved before we measure line breaks, or the pptx would wrap on fallback metrics.
    if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;

    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "GALLEO_16x9", width: SLIDE_IN_W, height: SLIDE_IN_H });
    pptx.layout = "GALLEO_16x9";

    const profile = resolveProfile("deck");
    const bgHex = cssColorHex(tk.bg) ?? "FFFFFF";
    const cx = measureCtx();
    const usedFonts: UsedFonts = new Map();

    for (const section of artifact.sections) {
        for (const page of sectionSlides(section, tk, profile)) {
            const slide = pptx.addSlide();
            slide.background = { color: bgHex };
            const t = slideTransform(page);

            for (const c of page.commands) {
                const kind = classify(c);
                const framed = frameCommand(c, t);
                if (kind === "shape") {
                    const spec = rectShapeSpec(framed);
                    if (spec)
                        slide.addShape(
                            spec.round ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
                            spec.options,
                        );
                } else if (kind === "text" && c.kind === "text" && framed.kind === "text") {
                    const lines = layoutRuns(cx, leafForRuns(c.text), c.box.w).lines;
                    if (!hasText(lines)) continue;
                    for (const line of lines)
                        for (const f of line.frags)
                            if (f.text) recordFont(usedFonts, f.font, f.code);
                    const { runs, options } = textSpec(framed.text, framed.box, lines);
                    slide.addText(runs, options);
                } else {
                    const data = await rasterUrl(framed);
                    if (data)
                        slide.addImage({
                            data,
                            x: inch(framed.box.x),
                            y: inch(framed.box.y),
                            w: inch(framed.box.w),
                            h: inch(framed.box.h),
                        });
                }
            }

            if (brand) {
                const b = brandSpec();
                slide.addText(b.runs, b.options);
            }
        }
    }

    // Embed the real theme fonts so the deck opens with the exact typefaces and no "missing fonts" prompt.
    // Any failure (offline, transcode error) falls back to a plain export rather than blocking the download.
    try {
        const families = await resolveFonts(usedFonts);
        if (families.length) {
            const bytes = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
            downloadBytes(await embedFontsIntoPptx(bytes, families), "galleo.pptx");
            return;
        }
    } catch {
        // fall through to the un-embedded export
    }
    await pptx.writeFile({ fileName: "galleo.pptx" });
}
