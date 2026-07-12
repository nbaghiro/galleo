// Pure page geometry for PDF/PNG export — the arithmetic that turns engine output into paper/raster
// dimensions. Kept apart from the IO shell (export.ts: pdf-lib, canvas.toBlob, download, window.print) so
// the math is unit-tested while the shell stays a thin orchestrator. See .docs/testing.md.

export const PRINT_W = 1100; // fallback print-column width (px) when a format has no maxContentWidth
export const SLIDE_W = 1280; // default deck slide width (matches Present)
export const EXPORT_SCALE = 2; // raster supersampling for crisp output
export const PDF_SLIDE_W = 960; // deck PDF page width (points); page height flexes with the slide aspect
// A4 page geometry (points) for the continuous Document format.
export const A4_W = 595;
export const A4_H = 842;
export const DOC_MARGIN = 48;

// A deck slide → its PDF page size (points): a fixed page width, the height preserving the slide's aspect.
export function slidePdfPageSize(
    slide: { w: number; h: number },
    pageW: number = PDF_SLIDE_W,
): { w: number; h: number } {
    return { w: pageW, h: Math.round((pageW * slide.h) / slide.w) };
}

// A4 document-flow geometry for a reading column laid out at `layoutW` px: the printable content width
// (points), the px→pt scale, and the page's content height back in layout px (what fragment() slices at).
export function docPageGeometry(layoutW: number): {
    contentPtW: number;
    scale: number;
    pageContentPxH: number;
} {
    const contentPtW = A4_W - 2 * DOC_MARGIN;
    const scale = contentPtW / layoutW;
    return { contentPtW, scale, pageContentPxH: (A4_H - 2 * DOC_MARGIN) / scale };
}

// The stacked-PNG canvas size (device px) for a deck: the widest slide (never below SLIDE_W) by the summed
// slide heights, at `scale`.
export function deckPngCanvasSize(
    slides: { w: number; h: number }[],
    scale: number = EXPORT_SCALE,
): { width: number; height: number } {
    const outW = Math.max(SLIDE_W, ...slides.map((s) => s.w));
    const totalH = slides.reduce((sum, s) => sum + s.h, 0);
    return { width: outW * scale, height: totalH * scale };
}
