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
} from "./commands";
import type { Section, SectionBackground } from "@model/artifact";
import type { Tokens } from "@themes";
import { resolveProfile } from "@engine/profile";
import type { FormatDescriptor } from "@model/geometry";

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
        path(build, s) {
            apply(s);
            cx.beginPath();
            build(cx); // the 2D context is itself a PathSink (moveTo/arc/bezierCurveTo/…)
            finish(s);
        },
        text(text, x, y, s: DrawTextStyle) {
            cx.fillStyle = s.fill ?? "#000";
            cx.font = `${s.weight ?? 400} ${s.size ?? 12}px ${s.font ?? "system-ui, sans-serif"}`;
            cx.textAlign = s.align === "start" ? "left" : s.align === "end" ? "right" : "center";
            cx.textBaseline = s.baseline ?? "alphabetic";
            cx.fillText(text, x, y);
        },
        measureText(text, s: DrawTextStyle) {
            cx.font = `${s.weight ?? 400} ${s.size ?? 12}px ${s.font ?? "system-ui, sans-serif"}`;
            return { width: cx.measureText(text).width };
        },
    };
}

// The DOM paint replaces every node on each draw (host.replaceChildren below), which cancels an in-flight
// background-image fetch. A persistent Image() per URL keeps the browser fetching to completion + caches
// it, so re-paints (fonts loading, resize) don't reset large images to blank — the background resolves
// from cache the moment it lands. Not cleared: the browser dedupes the bytes and the map stays small.
const warmed = new Map<string, HTMLImageElement>();
function warmImage(src: string): void {
    if (!src || warmed.has(src)) return;
    const im = new Image();
    im.src = src;
    warmed.set(src, im);
}

// Apply one render command to an absolutely-positioned <div>. Shared by paint() and paintReconcile() so
// the editor and every export/present path draw a command identically.
function applyCommand(el: HTMLElement, c: RenderCommand): void {
    el.style.position = "absolute";
    el.style.left = `${c.box.x}px`;
    el.style.top = `${c.box.y}px`;
    el.style.width = `${c.box.w}px`;
    el.style.height = `${c.box.h}px`;
    el.style.boxSizing = "border-box";
    if (c.kind === "rect") {
        const g = c.fill?.gradient;
        if (g) el.style.background = `linear-gradient(${g.angle ?? 135}deg, ${g.from}, ${g.to})`;
        else if (c.fill?.color) el.style.background = c.fill.color;
        if (c.fill?.radius !== undefined) el.style.borderRadius = `${c.fill.radius}px`;
        if (c.fill?.border) {
            const b = c.fill.border;
            el.style.border = `${b.width}px ${b.style ?? "solid"} ${b.color}`;
        }
        if (c.fill?.shadow) el.style.boxShadow = c.fill.shadow;
    } else if (c.kind === "image") {
        const im = c.image;
        if (im.border) {
            el.style.border = `${im.border.width}px ${im.border.style ?? "solid"} ${im.border.color}`;
        }
        if (im.shadow) el.style.boxShadow = im.shadow;
        if (im.zoom !== undefined && im.zoom > 1) {
            // Zoomed image: an <img> in a clipped frame — `background-size:cover` can't scale past cover,
            // so the picture becomes a real element we can `transform: scale()` and crop. Unzoomed images
            // (and section backgrounds) keep the background path below, which reconciles without a reload.
            el.style.overflow = "hidden";
            if (im.radius !== undefined) el.style.borderRadius = `${im.radius}px`;
            const img = document.createElement("img");
            img.src = im.src;
            img.draggable = false;
            img.decoding = "sync";
            img.style.cssText = `width:100%;height:100%;object-fit:${im.fit};object-position:center;transform:scale(${im.zoom});display:block`;
            el.appendChild(img);
        } else {
            warmImage(im.src);
            const scrim = im.scrim;
            const url = `url("${im.src}")`;
            el.style.backgroundImage = scrim
                ? `linear-gradient(rgba(0,0,0,${scrim}), rgba(0,0,0,${scrim})), ${url}`
                : url;
            el.style.backgroundSize = im.fit;
            el.style.backgroundPosition = "center";
            el.style.backgroundRepeat = "no-repeat";
            if (im.radius !== undefined) el.style.borderRadius = `${im.radius}px`;
        }
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
}

export function paint(commands: RenderCommand[], host: HTMLElement): void {
    host.replaceChildren();
    host.style.position = "relative";
    for (const c of commands) {
        const el = document.createElement("div");
        applyCommand(el, c);
        host.appendChild(el);
    }
}

// Repaint `host` in place, reusing child <div>s slot-for-slot (only the per-section cache repaints the
// same host, for the one section that changed). A reused slot is reset first so a kind change can't
// inherit the old styling; a tag mismatch or shortfall makes a fresh node, and extras are dropped.
function paintReconcile(host: HTMLElement, commands: RenderCommand[]): void {
    const nodes = host.childNodes;
    for (let i = 0; i < commands.length; i++) {
        let el = nodes[i] as HTMLElement | undefined;
        if (!el || el.nodeType !== 1 || el.tagName !== "DIV") {
            const fresh = document.createElement("div");
            if (nodes[i]) host.replaceChild(fresh, nodes[i]!);
            else host.appendChild(fresh);
            el = fresh;
        } else {
            el.style.cssText = "";
            el.replaceChildren();
        }
        applyCommand(el, commands[i]!);
    }
    while (host.childNodes.length > commands.length) host.removeChild(host.lastChild!);
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
    zoom = 1,
): void {
    cx.save();
    // Clip to the (rounded) frame — always when zoomed, so a >1 zoom crops instead of bleeding out.
    if (radius || zoom !== 1) {
        roundRectPath(cx, b.x, b.y, b.w, b.h, radius ?? 0);
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
    dw *= zoom;
    dh *= zoom;
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
            if (img)
                drawImageFit(cx, img, b, c.image.fit, c.image.radius, c.image.scrim, c.image.zoom);
            const bd = c.image.border;
            if (bd) {
                roundRectPath(cx, b.x, b.y, b.w, b.h, c.image.radius ?? 0);
                cx.strokeStyle = bd.color;
                cx.lineWidth = bd.width;
                cx.setLineDash(bd.style === "dashed" ? [bd.width * 2.5, bd.width * 2] : []);
                cx.stroke();
                cx.setLineDash([]);
            }
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

// Per-host cache for the section stack. Content ops keep the object identity of sections they don't touch
// (see `ops`), so keying on (section, layoutW, theme, profile, hide-target) lets a redraw reuse the layer
// of every unchanged section and re-lay-out only the one that changed. Opt-in (only the studio canvas
// holds one); one cache per host — a cached layer is a live DOM node owned by its host.
interface SectionCacheEntry {
    section: Section;
    layoutW: number;
    theme: Tokens;
    profileId: string;
    hideKey: string;
    layer: HTMLElement;
    regions: Region[]; // section-local (offset into stage coords per draw)
    height: number;
}
export interface SectionStackCache {
    entries: Map<string, SectionCacheEntry>;
}
export function createSectionStackCache(): SectionStackCache {
    return { entries: new Map() };
}

// Paint a vertical stack of sections into `host` — deck = centered content columns with gaps, doc/web =
// seamless full-bleed bands. Each section is laid out by the engine and painted into an absolutely-
// positioned layer, and `host`'s children are replaced with the current layers. Returns the per-section
// top offsets, the hit-test regions (in stage coords), and the total height (incl. the trailing gap).
// Shared by the studio canvas, present view, and read-only preview.
export function paintSectionStack(
    host: HTMLElement,
    sections: Section[],
    profile: FormatDescriptor,
    theme: Tokens,
    opts: { fullW: number; startY?: number; hideId?: string | null; cache?: SectionStackCache },
): { tops: number[]; regions: Region[]; height: number } {
    const web = profile.id === "web";
    const gap = profile.kind === "continuous" ? 0 : SECTION_GAP; // doc/web merge seamlessly
    const contentW = Math.min(opts.fullW - 64, profile.maxContentWidth ?? 1080);
    const cache = opts.cache;
    const tops: number[] = [];
    const regions: Region[] = [];
    const layers: HTMLElement[] = [];
    const live = new Set<string>();
    let y = opts.startY ?? 0;

    for (const section of sections) {
        live.add(section.id);
        const bleed = (section.bleed ?? false) || web;
        const layoutW = bleed ? opts.fullW : contentW;
        const x = bleed ? 0 : Math.round((opts.fullW - contentW) / 2);
        // hideId (the inline-edited element's text) only affects its own section, so only that section's
        // cache key carries it — starting/ending an edit repaints one section, not the whole stack.
        const hideKey = opts.hideId?.startsWith(`el:${section.id}:`) ? opts.hideId : "";
        const prev = cache?.entries.get(section.id);
        let entry: SectionCacheEntry;
        if (
            prev &&
            prev.section === section &&
            prev.layoutW === layoutW &&
            prev.theme === theme &&
            prev.profileId === profile.id &&
            prev.hideKey === hideKey
        ) {
            entry = prev; // unchanged — reuse the laid-out, painted layer as-is
        } else {
            const res = layoutSection(section, layoutW, measureText, theme, profile);
            const commands = hideKey
                ? res.commands.filter((c) => !(c.kind === "text" && c.id === hideKey))
                : res.commands;
            const layer = prev?.layer ?? document.createElement("div");
            if (cache) paintReconcile(layer, commands);
            else paint(commands, layer);
            layer.style.position = "absolute"; // paint() forces relative; keep layers out of flow
            entry = {
                section,
                layoutW,
                theme,
                profileId: profile.id,
                hideKey,
                layer,
                regions: res.regions,
                height: res.height,
            };
            cache?.entries.set(section.id, entry);
        }
        entry.layer.style.left = `${x}px`;
        entry.layer.style.top = `${y}px`;
        entry.layer.style.width = `${layoutW}px`;
        entry.layer.style.height = `${entry.height}px`;
        layers.push(entry.layer);
        for (const r of entry.regions)
            regions.push({
                id: r.id,
                box: { x: r.box.x + x, y: r.box.y + y, w: r.box.w, h: r.box.h },
            });
        tops.push(y);
        y += entry.height + gap;
    }
    if (cache)
        for (const id of [...cache.entries.keys()]) if (!live.has(id)) cache.entries.delete(id);
    host.replaceChildren(...layers);
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
