import type { ArtifactContent } from "@model/artifact";
import type { FillLeaf, Rect, RenderCommand, TextLeaf } from "@engine/node";
import type { RunLine } from "./commands";
import type { Tokens } from "@themes";
import type PptxGenJS from "pptxgenjs";
import { resolveProfile } from "@engine/profile";
import { layoutRuns, sectionSlides } from "./commands";
import { EXPORT_SCALE, renderToCanvas } from "./backends";
import { svgStringContext } from "./svg-emit";
import type { ExportOptions } from "./export";
import {
    BOLD_MIN,
    familyFromFont,
    fetchFontTtf,
    italicFromFont,
    slotFor,
    weightFromFont,
    type FontSlot,
} from "./fonts";

// re-exported so existing importers (and pptx.test.ts) keep resolving them from ./pptx
export {
    familyFromFont,
    weightFromFont,
    italicFromFont,
    slotFor,
    googleCssUrl,
    parseFontUrl,
} from "./fonts";

// wawoff2 is untyped — ambient types live in wawoff2.d.ts (must be a standalone .d.ts)

// fixed 16:9 slide; every artifact exports as a deck (odd aspects letterboxed)
export const SLIDE_PX_W = 1280;
export const SLIDE_PX_H = 720;
export const PX_PER_IN = 96; // 1280×720 → 13.333in × 7.5in at 96 dpi
export const SLIDE_IN_W = SLIDE_PX_W / PX_PER_IN;
export const SLIDE_IN_H = SLIDE_PX_H / PX_PER_IN;

const PT_PER_PX = 0.75; // 72pt / 96px
const PPTX_MONO = "Consolas"; // widely-installed mono for inline-code runs
const DEFAULT_INK = "1A1A1A"; // matches the backends' text fallback (#1a1a1a)

export const inch = (px: number): number => px / PX_PER_IN;
export const pt = (px: number): number => px * PT_PER_PX;

const hex2 = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");

// CSS colour → pptx hex (RRGGBB, no #) + transparency 0..100; null if unparseable so the caller omits the fill
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

export interface Transform {
    fit: number;
    offX: number;
    offY: number;
}

// maps page command coords into the fixed 1280×720 slide by composing two fits (mirrors renderSlidePage):
// (1) content→own frame, (2) frame→fixed slide (letterbox odd aspects); identity for a standard deck page
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

// place box + scale intrinsic lengths (size, lineHeight, radius, border) by fit; a surface's paint callback is resolution-independent so it rides along
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

// move a command's box to the origin (for rasterizing onto its own box-sized canvas); clip made box-relative
export function localize(c: RenderCommand): RenderCommand {
    const dx = c.box.x;
    const dy = c.box.y;
    const box = { ...c.box, x: 0, y: 0 };
    const clip = c.clip ? { ...c.clip, x: c.clip.x - dx, y: c.clip.y - dy } : undefined;
    return { ...c, box, clip };
}

// rect → native shape unless it needs a gradient/clip (no autoshape for those); box-shadow intentionally not a trigger (canvas backend paints none either).
// images + surfaces always rasterize — pptx can't express scrim/zoom/arbitrary-radius crops or vector paths.
export type Emit = "shape" | "text" | "raster";

export function classify(c: RenderCommand): Emit {
    if (c.kind === "text") return "text";
    if (c.kind === "rect") return c.fill?.gradient || c.clip ? "raster" : "shape";
    return "raster"; // image, surface
}

export interface ShapeSpec {
    round: boolean;
    options: PptxGenJS.ShapeProps;
}

// autoshape for a solid/bordered rect; null when nothing to paint (caller skips)
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

export interface TextSpec {
    runs: PptxGenJS.TextProps[];
    options: PptxGenJS.TextPropsOptions;
}

const hAlign = (a: TextLeaf["align"]): PptxGenJS.HAlign =>
    a === "center" ? "center" : a === "end" ? "right" : "left";

// wrap a plain leaf as one run so a single runs path serves everything
export function leafForRuns(leaf: TextLeaf): TextLeaf {
    return leaf.runs && leaf.runs.length > 0 ? leaf : { ...leaf, runs: [{ text: leaf.text }] };
}

// any visible text? an all-empty box is skipped, not emitted
export const hasText = (lines: RunLine[]): boolean =>
    lines.some((l) => l.frags.some((f) => f.text.length > 0));

// pre-wrapped lines (from layoutRuns, so breaks match screen) → styled runs with a forced breakLine per line but the last; wrap/autoFit OFF so PowerPoint never re-flows. box/text are FRAMED (fixed-slide px).
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
                    bold: weightFromFont(f.font) >= BOLD_MIN || undefined,
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

// free-tier mark; must match stampBrand's copy/placement
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

// pptxgenjs names fonts but embeds no data (→ "missing fonts" on machines without them); we fetch the woff2,
// transcode to TTF (fonts.ts), and inject as an OOXML embedded font. Any failure degrades to a plain export.
const SLOT_ORDER: FontSlot[] = ["regular", "bold", "italic", "boldItalic"];

// never embedded: system fonts textSpec substitutes (Consolas for code, Arial for the brand mark)
export const PPTX_SYSTEM_FONTS = new Set(["Consolas", "Arial"]);

const xmlEsc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

// enable embedding + splice embeddedFontLst before defaultTextStyle (CT_Presentation schema order)
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

export interface EmbedFamily {
    typeface: string;
    slots: { slot: FontSlot; ttf: Uint8Array }[];
}

// inject fonts into a .pptx: add ppt/fonts/fontN.fntdata per slot + patch content-types, rels, presentation.xml
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

let sharedCtx: CanvasRenderingContext2D | undefined;
function measureCtx(): CanvasRenderingContext2D {
    if (!sharedCtx) {
        const cx = document.createElement("canvas").getContext("2d");
        if (!cx) throw new Error("no 2d canvas context available");
        sharedCtx = cx;
    }
    return sharedCtx;
}

// rasterize a framed command → transparent PNG data URL (shared 2D backend, so pixel-identical to PNG/PDF export)
async function rasterUrl(framed: RenderCommand): Promise<string | undefined> {
    const { w, h } = framed.box;
    if (w < 0.5 || h < 0.5) return undefined;
    const canvas = await renderToCanvas([localize(framed)], w, h, "rgba(0,0,0,0)", EXPORT_SCALE);
    return canvas.toDataURL("image/png");
}

// paint a surface into an SVG string → data URI; pptxgenjs embeds it with an auto-generated PNG fallback
// (the `<asvg:svgBlip>` dual-blip), so charts/diagrams/icons/graphics stay crisp vector in PowerPoint.
function surfaceSvgUri(framed: RenderCommand): string | undefined {
    if (framed.kind !== "surface") return undefined;
    const { w, h } = framed.box;
    if (w < 0.5 || h < 0.5) return undefined;
    const { ctx, svg } = svgStringContext(w, h);
    framed.paint(ctx, { x: 0, y: 0, w, h });
    const b64 =
        typeof btoa !== "undefined"
            ? btoa(unescape(encodeURIComponent(svg())))
            : Buffer.from(svg(), "utf-8").toString("base64");
    return `data:image/svg+xml;base64,${b64}`;
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

// distinct (typeface, slot) fonts a deck paints → only those are fetched/embedded; typeface → slot → representative weight/style
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

// fetch + transcode every recorded font in parallel; drop failures
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

export async function buildPptx(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<Uint8Array> {
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
                    // surfaces embed as vector SVG (crisp in PowerPoint); other rasters (images,
                    // gradient/clipped rects) stay PNG
                    const data = surfaceSvgUri(framed) ?? (await rasterUrl(framed));
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

    // embed theme fonts (exact typefaces, no "missing fonts" prompt); any failure falls back to plain bytes
    try {
        const families = await resolveFonts(usedFonts);
        if (families.length) {
            const bytes = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
            return await embedFontsIntoPptx(bytes, families);
        }
    } catch {
        // fall through to the un-embedded bytes
    }
    return new Uint8Array((await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer);
}

export async function exportPptx(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    downloadBytes(await buildPptx(artifact, tk, opts), "galleo.pptx");
}
