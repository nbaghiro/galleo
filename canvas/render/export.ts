import type { RenderCommand } from "@engine/node";
import type { ArtifactContent } from "@model/artifact";
import type { Tokens } from "@themes";
import { PDFDocument, rgb } from "pdf-lib";
import { resolveProfile } from "@engine/profile";
import { EXPORT_SCALE, loadImages, paint, renderSlidePage, renderToCanvas } from "./backends";
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
export const A4_W = 595; // points; doc pages keep this width, height follows the section

// points
export function slidePdfPageSize(
    slide: { w: number; h: number },
    pageW: number = PDF_SLIDE_W,
): { w: number; h: number } {
    return { w: pageW, h: Math.round((pageW * slide.h) / slide.w) };
}

// doc export mirrors the deck's page-per-section shape: fixed width, natural section height
export function docSectionPageSize(layoutW: number, sectionH: number): { w: number; h: number } {
    return { w: A4_W, h: (sectionH * A4_W) / layoutW };
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
    const pages: FramedPage[] = [];
    for (const section of artifact.sections) {
        const { commands, height } = layoutSection(section, layoutW, measureText, tk, docProfile);
        if (height < 1) continue;
        const { w: pageW, h: pageH } = docSectionPageSize(layoutW, height);
        const t: Transform = { fit: pageW / layoutW, offX: 0, offY: 0 };
        pages.push({ framed: commands.map((c) => frameCommand(c, t)), pageW, pageH, bg: tk.bg });
    }
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

// one PNG per section (paged formats split tall sections into numbered slide parts), zipped together
export async function exportSectionPngs(
    artifact: ArtifactContent,
    tk: Tokens,
    opts?: ExportOptions,
): Promise<void> {
    const profile = resolveProfile(artifact.format);
    const continuous = profile.kind === "continuous";
    const layoutW = profile.maxContentWidth ?? PRINT_W;
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const pad = (n: number): string => String(n).padStart(2, "0");

    const addPage = async (canvas: HTMLCanvasElement, name: string): Promise<void> => {
        const cx = canvas.getContext("2d");
        if (opts?.brand && cx) stampBrand(cx, canvas.width, canvas.height, EXPORT_SCALE);
        zip.file(name, await canvasPng(canvas));
    };

    for (const [ix, section] of artifact.sections.entries()) {
        const stem = `${pad(ix + 1)}-${section.id}`;
        if (continuous) {
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
    const bytes = await zip.generateAsync({ type: "uint8array" });
    download(bytes, "galleo-sections.zip", "application/zip");
}

// A4 portrait width in CSS px at 96dpi with zero @page margins — the widest safe print target
// (US Letter is wider, so it underfills slightly rather than clipping)
const A4_PRINT_PX = 794;

// #galleo-print shows only in @media print (ui/styles.css).
// Paper is continuous, so print ALWAYS composes with the doc profile — seamless sections exactly
// as the editor's doc view — regardless of the artifact's current format toggle.
export async function exportPrint(artifact: ArtifactContent, theme: Tokens): Promise<void> {
    const profile = resolveProfile("doc");
    const width = profile.maxContentWidth ?? PRINT_W;
    const zoom = A4_PRINT_PX / width; // layout px → paper px, so wide layouts never clip
    const container = document.createElement("div");
    container.id = "galleo-print";

    // Each section sits in its own wrapper hinted break-inside:avoid, so page breaks prefer
    // section seams (a section taller than a page still breaks inside; the hint degrades gracefully).
    const all: RenderCommand[] = [];
    const flow = document.createElement("div");
    flow.style.cssText = `width:${width}px;background:${theme.bg};zoom:${zoom}`;
    for (const section of artifact.sections) {
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
