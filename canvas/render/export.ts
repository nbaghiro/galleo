import type { RenderCommand } from "@engine/node";
import type { ArtifactContent } from "@model/artifact";
import type { Tokens } from "@themes";
import { PDFDocument } from "pdf-lib";
import { fragment } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { EXPORT_SCALE, paint, renderSlidePage, renderToCanvas } from "./backends";
import { measureText, layoutSection, sectionSlides } from "./commands";

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

async function exportSlidePdf(
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

async function exportDocPdf(artifact: ArtifactContent, tk: Tokens, brand: boolean): Promise<void> {
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
