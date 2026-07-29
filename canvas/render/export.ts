import type { RenderCommand } from "@engine/node";
import type { ArtifactContent } from "@model/artifact";
import type { Tokens } from "@themes";
import { PDFDocument, rgb } from "pdf-lib";
import { fragment } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { EXPORT_SCALE, paint, renderSlidePage, renderToCanvas } from "./backends";
import { measureText, layoutSection, sectionSlides } from "./commands";
import { frameCommand, localize, type Transform } from "./pptx";
import {
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
// A4 geometry (points)
export const A4_W = 595;
export const A4_H = 842;
export const DOC_MARGIN = 48;

// points
export function slidePdfPageSize(
    slide: { w: number; h: number },
    pageW: number = PDF_SLIDE_W,
): { w: number; h: number } {
    return { w: pageW, h: Math.round((pageW * slide.h) / slide.w) };
}

// pageContentPxH is where fragment() slices
export function docPageGeometry(layoutW: number): {
    contentPtW: number;
    scale: number;
    pageContentPxH: number;
} {
    const contentPtW = A4_W - 2 * DOC_MARGIN;
    const scale = contentPtW / layoutW;
    return { contentPtW, scale, pageContentPxH: (A4_H - 2 * DOC_MARGIN) / scale };
}

// device px
export function deckPngCanvasSize(
    slides: { w: number; h: number }[],
    scale: number = EXPORT_SCALE,
): { width: number; height: number } {
    const outW = Math.max(SLIDE_W, ...slides.map((s) => s.w));
    const totalH = slides.reduce((sum, s) => sum + s.h, 0);
    return { width: outW * scale, height: totalH * scale };
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
}

function download(bytes: Uint8Array | string, filename: string, type: string): void {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// brand: stamp the free-tier watermark; paid plans pass false
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

async function exportSlidePdfRaster(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<void> {
    const profile = resolveProfile(artifact.format);
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
    download(await pdf.save(), "galleo.pdf", "application/pdf");
}

async function exportDocPdfRaster(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<void> {
    const docProfile = resolveProfile("doc");
    const layoutW = docProfile.maxContentWidth ?? 744;

    const all: RenderCommand[] = [];
    let y = 0;
    for (const section of artifact.sections) {
        const { commands, height } = layoutSection(section, layoutW, measureText, tk, docProfile);
        for (const c of commands) all.push({ ...c, box: { ...c.box, y: c.box.y + y } });
        y += height; // continuous: sections merge seamlessly
    }

    const { contentPtW, pageContentPxH } = docPageGeometry(layoutW);
    const pages = fragment(all, y, pageContentPxH);

    const pdf = await PDFDocument.create();
    for (const pageCmds of pages) {
        const canvas = await renderToCanvas(pageCmds, layoutW, pageContentPxH, tk.bg, EXPORT_SCALE);
        const cx = canvas.getContext("2d");
        if (brand && cx) stampBrand(cx, canvas.width, canvas.height, EXPORT_SCALE);
        const img = await pdf.embedPng(await canvasPng(canvas));
        const page = pdf.addPage([A4_W, A4_H]);
        page.drawImage(img, {
            x: DOC_MARGIN,
            y: DOC_MARGIN,
            width: contentPtW,
            height: A4_H - 2 * DOC_MARGIN,
        });
    }
    download(await pdf.save(), "galleo-doc.pdf", "application/pdf");
}

// ── native (vector) PDF: emit each RenderCommand as real text/paths, raster only what PDF can't express ──

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

// embed a command as a raster PNG placed at its box (y-flipped) — for images, gradients, clipped content
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

// emit one framed command (box already in pt) natively; raster-fallback for what PDF vector can't express
async function emitCommand(
    ctx: Ctx,
    c: RenderCommand,
    measureCx: CanvasRenderingContext2D,
): Promise<void> {
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
    filename: string,
): Promise<void> {
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
    download(await pdf.save(), filename, "application/pdf");
}

async function exportSlidePdfVector(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<void> {
    const profile = resolveProfile(artifact.format);
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
    await renderFramedPdf(pages, tk, brand, "galleo.pdf");
}

async function exportDocPdfVector(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<void> {
    const docProfile = resolveProfile("doc");
    const layoutW = docProfile.maxContentWidth ?? 744;
    const all: RenderCommand[] = [];
    let y = 0;
    for (const section of artifact.sections) {
        const { commands, height } = layoutSection(section, layoutW, measureText, tk, docProfile);
        for (const c of commands) all.push({ ...c, box: { ...c.box, y: c.box.y + y } });
        y += height;
    }
    const { scale, pageContentPxH } = docPageGeometry(layoutW);
    const t: Transform = { fit: scale, offX: DOC_MARGIN, offY: DOC_MARGIN };
    const pages: FramedPage[] = fragment(all, y, pageContentPxH).map((pageCmds) => ({
        framed: pageCmds.map((c) => frameCommand(c, t)),
        pageW: A4_W,
        pageH: A4_H,
        bg: tk.bg,
    }));
    await renderFramedPdf(pages, tk, brand, "galleo-doc.pdf");
}

// vector export by default; any failure (font fetch, pdf-lib) degrades to the raster path
async function exportSlidePdf(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<void> {
    try {
        await exportSlidePdfVector(artifact, tk, brand);
    } catch {
        await exportSlidePdfRaster(artifact, tk, brand);
    }
}
async function exportDocPdf(artifact: ArtifactContent, tk: Tokens, brand: boolean): Promise<void> {
    try {
        await exportDocPdfVector(artifact, tk, brand);
    } catch {
        await exportDocPdfRaster(artifact, tk, brand);
    }
}

export function exportPdfAuto(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    const brand = opts?.brand ?? false;
    return resolveProfile(artifact.format).kind === "continuous"
        ? exportDocPdf(artifact, tk, brand)
        : exportSlidePdf(artifact, tk, brand);
}

export async function exportDeckPng(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    const profile = resolveProfile(artifact.format);
    const slides = artifact.sections.flatMap((s) => sectionSlides(s, tk, profile));
    const out = document.createElement("canvas");
    const size = deckPngCanvasSize(slides, EXPORT_SCALE);
    out.width = size.width;
    out.height = size.height;
    const cx = out.getContext("2d");
    if (!cx) return;
    let y = 0;
    for (const slide of slides) {
        const canvas = await renderSlidePage(slide, tk.bg, EXPORT_SCALE);
        cx.drawImage(canvas, 0, y * EXPORT_SCALE);
        y += slide.h;
        if (opts?.brand) stampBrand(cx, out.width, y * EXPORT_SCALE, EXPORT_SCALE);
    }
    download(await canvasPng(out), "galleo-deck.png", "image/png");
}

// #galleo-print shows only in @media print (studio.css)
export function exportPrint(artifact: ArtifactContent, theme: Tokens): void {
    const width = resolveProfile(artifact.format).maxContentWidth ?? PRINT_W;
    const container = document.createElement("div");
    container.id = "galleo-print";

    for (const section of artifact.sections) {
        const { commands, height } = layoutSection(section, width, measureText, theme);
        const page = document.createElement("div");
        page.style.cssText = `position:relative;width:${width}px;height:${height}px;background:${theme.bg};break-after:page;page-break-after:always`;
        paint(commands, page);
        container.appendChild(page);
    }

    document.body.appendChild(container);
    window.print();
    container.remove();
}
