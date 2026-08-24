import type { RenderCommand } from "@engine/node";
import type { ArtifactContent } from "@model/artifact";
import type { Tokens } from "@themes";
import { PDFDocument, rgb } from "pdf-lib";
import { profileFor, resolveProfile } from "@engine/profile";
import { EXPORT_SCALE, loadImages, paint, renderSlidePage, renderToCanvas } from "./backends";
import { measureText, layoutSection, sectionSlides } from "./commands";
import { applyFallbacks } from "@elements/ops";
import { frameCommand, localize, type Transform } from "./pptx";
import {
    addLinkAnnot,
    buildFontBook,
    drawTextAbs,
    emitRect,
    emitText,
    pdfColor,
    pdfDrawContext,
    type Ctx,
} from "./pdf-draw";

export const PRINT_W = 1100; // px fallback when no maxContentWidth
export const SLIDE_W = 1280; // matches Present
export const PDF_SLIDE_W = 960; // points; page height flexes with the slide aspect
export const A4_W = 595; // points; doc pages keep this width, height follows the section

// points
export function slidePdfPageSize(
    slide: { w: number; h: number },
    pageW: number = PDF_SLIDE_W,
): { w: number; h: number } {
    return { w: pageW, h: Math.round((pageW * slide.h) / slide.w) };
}

// mirrors the deck's page-per-section shape: fixed width, natural section height
export function docSectionPageSize(layoutW: number, sectionH: number): { w: number; h: number } {
    return { w: A4_W, h: (sectionH * A4_W) / layoutW };
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
}

export function downloadBytes(bytes: Uint8Array | string, filename: string, type: string): void {
    // a Uint8Array can be backed by a SharedArrayBuffer, which Blob rejects; copy into a plain one
    const part: BlobPart = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
    const url = URL.createObjectURL(new Blob([part], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// brand: the free-tier watermark; paid plans pass false
export interface ExportOptions {
    brand?: boolean;
}

// coords in device px (already scaled)
function stampBrand(
    cx: CanvasRenderingContext2D,
    right: number,
    bottom: number,
    scale: number,
): void {
    const pad = 18 * scale;
    cx.save();
    cx.font = `600 ${13 * scale}px system-ui, -apple-system, sans-serif`;
    cx.textAlign = "right";
    cx.textBaseline = "bottom";
    cx.globalAlpha = 0.6;
    cx.shadowColor = "rgba(0,0,0,0.5)";
    cx.shadowBlur = 5 * scale;
    cx.fillStyle = "#ffffff";
    cx.fillText("Made with Galleo", right - pad, bottom - pad);
    cx.restore();
}

async function buildSlidePdfRaster(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    const profile = profileFor(artifact);
    const pdf = await PDFDocument.create();
    for (const section of artifact.sections) {
        for (const slide of sectionSlides(section, tk, profile)) {
            const canvas = await renderSlidePage(slide, tk.bg, EXPORT_SCALE);
            const cx = canvas.getContext("2d");
            if (brand && cx) stampBrand(cx, canvas.width, canvas.height, EXPORT_SCALE);
            const img = await pdf.embedPng(await canvasPng(canvas));
            const { w: pageW, h: pageH } = slidePdfPageSize(slide);
            const page = pdf.addPage([pageW, pageH]);
            page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
        }
    }
    return pdf.save();
}

async function buildDocPdfRaster(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    const docProfile = resolveProfile("doc");
    const layoutW = docProfile.maxContentWidth ?? 744;
    const pdf = await PDFDocument.create();
    for (const section of artifact.sections) {
        const { commands, height } = layoutSection(section, layoutW, measureText, tk, docProfile);
        if (height < 1) continue;
        const canvas = await renderToCanvas(commands, layoutW, height, tk.bg, EXPORT_SCALE);
        const cx = canvas.getContext("2d");
        if (brand && cx) stampBrand(cx, canvas.width, canvas.height, EXPORT_SCALE);
        const img = await pdf.embedPng(await canvasPng(canvas));
        const { w: pageW, h: pageH } = docSectionPageSize(layoutW, height);
        const page = pdf.addPage([pageW, pageH]);
        page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
    }
    return pdf.save();
}

let sharedMeasureCx: CanvasRenderingContext2D | undefined;
function measureCtx(): CanvasRenderingContext2D {
    if (!sharedMeasureCx) {
        const cx = document.createElement("canvas").getContext("2d");
        if (!cx) throw new Error("no 2d canvas context");
        sharedMeasureCx = cx;
    }
    return sharedMeasureCx;
}

const themeFamilies = (tk: Tokens): string[] => [tk.fontDisplay, tk.fontBody, tk.fontMono];
const isTextCmd = (c: RenderCommand): c is Extract<RenderCommand, { kind: "text" }> =>
    c.kind === "text";

// raster PNG placed at its box, y-flipped for PDF's bottom-left origin
async function rasterEmbed(ctx: Ctx, c: RenderCommand): Promise<void> {
    const { w, h } = c.box;
    if (w < 0.5 || h < 0.5) return;
    const canvas = await renderToCanvas([localize(c)], w, h, "rgba(0,0,0,0)", EXPORT_SCALE);
    const img = await ctx.doc.embedPng(await canvasPng(canvas));
    ctx.page.drawImage(img, {
        x: c.box.x,
        y: ctx.pageH - (c.box.y + c.box.h),
        width: w,
        height: h,
    });
}

// box already in pt; raster-fallback for what PDF vector can't express
async function emitCommand(
    ctx: Ctx,
    c: RenderCommand,
    measureCx: CanvasRenderingContext2D,
): Promise<void> {
    // A linked text box already annotates per run fragment; anything else annotates its whole box.
    if (c.link && c.kind !== "text") addLinkAnnot(ctx, c.box, c.link);
    if (c.kind === "text") emitText(ctx, c, measureCx);
    else if (c.kind === "rect") {
        if (c.fill?.gradient || c.clip) await rasterEmbed(ctx, c);
        else if (c.fill) emitRect(ctx, c.box, c.fill);
    } else if (c.kind === "surface") {
        if (c.clip) await rasterEmbed(ctx, c);
        else c.paint(pdfDrawContext(ctx, c.box.x, c.box.y), { x: 0, y: 0, w: c.box.w, h: c.box.h });
    } else await rasterEmbed(ctx, c); // image
}

function drawPdfBrand(ctx: Ctx, pageW: number): void {
    drawTextAbs(ctx, "Made with Galleo", pageW - 14, ctx.pageH - 14, {
        fill: "#ffffff",
        size: 9,
        weight: 600,
        font: "Helvetica",
        align: "end",
        baseline: "bottom",
    });
}

interface FramedPage {
    framed: RenderCommand[];
    pageW: number;
    pageH: number;
    bg: string;
}

async function renderFramedPdf(
    pages: FramedPage[],
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const measureCx = measureCtx();
    const allText = pages.flatMap((p) => p.framed).filter(isTextCmd);
    const fonts = await buildFontBook(pdf, allText, themeFamilies(tk), measureCx);
    for (const p of pages) {
        const page = pdf.addPage([p.pageW, p.pageH]);
        const bg = pdfColor(p.bg);
        if (bg)
            page.drawRectangle({
                x: 0,
                y: 0,
                width: p.pageW,
                height: p.pageH,
                color: rgb(...bg.rgb),
            });
        const ctx: Ctx = { doc: pdf, page, pageH: p.pageH, fonts };
        for (const c of p.framed) await emitCommand(ctx, c, measureCx);
        if (brand) drawPdfBrand(ctx, p.pageW);
    }
    return pdf.save();
}

async function buildSlidePdfVector(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    const profile = profileFor(artifact);
    const pages: FramedPage[] = [];
    for (const section of artifact.sections) {
        for (const slide of sectionSlides(section, tk, profile)) {
            const { w: pageW, h: pageH } = slidePdfPageSize(slide);
            const contentFit = Math.min(1, slide.h / slide.contentH);
            const frameScale = pageW / slide.w; // == pageH / slide.h
            const t: Transform = {
                fit: frameScale * contentFit,
                offX: (frameScale * (slide.w - slide.w * contentFit)) / 2,
                offY: (frameScale * (slide.h - slide.contentH * contentFit)) / 2,
            };
            pages.push({
                framed: slide.commands.map((c) => frameCommand(c, t)),
                pageW,
                pageH,
                bg: tk.bg,
            });
        }
    }
    return renderFramedPdf(pages, tk, brand);
}

async function buildDocPdfVector(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    const docProfile = resolveProfile("doc");
    const layoutW = docProfile.maxContentWidth ?? 744;
    const pages: FramedPage[] = [];
    for (const section of artifact.sections) {
        const { commands, height } = layoutSection(section, layoutW, measureText, tk, docProfile);
        if (height < 1) continue;
        const { w: pageW, h: pageH } = docSectionPageSize(layoutW, height);
        const t: Transform = { fit: pageW / layoutW, offX: 0, offY: 0 };
        pages.push({ framed: commands.map((c) => frameCommand(c, t)), pageW, pageH, bg: tk.bg });
    }
    return renderFramedPdf(pages, tk, brand);
}

// vector by default; any failure degrades to the raster path
async function buildSlidePdf(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    try {
        return await buildSlidePdfVector(artifact, tk, brand);
    } catch {
        return buildSlidePdfRaster(artifact, tk, brand);
    }
}
async function buildDocPdf(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<Uint8Array> {
    try {
        return await buildDocPdfVector(artifact, tk, brand);
    } catch {
        return buildDocPdfRaster(artifact, tk, brand);
    }
}

export interface PdfBuild {
    bytes: Uint8Array;
    filename: string;
}

export async function buildPdfAuto(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<PdfBuild> {
    const brand = opts?.brand ?? false;
    // paper has no live layer, so interactive elements export as whatever static form they declare
    const art = applyFallbacks(artifact);
    return profileFor(art).kind === "continuous"
        ? { bytes: await buildDocPdf(art, tk, brand), filename: "galleo-doc.pdf" }
        : { bytes: await buildSlidePdf(art, tk, brand), filename: "galleo.pdf" };
}

export async function exportPdfAuto(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    const { bytes, filename } = await buildPdfAuto(artifact, tk, opts);
    downloadBytes(bytes, filename, "application/pdf");
}

export interface SectionPng {
    name: string;
    bytes: Uint8Array;
}

// "auto" follows the format (continuous → doc pages, paged → slides); "doc"/"slides" force a composition
export type PngCompose = "auto" | "doc" | "slides";

// one PNG per section; paged compositions split tall sections into numbered parts
export async function buildSectionPngs(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions & { compose?: PngCompose },
): Promise<SectionPng[]> {
    const art = applyFallbacks(artifact);
    const own = profileFor(art);
    const mode = opts?.compose ?? "auto";
    const asDoc = mode === "doc" || (mode === "auto" && own.kind === "continuous");
    // only `own` carries the artifact's page size; an explicit mode re-renders at that format's
    const profile = asDoc
        ? resolveProfile("doc")
        : mode === "slides"
          ? resolveProfile("deck")
          : own;
    const layoutW = profile.maxContentWidth ?? PRINT_W;
    const pad = (n: number): string => String(n).padStart(2, "0");
    const files: SectionPng[] = [];

    const addPage = async (canvas: HTMLCanvasElement, name: string): Promise<void> => {
        const cx = canvas.getContext("2d");
        if (opts?.brand && cx) stampBrand(cx, canvas.width, canvas.height, EXPORT_SCALE);
        files.push({ name, bytes: await canvasPng(canvas) });
    };

    for (const [ix, section] of art.sections.entries()) {
        const stem = `${pad(ix + 1)}-${section.id}`;
        if (asDoc) {
            const { commands, height } = layoutSection(section, layoutW, measureText, tk, profile);
            if (height < 1) continue;
            await addPage(
                await renderToCanvas(commands, layoutW, height, tk.bg, EXPORT_SCALE),
                `${stem}.png`,
            );
        } else {
            const slides = sectionSlides(section, tk, profile);
            for (const [part, slide] of slides.entries()) {
                const name = slides.length > 1 ? `${stem}-${part + 1}.png` : `${stem}.png`;
                await addPage(await renderSlidePage(slide, tk.bg, EXPORT_SCALE), name);
            }
        }
    }
    return files;
}

export async function buildSectionPngZip(files: SectionPng[]): Promise<Uint8Array> {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.bytes);
    return zip.generateAsync({ type: "uint8array" });
}

// A4 portrait width in CSS px at 96dpi, zero @page margins; Letter is wider, so it underfills, not clips
const A4_PRINT_PX = 794;

// #galleo-print is print-only (ui/styles.css); paper is continuous, so print always composes as doc
export async function exportPrint(artifact: ArtifactContent, theme: Tokens): Promise<void> {
    const profile = resolveProfile("doc");
    // Lay out at true paper width: CSS `zoom` breaks multi-page print in Chromium (clips past page one).
    const width = A4_PRINT_PX;
    const container = document.createElement("div");
    container.id = "galleo-print";

    // per-section wrapper hints break-inside:avoid, so breaks prefer section seams
    const all: RenderCommand[] = [];
    const flow = document.createElement("div");
    flow.style.cssText = `width:${width}px;background:${theme.bg}`;
    for (const section of applyFallbacks(artifact).sections) {
        const { commands, height } = layoutSection(section, width, measureText, theme, profile);
        all.push(...commands);
        const seg = document.createElement("div");
        seg.style.cssText = `position:relative;width:${width}px;height:${height}px;break-inside:avoid`;
        paint(commands, seg);
        flow.appendChild(seg);
    }
    container.appendChild(flow);

    document.body.appendChild(container);
    // print() snapshots synchronously — backgrounds must be in the browser cache before it fires
    await loadImages(all);
    window.print();
    container.remove();
}
