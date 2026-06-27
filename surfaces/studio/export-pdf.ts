import { PDFDocument } from "pdf-lib";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { renderSlide } from "./canvas-backend";
import { paint } from "./dom-backend";
import { editor } from "./editor";
import { measureText } from "./measure";
import { layoutSection } from "./render";

const PRINT_W = 1100;

// Slide geometry (matches Present) + the PDF page size in points (13.33in × 7.5in widescreen).
const SLIDE_W = 1280;
const SLIDE_H = 720;
const CONTENT_W = 1180;
const SCALE = 2; // raster supersampling for crisp output
const PAGE_W = 960;
const PAGE_H = 540;

function tokens() {
    return resolveTheme(editor.artifact.theme).tokens;
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

// Pixel-perfect PDF: each section is rendered to a 16:9 slide canvas (exact fonts, gradients,
// rounded cards, charts) and embedded as a PDF page. (Selectable-text vector layer is the next step.)
export async function exportPdf(): Promise<void> {
    const tk = tokens();
    const pdf = await PDFDocument.create();
    for (const section of editor.artifact.sections) {
        const { canvas } = await renderSlide(section, tk, { w: SLIDE_W, h: SLIDE_H, contentW: CONTENT_W, scale: SCALE });
        const img = await pdf.embedPng(await canvasPng(canvas));
        const page = pdf.addPage([PAGE_W, PAGE_H]);
        page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
    download(await pdf.save(), "galleo.pdf", "application/pdf");
}

// Export the whole deck as one tall PNG (all slides stacked).
export async function exportDeckPng(): Promise<void> {
    const tk = tokens();
    const sections = editor.artifact.sections;
    const out = document.createElement("canvas");
    out.width = SLIDE_W * SCALE;
    out.height = SLIDE_H * SCALE * sections.length;
    const cx = out.getContext("2d");
    if (!cx) return;
    for (let i = 0; i < sections.length; i++) {
        const { canvas } = await renderSlide(sections[i]!, tk, { w: SLIDE_W, h: SLIDE_H, contentW: CONTENT_W, scale: SCALE });
        cx.drawImage(canvas, 0, i * SLIDE_H * SCALE);
    }
    download(await canvasPng(out), "galleo-deck.png", "image/png");
}

// Continuous → paper, via the browser print dialog. Best for the Document format. (#galleo-print is
// shown only in @media print — see studio.css.)
export function exportPrint(): void {
    const theme = tokens();
    const width = resolveProfile(editor.artifact.format).maxContentWidth ?? PRINT_W;
    const container = document.createElement("div");
    container.id = "galleo-print";

    for (const section of editor.artifact.sections) {
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
