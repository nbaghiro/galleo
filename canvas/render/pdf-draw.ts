import type { DrawContext, DrawStyle, DrawTextStyle, RenderCommand } from "@engine/node";
import type { PDFDocument, PDFFont, PDFPage, PDFPageDrawSVGOptions } from "pdf-lib";
import { LineCapStyle, PDFString, StandardFonts, rgb } from "pdf-lib";
import { buildPathData } from "./svg-emit";
import { CODE_BG, LINE_HEIGHT_FACTOR, layoutRuns, leafForRuns } from "./commands";
import { fetchFontTtf, familyFromFont, italicFromFont, slotFor, weightFromFont } from "./fonts";

type RGB = [number, number, number];

// CSS color → pdf-lib rgb components (0..1) + alpha; null if unparseable (caller omits the paint)
export function pdfColor(css: string | undefined): { rgb: RGB; alpha: number } | null {
    if (!css) return null;
    const s = css.trim();
    if (s.startsWith("#")) {
        let h = s.slice(1);
        if (h.length === 3)
            h = h
                .split("")
                .map((c) => c + c)
                .join("");
        if (h.length !== 6 && h.length !== 8) return null;
        const r = parseInt(h.slice(0, 2), 16) / 255;
        const g = parseInt(h.slice(2, 4), 16) / 255;
        const b = parseInt(h.slice(4, 6), 16) / 255;
        const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        return { rgb: [r, g, b], alpha };
    }
    const m = s.match(/^rgba?\(([^)]+)\)/i);
    if (m) {
        const parts = m[1]!.split(",").map((p) => parseFloat(p.trim()));
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
        const alpha = parts.length >= 4 ? parts[3]! : 1;
        return { rgb: [parts[0]! / 255, parts[1]! / 255, parts[2]! / 255], alpha };
    }
    return null;
}

const capStyle = (c?: DrawStyle["cap"]): LineCapStyle =>
    c === "round"
        ? LineCapStyle.Round
        : c === "square"
          ? LineCapStyle.Projecting
          : LineCapStyle.Butt;

// drawSvgPath paints one flat color, so a gradient flattens to the midpoint of its stops; shadows drop
function flatFill(s: DrawStyle): { rgb: RGB; alpha: number } | null {
    if (!s.gradient) return pdfColor(s.fill);
    const a = pdfColor(s.gradient.from);
    const b = pdfColor(s.gradient.to);
    if (a && b)
        return {
            rgb: [(a.rgb[0] + b.rgb[0]) / 2, (a.rgb[1] + b.rgb[1]) / 2, (a.rgb[2] + b.rgb[2]) / 2],
            alpha: (a.alpha + b.alpha) / 2,
        };
    return a ?? b ?? pdfColor(s.fill);
}

function svgOpts(s: DrawStyle, pageH: number): PDFPageDrawSVGOptions {
    // drawSvgPath flips y, so anchoring at (0, pageH) lands an absolute-coord path at (px, pageH - py)
    const o: PDFPageDrawSVGOptions = { x: 0, y: pageH };
    const f = flatFill(s);
    if (f) {
        o.color = rgb(...f.rgb);
        if (f.alpha < 1) o.opacity = f.alpha;
    }
    const st = pdfColor(s.stroke);
    if (st) {
        o.borderColor = rgb(...st.rgb);
        o.borderWidth = s.width ?? 1;
        o.borderLineCap = capStyle(s.cap);
        if (st.alpha < 1) o.borderOpacity = st.alpha;
        if (s.dash && s.dash.length) o.borderDashArray = s.dash;
    }
    return o;
}

export interface Ctx {
    doc: PDFDocument;
    page: PDFPage;
    pageH: number; // page height in pt, for the y-flip
    fonts: FontResolver;
}

/**
 * A clickable URI annotation over `box` (top-left origin, in pt; the y-flip happens here). pdf-lib
 * 1.17 ships no link helper, so the annotation dict is built by hand and pushed onto the page.
 */
export function addLinkAnnot(
    c: Ctx,
    box: { x: number; y: number; w: number; h: number },
    url: string,
): void {
    if (!url || box.w < 0.5 || box.h < 0.5) return;
    const ref = c.doc.context.register(
        c.doc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [box.x, c.pageH - (box.y + box.h), box.x + box.w, c.pageH - box.y],
            Border: [0, 0, 0],
            A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
        }),
    );
    c.page.node.addAnnot(ref);
}

// `d` is in absolute page coords; svgOpts does the y-flip
export function drawPathAbs(c: Ctx, d: string, s: DrawStyle): void {
    if (!d) return;
    c.page.drawSvgPath(d, svgOpts(s, c.pageH));
}

export function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (rr <= 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    return (
        `M${x + rr} ${y}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}` +
        `v${h - 2 * rr}a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(w - 2 * rr)}` +
        `a${rr} ${rr} 0 0 1 ${-rr} ${-rr}v${-(h - 2 * rr)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}Z`
    );
}

// offsets surface-local coords by the surface box
export function pdfDrawContext(c: Ctx, ox: number, oy: number): DrawContext {
    const tx = (x: number): number => ox + x;
    const ty = (y: number): number => oy + y;
    return {
        rect(x, y, w, h, s) {
            drawPathAbs(c, roundRectPath(tx(x), ty(y), w, h, s.radius ?? 0), s);
        },
        line(x1, y1, x2, y2, s) {
            drawPathAbs(c, `M${tx(x1)} ${ty(y1)}L${tx(x2)} ${ty(y2)}`, { ...s, fill: undefined });
        },
        circle(cx, cy, r, s) {
            const x = tx(cx);
            const y = ty(cy);
            drawPathAbs(
                c,
                `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`,
                s,
            );
        },
        polyline(points, s) {
            if (!points.length) return;
            let d = `M${tx(points[0]![0])} ${ty(points[0]![1])}`;
            for (let i = 1; i < points.length; i++)
                d += `L${tx(points[i]![0])} ${ty(points[i]![1])}`;
            if (s.fill) d += "Z";
            drawPathAbs(c, d, s);
        },
        wedge(cx, cy, r, a0, a1, s) {
            drawPathAbs(
                c,
                buildPathData((p) => {
                    p.moveTo(tx(cx), ty(cy));
                    p.arc(tx(cx), ty(cy), r, a0, a1);
                    p.closePath();
                }),
                s,
            );
        },
        path(build, s) {
            // re-emit through an offsetting sink so surface-local coords land at their page position
            drawPathAbs(
                c,
                buildPathData((p) =>
                    build({
                        moveTo: (x, y) => p.moveTo(tx(x), ty(y)),
                        lineTo: (x, y) => p.lineTo(tx(x), ty(y)),
                        bezierCurveTo: (a, b, cc, e, x, y) =>
                            p.bezierCurveTo(tx(a), ty(b), tx(cc), ty(e), tx(x), ty(y)),
                        quadraticCurveTo: (a, b, x, y) =>
                            p.quadraticCurveTo(tx(a), ty(b), tx(x), ty(y)),
                        arc: (acx, acy, r, s0, s1, ccw) => p.arc(tx(acx), ty(acy), r, s0, s1, ccw),
                        arcTo: (x1, y1, x2, y2, r) => p.arcTo(tx(x1), ty(y1), tx(x2), ty(y2), r),
                        rect: (x, y, w, h) => p.rect(tx(x), ty(y), w, h),
                        closePath: () => p.closePath(),
                    }),
                ),
                s,
            );
        },
        text(text, x, y, s) {
            drawTextAbs(c, text, tx(x), ty(y), s);
        },
        measureText(text, s) {
            const font = c.fonts(familyFromFont(s.font ?? ""), s.weight ?? 400, false);
            return { width: font.widthOfTextAtSize(text, s.size ?? 12) };
        },
    };
}

// (x,y) is where the canvas backend would place it: align + baseline honored
export function drawTextAbs(c: Ctx, text: string, x: number, y: number, s: DrawTextStyle): void {
    if (!text) return;
    const size = s.size ?? 12;
    const font = c.fonts(familyFromFont(s.font ?? ""), s.weight ?? 400, false);
    const w = font.widthOfTextAtSize(text, size);
    const ax = s.align === "center" ? x - w / 2 : s.align === "end" ? x - w : x;
    // canvas baselines → alphabetic baseline offset (approx; the dominant surface baseline is "middle")
    const by =
        s.baseline === "top"
            ? y + size * 0.8
            : s.baseline === "bottom"
              ? y - size * 0.2
              : s.baseline === "middle"
                ? y + size * 0.3
                : y;
    const col = pdfColor(s.fill) ?? { rgb: [0, 0, 0] as RGB, alpha: 1 };
    c.page.drawText(text, {
        x: ax,
        y: c.pageH - by,
        size,
        font,
        color: rgb(...col.rgb),
        opacity: col.alpha < 1 ? col.alpha : undefined,
    });
}

// boxes already in pt
export function emitRect(
    c: Ctx,
    box: { x: number; y: number; w: number; h: number },
    fill: {
        color?: string;
        radius?: number;
        border?: { color: string; width: number; style?: string };
    },
): void {
    const d = roundRectPath(box.x, box.y, box.w, box.h, fill.radius ?? 0);
    const style: DrawStyle = {};
    if (fill.color) style.fill = fill.color;
    if (fill.border) {
        style.stroke = fill.border.color;
        style.width = fill.border.width;
        if (fill.border.style === "dashed")
            style.dash = [fill.border.width * 2.5, fill.border.width * 2];
    }
    if (style.fill || style.stroke) drawPathAbs(c, d, style);
}

// mirrors backends.drawRuns; the command's own lines, so breaks match screen
export function emitText(
    c: Ctx,
    cmd: Extract<RenderCommand, { kind: "text" }>,
    measureCx: CanvasRenderingContext2D,
): void {
    const t = cmd.text;
    const b = cmd.box;
    const all = cmd.lines ?? layoutRuns(measureCx, leafForRuns(t), b.w).lines;
    const lines = cmd.lineRange ? all.slice(cmd.lineRange.start, cmd.lineRange.end) : all;
    const lh = t.lineHeight ?? t.size * LINE_HEIGHT_FACTOR;
    const baseColor = t.color ?? "#1a1a1a";
    lines.forEach((line, i) => {
        const dx =
            t.align === "center"
                ? (b.w - line.width) / 2
                : t.align === "end"
                  ? b.w - line.width
                  : 0;
        const midY = b.y + i * lh + lh / 2;
        for (const f of line.frags) {
            if (!f.text) continue;
            const x = b.x + dx + f.x;
            if (f.highlight || f.code) {
                emitRect(
                    c,
                    { x, y: midY - lh / 2, w: f.width, h: lh },
                    {
                        color: f.highlight ?? CODE_BG,
                    },
                );
            }
            drawTextAbs(c, f.text, x, midY, {
                fill: f.color ?? baseColor,
                size: t.size,
                font: f.font,
                weight: weightFromFont(f.font),
                align: "start",
                baseline: "middle",
            });
            if (f.underline || f.strike) {
                const style: DrawStyle = {
                    stroke: f.color ?? baseColor,
                    width: Math.max(1, t.size * 0.06),
                };
                if (f.underline)
                    drawPathAbs(
                        c,
                        `M${x} ${midY + t.size * 0.34}L${x + f.width} ${midY + t.size * 0.34}`,
                        style,
                    );
                if (f.strike) drawPathAbs(c, `M${x} ${midY}L${x + f.width} ${midY}`, style);
            }
            if (f.link) addLinkAnnot(c, { x, y: midY - lh / 2, w: f.width, h: lh }, f.link);
        }
    });
}

export type FontResolver = (family: string, weight: number, italic: boolean) => PDFFont;

const fontKey = (family: string, weight: number, italic: boolean): string =>
    `${family}|${slotFor(weight, italic)}`;

// the resolver falls back to the closest embedded font, then Helvetica, so drawText never throws
export async function buildFontBook(
    pdf: PDFDocument,
    textCmds: Extract<RenderCommand, { kind: "text" }>[],
    themeFamilies: string[],
    measureCx: CanvasRenderingContext2D,
): Promise<FontResolver> {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    pdf.registerFontkit(fontkit);

    const want = new Map<string, { family: string; weight: number; italic: boolean }>();
    const add = (family: string, weight: number, italic: boolean): void => {
        const k = fontKey(family, weight, italic);
        if (!want.has(k)) want.set(k, { family, weight, italic });
    };
    for (const cmd of textCmds) {
        const lines = cmd.lines ?? layoutRuns(measureCx, leafForRuns(cmd.text), cmd.box.w).lines;
        for (const line of lines)
            for (const f of line.frags)
                if (f.text)
                    add(familyFromFont(f.font), weightFromFont(f.font), italicFromFont(f.font));
    }
    // surfaces paint labels in the theme families — pre-embed regular + bold so they resolve
    for (const fam of themeFamilies) {
        add(fam, 400, false);
        add(fam, 700, false);
    }

    const embedded = new Map<string, PDFFont>();
    await Promise.all(
        [...want].map(async ([k, m]) => {
            const ttf = await fetchFontTtf(m.family, m.weight, m.italic);
            if (!ttf) return;
            try {
                embedded.set(k, await pdf.embedFont(ttf, { subset: true }));
            } catch {
                /* skip unembeddable font */
            }
        }),
    );
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    return (family, weight, italic) =>
        embedded.get(fontKey(family, weight, italic)) ??
        embedded.get(fontKey(family, weight >= 600 ? 700 : 400, false)) ??
        (weight >= 600 ? helvBold : helv);
}
