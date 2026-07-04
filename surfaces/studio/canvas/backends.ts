// Paint backends: the DOM and 2D-canvas drawers, section backdrops, and the shared section-stack painter that drives them.

import type {
    DrawContext,
    DrawStyle,
    DrawTextStyle,
    Run,
    TextLeaf,
    RenderCommand,
    Rect,
    Region,
} from "@engine/node";
import {
    CODE_BG,
    MONO_FONT_STACK,
    layoutRuns,
    measureText,
    layoutSlide,
    layoutSection,
    SECTION_GAP,
} from "./render";
import type { Section, SectionBackground } from "@model/artifact";
import type { Tokens } from "@themes/theme";
import { resolveProfile } from "@engine/profile";
import type { FormatDescriptor } from "@model/format";

// A DOM render backend: paints absolute-positioned divs from the engine's render commands.

// Fill a text element with styled <span>s (one per run), letting the browser wrap them inside the
// block just as a single text node would. The base font/size/color/align live on the container `el`;
// each run only overrides what its marks set. Concatenated span text equals the plain string.
function appendRuns(el: HTMLElement, runs: Run[]): void {
    for (const run of runs) {
        const span = document.createElement("span");
        span.textContent = run.text;
        if (run.bold) span.style.fontWeight = "700";
        if (run.italic) span.style.fontStyle = "italic";
        const deco = [run.underline ? "underline" : "", run.strike ? "line-through" : ""]
            .filter(Boolean)
            .join(" ");
        if (deco) span.style.textDecorationLine = deco;
        if (run.color) span.style.color = run.color;
        if (run.code) {
            span.style.fontFamily = MONO_FONT_STACK;
            span.style.background = CODE_BG;
            span.style.borderRadius = "3px";
        }
        if (run.highlight) span.style.background = run.highlight;
        el.appendChild(span);
    }
}

function paintText(el: HTMLElement, t: TextLeaf): void {
    el.style.font = `${t.weight ?? 400} ${t.size}px ${t.fontId}`;
    el.style.lineHeight = `${t.lineHeight ?? t.size * 1.35}px`;
    el.style.color = t.color ?? "#1a1a1a";
    el.style.textAlign = t.align ?? "start";
    el.style.whiteSpace = t.wrap === "none" ? "pre" : "pre-wrap"; // honor \n hard breaks
    el.style.overflow = "hidden";
    if (t.runs && t.runs.length > 0) appendRuns(el, t.runs);
    else el.textContent = t.text;
}

// Canvas implementation of the engine's backend-abstract DrawContext (for surface elements).
export function canvasDrawContext(cx: CanvasRenderingContext2D): DrawContext {
    const apply = (s: DrawStyle): void => {
        if (s.fill) cx.fillStyle = s.fill;
        if (s.stroke) cx.strokeStyle = s.stroke;
        cx.lineWidth = s.width ?? 1;
        cx.setLineDash(s.dash ?? []);
    };
    const finish = (s: DrawStyle): void => {
        if (s.fill) cx.fill();
        if (s.stroke) cx.stroke();
    };
    return {
        rect(x, y, w, h, s) {
            apply(s);
            cx.beginPath();
            cx.roundRect(x, y, w, h, s.radius ?? 0);
            finish(s);
        },
        line(x1, y1, x2, y2, s) {
            apply(s);
            cx.beginPath();
            cx.moveTo(x1, y1);
            cx.lineTo(x2, y2);
            cx.stroke();
        },
        circle(cxx, cyy, r, s) {
            apply(s);
            cx.beginPath();
            cx.arc(cxx, cyy, r, 0, Math.PI * 2);
            finish(s);
        },
        polyline(points, s) {
            apply(s);
            cx.beginPath();
            points.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])));
            finish(s);
        },
        wedge(cxx, cyy, r, a0, a1, s) {
            apply(s);
            cx.beginPath();
            cx.moveTo(cxx, cyy);
            cx.arc(cxx, cyy, r, a0, a1);
            cx.closePath();
            finish(s);
        },
        text(text, x, y, s: DrawTextStyle) {
            cx.fillStyle = s.fill ?? "#000";
            cx.font = `${s.weight ?? 400} ${s.size ?? 12}px ${s.font ?? "system-ui, sans-serif"}`;
            cx.textAlign = s.align === "start" ? "left" : s.align === "end" ? "right" : "center";
            cx.textBaseline = s.baseline ?? "alphabetic";
            cx.fillText(text, x, y);
        },
    };
}

export function paint(commands: RenderCommand[], host: HTMLElement): void {
    host.replaceChildren();
    host.style.position = "relative";
    for (const c of commands) {
        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = `${c.box.x}px`;
        el.style.top = `${c.box.y}px`;
        el.style.width = `${c.box.w}px`;
        el.style.height = `${c.box.h}px`;
        el.style.boxSizing = "border-box";
        if (c.kind === "rect") {
            const g = c.fill?.gradient;
            if (g)
                el.style.background = `linear-gradient(${g.angle ?? 135}deg, ${g.from}, ${g.to})`;
            else if (c.fill?.color) el.style.background = c.fill.color;
            if (c.fill?.radius !== undefined) el.style.borderRadius = `${c.fill.radius}px`;
            if (c.fill?.border) {
                const b = c.fill.border;
                el.style.border = `${b.width}px ${b.style ?? "solid"} ${b.color}`;
            }
            if (c.fill?.shadow) el.style.boxShadow = c.fill.shadow;
        } else if (c.kind === "image") {
            const scrim = c.image.scrim;
            const url = `url("${c.image.src}")`;
            el.style.backgroundImage = scrim
                ? `linear-gradient(rgba(0,0,0,${scrim}), rgba(0,0,0,${scrim})), ${url}`
                : url;
            el.style.backgroundSize = c.image.fit;
            el.style.backgroundPosition = "center";
            el.style.backgroundRepeat = "no-repeat";
            if (c.image.radius !== undefined) el.style.borderRadius = `${c.image.radius}px`;
        } else if (c.kind === "text") {
            paintText(el, c.text);
        } else {
            const canvas = document.createElement("canvas");
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(c.box.w * dpr));
            canvas.height = Math.max(1, Math.round(c.box.h * dpr));
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            const cx = canvas.getContext("2d");
            if (cx) {
                cx.scale(dpr, dpr);
                c.paint(canvasDrawContext(cx), { x: 0, y: 0, w: c.box.w, h: c.box.h });
            }
            el.appendChild(canvas);
        }
        host.appendChild(el);
    }
}

// A Canvas render backend: draws a RenderCommand[] onto a 2D context. Mirrors the DOM backend so the
// raster output matches the editor. Powers PNG export + the rasterized surfaces inside the PDF.

// Greedy word-wrap identical to measure.ts, so canvas line breaks match what the engine laid out.
function wrapLines(cx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (cx.measureText(candidate).width > maxWidth && line !== "") {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    lines.push(line);
    return lines;
}

function roundRectPath(
    cx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    cx.beginPath();
    cx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

function drawImageFit(
    cx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    b: { x: number; y: number; w: number; h: number },
    fit: string,
    radius?: number,
    scrim?: number,
): void {
    cx.save();
    if (radius) {
        roundRectPath(cx, b.x, b.y, b.w, b.h, radius);
        cx.clip();
    }
    const ir = img.width / img.height || 1;
    const br = b.w / b.h;
    let dw: number;
    let dh: number;
    if (fit === "contain" ? ir > br : ir < br) {
        dw = b.w;
        dh = dw / ir;
    } else {
        dh = b.h;
        dw = dh * ir;
    }
    cx.drawImage(img, b.x + (b.w - dw) / 2, b.y + (b.h - dh) / 2, dw, dh);
    if (scrim) {
        cx.fillStyle = `rgba(0,0,0,${scrim})`;
        cx.fillRect(b.x, b.y, b.w, b.h);
    }
    cx.restore();
}

// Paint a runs-carrying text leaf: word-wrap it (identical to the engine's measure), then draw each
// styled fragment at its own x with its own font/color, plus drawn underline/strike and a code bg.
// This is the export-fidelity path (PNG + rasterized-into-PDF), so per-run geometry must be exact.
function drawRuns(cx: CanvasRenderingContext2D, t: TextLeaf, b: Rect): void {
    const laid = layoutRuns(cx, t, b.w);
    const baseColor = t.color ?? "#1a1a1a";
    const lh = laid.lineHeight;
    cx.textAlign = "left";
    cx.textBaseline = "middle";
    laid.lines.forEach((line, i) => {
        const dx =
            t.align === "center"
                ? (b.w - line.width) / 2
                : t.align === "end"
                  ? b.w - line.width
                  : 0;
        const midY = b.y + i * lh + lh / 2;
        for (const f of line.frags) {
            const x = b.x + dx + f.x;
            if (f.highlight || f.code) {
                cx.fillStyle = f.highlight ?? CODE_BG;
                cx.fillRect(x, midY - lh / 2, f.width, lh);
            }
            cx.font = f.font;
            cx.fillStyle = f.color ?? baseColor;
            cx.fillText(f.text, x, midY);
            if (f.underline || f.strike) {
                cx.strokeStyle = f.color ?? baseColor;
                cx.lineWidth = Math.max(1, t.size * 0.06);
                cx.setLineDash([]);
                if (f.underline) {
                    const uy = midY + t.size * 0.34;
                    cx.beginPath();
                    cx.moveTo(x, uy);
                    cx.lineTo(x + f.width, uy);
                    cx.stroke();
                }
                if (f.strike) {
                    cx.beginPath();
                    cx.moveTo(x, midY);
                    cx.lineTo(x + f.width, midY);
                    cx.stroke();
                }
            }
        }
    });
}

function drawCommands(
    cx: CanvasRenderingContext2D,
    commands: RenderCommand[],
    images: Map<string, HTMLImageElement>,
): void {
    for (const c of commands) {
        const b = c.box;
        if (c.kind === "rect") {
            const f = c.fill;
            roundRectPath(cx, b.x, b.y, b.w, b.h, f?.radius ?? 0);
            if (f?.gradient) {
                const a = ((f.gradient.angle ?? 135) * Math.PI) / 180;
                const hx = (Math.abs(Math.cos(a)) * b.w + Math.abs(Math.sin(a)) * b.h) / 2;
                const cxn = b.x + b.w / 2;
                const cyn = b.y + b.h / 2;
                const grad = cx.createLinearGradient(
                    cxn - Math.cos(a) * hx,
                    cyn - Math.sin(a) * hx,
                    cxn + Math.cos(a) * hx,
                    cyn + Math.sin(a) * hx,
                );
                grad.addColorStop(0, f.gradient.from);
                grad.addColorStop(1, f.gradient.to);
                cx.fillStyle = grad;
                cx.fill();
            } else if (f?.color) {
                cx.fillStyle = f.color;
                cx.fill();
            }
            if (f?.border) {
                cx.strokeStyle = f.border.color;
                cx.lineWidth = f.border.width;
                cx.setLineDash(
                    f.border.style === "dashed" ? [f.border.width * 2.5, f.border.width * 2] : [],
                );
                cx.stroke();
                cx.setLineDash([]);
            }
        } else if (c.kind === "image") {
            const img = images.get(c.image.src);
            if (img) drawImageFit(cx, img, b, c.image.fit, c.image.radius, c.image.scrim);
        } else if (c.kind === "text" && c.text.runs && c.text.runs.length > 0) {
            drawRuns(cx, c.text, b);
        } else if (c.kind === "text") {
            const t = c.text;
            cx.font = `${t.weight ?? 400} ${t.size}px ${t.fontId}`;
            cx.fillStyle = t.color ?? "#1a1a1a";
            cx.textBaseline = "middle";
            cx.textAlign = t.align === "center" ? "center" : t.align === "end" ? "right" : "left";
            const x = t.align === "center" ? b.x + b.w / 2 : t.align === "end" ? b.x + b.w : b.x;
            const lh = t.lineHeight ?? t.size * 1.35;
            const lines =
                t.wrap === "none"
                    ? t.text.split("\n")
                    : t.text.split("\n").flatMap((seg) => wrapLines(cx, seg, b.w));
            lines.forEach((line, i) => cx.fillText(line, x, b.y + i * lh + lh / 2));
        } else {
            cx.save();
            cx.translate(b.x, b.y);
            c.paint(canvasDrawContext(cx), { x: 0, y: 0, w: b.w, h: b.h });
            cx.restore();
        }
    }
}

async function loadImages(commands: RenderCommand[]): Promise<Map<string, HTMLImageElement>> {
    const srcs = [
        ...new Set(
            commands
                .filter((c): c is Extract<RenderCommand, { kind: "image" }> => c.kind === "image")
                .map((c) => c.image.src),
        ),
    ];
    const map = new Map<string, HTMLImageElement>();
    await Promise.all(
        srcs.map(
            (src) =>
                new Promise<void>((resolve) => {
                    const im = new Image();
                    im.crossOrigin = "anonymous";
                    im.onload = () => {
                        map.set(src, im);
                        resolve();
                    };
                    im.onerror = () => resolve();
                    im.src = src;
                }),
        ),
    );
    return map;
}

// Draw a command flow onto a w×h canvas filled with `bg` (used for paginated pages).
export async function renderToCanvas(
    commands: RenderCommand[],
    w: number,
    h: number,
    bg: string,
    scale: number,
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const cx = canvas.getContext("2d");
    if (!cx) return canvas;
    cx.scale(scale, scale);
    cx.fillStyle = bg;
    cx.fillRect(0, 0, w, h);
    const images = await loadImages(commands);
    drawCommands(cx, commands, images);
    return canvas;
}

interface SlideRender {
    canvas: HTMLCanvasElement;
    commands: RenderCommand[];
    layoutW: number;
    height: number;
    fit: number;
    offsetX: number;
    offsetY: number;
}

// Render one section into a fixed page (w×h), section centered + scaled to fit. Returns the canvas
// plus the placement transform (so a vector backend can reuse the same geometry).
export async function renderSlide(
    section: Section,
    tk: Tokens,
    opts: { w: number; h: number; scale: number },
): Promise<SlideRender> {
    const { w, h, scale } = opts;
    const { commands, height } = layoutSlide(
        section,
        w,
        h,
        measureText,
        tk,
        resolveProfile("deck"),
    );
    const fit = Math.min(1, h / height);
    const offsetX = (w - w * fit) / 2;
    const offsetY = (h - height * fit) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const cx = canvas.getContext("2d");
    if (cx) {
        cx.scale(scale, scale);
        cx.fillStyle = tk.bg;
        cx.fillRect(0, 0, w, h);
        const images = await loadImages(commands);
        cx.save();
        cx.translate(offsetX, offsetY);
        cx.scale(fit, fit);
        drawCommands(cx, commands, images);
        cx.restore();
    }
    return { canvas, commands, layoutW: w, height, fit, offsetX, offsetY };
}

// CSS `background` value for a document/section backdrop: image+scrim, gradient, color, or theme bg.
export function backdropCss(bg: SectionBackground | undefined, tokens: Tokens): string {
    if (!bg || bg.kind === "none") return tokens.bg;
    if (bg.kind === "image" && bg.image) {
        const s = bg.scrim ?? 0;
        const url = `url("${bg.image}")`;
        return s ? `linear-gradient(rgba(0,0,0,${s}),rgba(0,0,0,${s})), ${url}` : url;
    }
    if (bg.kind === "gradient" && bg.gradient) {
        return `linear-gradient(${bg.gradient.angle ?? 135}deg, ${bg.gradient.from}, ${bg.gradient.to})`;
    }
    if (bg.kind === "color" && bg.color) return bg.color;
    return tokens.bg;
}

// Paint a vertical stack of sections into `host` — deck = centered content columns with gaps, doc/web =
// seamless full-bleed bands. Each section is laid out by the engine and painted into an absolutely-
// positioned layer. Returns the per-section top offsets, the hit-test regions (in stage coords), and the
// total height (incl. the trailing gap). Callers own the host element, its clearing, and any background —
// this is only the loop the studio canvas, present view, and read-only preview share.
export function paintSectionStack(
    host: HTMLElement,
    sections: Section[],
    profile: FormatDescriptor,
    theme: Tokens,
    opts: { fullW: number; startY?: number; hideId?: string | null },
): { tops: number[]; regions: Region[]; height: number } {
    const web = profile.id === "web";
    const gap = profile.kind === "continuous" ? 0 : SECTION_GAP; // doc/web merge seamlessly
    const contentW = Math.min(opts.fullW - 64, profile.maxContentWidth ?? 1080);
    const tops: number[] = [];
    const regions: Region[] = [];
    let y = opts.startY ?? 0;
    for (const section of sections) {
        const bleed = (section.bleed ?? false) || web;
        const layoutW = bleed ? opts.fullW : contentW;
        const x = bleed ? 0 : Math.round((opts.fullW - contentW) / 2);
        const res = layoutSection(section, layoutW, measureText, theme, profile);
        const commands = opts.hideId
            ? res.commands.filter((c) => !(c.kind === "text" && c.id === opts.hideId))
            : res.commands;
        const layer = document.createElement("div");
        layer.style.cssText = `left:${x}px;top:${y}px;width:${layoutW}px;height:${res.height}px`;
        paint(commands, layer);
        layer.style.position = "absolute"; // paint() forces relative; keep layers out of flow
        host.appendChild(layer);
        for (const r of res.regions)
            regions.push({
                id: r.id,
                box: { x: r.box.x + x, y: r.box.y + y, w: r.box.w, h: r.box.h },
            });
        tops.push(y);
        y += res.height + gap;
    }
    return { tops, regions, height: y };
}

// Fit render commands (of natural height contentH) into a slideW × slideH frame — scaled down + centered
// — and paint them. Returns the positioned content element; the caller wraps it in its own slide frame.
export function fitSlideContent(
    commands: RenderCommand[],
    contentH: number,
    slideW: number,
    slideH: number,
): HTMLDivElement {
    const fit = Math.min(1, slideH / contentH);
    const content = document.createElement("div");
    content.style.cssText = `position:absolute;width:${slideW}px;height:${contentH}px;transform:scale(${fit});transform-origin:top left;left:${(slideW - slideW * fit) / 2}px;top:${(slideH - contentH * fit) / 2}px`;
    paint(commands, content);
    return content;
}
