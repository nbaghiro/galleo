import type { RenderCommand } from "@engine/node";
import type { ArtifactContent } from "@model/artifact";
import type { Tokens } from "@themes/theme";
import { PDFDocument } from "pdf-lib";
import { fragment } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { renderSlide, renderToCanvas, paint } from "./backends";
import { measureText, layoutSection } from "./commands";

// Export an artifact to PDF / PNG / print — editor-free: every entry point takes the artifact + its
// resolved theme tokens, so the studio, a present surface, or a publish page can all export the same way.

const PRINT_W = 1100;
// Slide geometry (matches Present) + the PDF page size in points (13.33in × 7.5in widescreen).
const SLIDE_W = 1280;
const SLIDE_H = 720;
const SCALE = 2; // raster supersampling for crisp output
const PAGE_W = 960;
const PAGE_H = 540;
// A4 page geometry (points) for the continuous Document format.
const A4_W = 595;
const A4_H = 842;
const DOC_MARGIN = 48;

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

// Export options threaded from the caller's plan (@model/billing). `brand` stamps the free-tier Galleo
// mark onto each exported surface; paid plans (removeBranding) pass brand:false for a clean export.
export interface ExportOptions {
    brand?: boolean;
}

// The free-tier watermark. Drawn bottom-right on each raster surface (a slide/page/PNG band) with a soft
// shadow so it reads on both light and dark slides. Coordinates are in device pixels (already scaled).
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

// Pixel-perfect PDF: each section is rendered to a 16:9 slide canvas (exact fonts, gradients,
// rounded cards, charts) and embedded as a PDF page. (Selectable-text vector layer is the next step.)
async function exportSlidePdf(
    artifact: ArtifactContent,
    tk: Tokens,
    brand: boolean,
): Promise<void> {
    const pdf = await PDFDocument.create();
    for (const section of artifact.sections) {
        const { canvas } = await renderSlide(section, tk, { w: SLIDE_W, h: SLIDE_H, scale: SCALE });
        const cx = canvas.getContext("2d");
        if (brand && cx) stampBrand(cx, canvas.width, canvas.height, SCALE);
        const img = await pdf.embedPng(await canvasPng(canvas));
        const page = pdf.addPage([PAGE_W, PAGE_H]);
        page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
    download(await pdf.save(), "galleo.pdf", "application/pdf");
}

// Document/continuous → paginated A4 PDF: lay out all sections in a reading column, then fragment the
// flow into page-height chunks (engine/fragment) and render each as a page.
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

    const contentPtW = A4_W - 2 * DOC_MARGIN;
    const scale = contentPtW / layoutW;
    const pageContentPxH = (A4_H - 2 * DOC_MARGIN) / scale;
    const pages = fragment(all, y, pageContentPxH);

    const pdf = await PDFDocument.create();
    for (const pageCmds of pages) {
        const canvas = await renderToCanvas(pageCmds, layoutW, pageContentPxH, tk.bg, SCALE);
        const cx = canvas.getContext("2d");
        if (brand && cx) stampBrand(cx, canvas.width, canvas.height, SCALE);
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

// Format-aware PDF: deck → 16:9 slide pages; doc/web → paginated A4.
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

// Export the whole deck as one tall PNG (all slides stacked).
export async function exportDeckPng(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    const sections = artifact.sections;
    const out = document.createElement("canvas");
    out.width = SLIDE_W * SCALE;
    out.height = SLIDE_H * SCALE * sections.length;
    const cx = out.getContext("2d");
    if (!cx) return;
    for (let i = 0; i < sections.length; i++) {
        const { canvas } = await renderSlide(sections[i]!, tk, {
            w: SLIDE_W,
            h: SLIDE_H,
            scale: SCALE,
        });
        cx.drawImage(canvas, 0, i * SLIDE_H * SCALE);
        if (opts?.brand) stampBrand(cx, out.width, (i + 1) * SLIDE_H * SCALE, SCALE);
    }
    download(await canvasPng(out), "galleo-deck.png", "image/png");
}

// Continuous → paper, via the browser print dialog. Best for the Document format. (#galleo-print is
// shown only in @media print — see studio.css.)
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
