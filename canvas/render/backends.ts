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
    layoutSection,
    SECTION_GAP,
} from "./commands";
import type { Section, SectionBackground } from "@model/artifact";
import type { Tokens } from "@themes";
import type { FormatDescriptor } from "@model/geometry";

// raster supersampling factor for crisp export
export const EXPORT_SCALE = 2;

// concatenated span text equals the plain string
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

// keep a live Image() per URL so re-paints (replaceChildren) don't cancel in-flight bg fetches
const warmed = new Map<string, HTMLImageElement>();
function warmImage(src: string): void {
    if (!src || warmed.has(src)) return;
    const im = new Image();
    im.src = src;
    warmed.set(src, im);
}

function applyCommand(el: HTMLElement, c: RenderCommand): void {
    el.style.position = "absolute";
    el.style.left = `${c.box.x}px`;
    el.style.top = `${c.box.y}px`;
    el.style.width = `${c.box.w}px`;
    el.style.height = `${c.box.h}px`;
    el.style.boxSizing = "border-box";
    if (c.opacity !== undefined) el.style.opacity = String(c.opacity);
    // clip via clip-path insets, box-relative (reused els reset to cssText:"" first)
    if (c.clip) {
        const b = c.box;
        const cl = c.clip;
        const top = Math.max(0, cl.y - b.y);
        const left = Math.max(0, cl.x - b.x);
        const right = Math.max(0, b.x + b.w - (cl.x + cl.w));
        const bottom = Math.max(0, b.y + b.h - (cl.y + cl.h));
        if (top || right || bottom || left)
            el.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    }
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
            // background-size:cover can't scale past cover, so a zoomed image becomes a real <img> we scale + crop
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

// reuse child <div>s slot-for-slot; reset each first so a kind change can't inherit old styling
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

// greedy wrap must match measure.ts so line breaks agree
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
    // clip when zoomed so a >1 zoom crops instead of bleeding out
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

// export-fidelity path (PNG/PDF): wrap identical to engine measure, per-run geometry must be exact
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
        const guarded = c.opacity !== undefined || c.clip !== undefined;
        if (guarded) cx.save();
        if (c.opacity !== undefined) cx.globalAlpha = c.opacity;
        if (c.clip) {
            cx.beginPath();
            cx.rect(c.clip.x, c.clip.y, c.clip.w, c.clip.h);
            cx.clip();
        }
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
        if (guarded) cx.restore();
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

// present mirrors this in the DOM via fitSlideContent
export async function renderSlidePage(
    page: { commands: RenderCommand[]; w: number; h: number; contentH: number },
    bg: string,
    scale: number,
): Promise<HTMLCanvasElement> {
    const { commands, w, h, contentH } = page;
    const fit = Math.min(1, h / contentH);
    const offsetX = (w - w * fit) / 2;
    const offsetY = (h - contentH * fit) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const cx = canvas.getContext("2d");
    if (cx) {
        cx.scale(scale, scale);
        cx.fillStyle = bg;
        cx.fillRect(0, 0, w, h);
        const images = await loadImages(commands);
        cx.save();
        cx.translate(offsetX, offsetY);
        cx.scale(fit, fit);
        drawCommands(cx, commands, images);
        cx.restore();
    }
    return canvas;
}

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

// cache keyed on section identity (ops preserve untouched sections) → redraw reuses unchanged layers; one cache per host
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

// single source of truth for section width (stack painter + minimap thumb must agree so text wraps identically)
export function sectionLayoutWidth(
    section: Section,
    profile: FormatDescriptor,
    fullW: number,
): number {
    const bleed = (section.bleed ?? false) || profile.id === "web";
    return bleed ? fullW : Math.min(fullW - 64, profile.maxContentWidth ?? 1080);
}

// regions in stage coords; height includes the trailing gap
export function paintSectionStack(
    host: HTMLElement,
    sections: Section[],
    profile: FormatDescriptor,
    theme: Tokens,
    opts: {
        fullW: number;
        startY?: number;
        hideId?: string | null;
        dimId?: string | null; // a section being drag-reordered — painted dimmed as a "lifted" preview
        cache?: SectionStackCache;
    },
): { tops: number[]; regions: Region[]; height: number } {
    const gap = profile.kind === "continuous" ? 0 : SECTION_GAP; // doc/web merge seamlessly
    const cache = opts.cache;
    const tops: number[] = [];
    const regions: Region[] = [];
    const layers: HTMLElement[] = [];
    const live = new Set<string>();
    let y = opts.startY ?? 0;

    for (const section of sections) {
        live.add(section.id);
        const layoutW = sectionLayoutWidth(section, profile, opts.fullW);
        const x = Math.round((opts.fullW - layoutW) / 2); // bleed → layoutW == fullW → centered at 0
        // hideKey only in the edited section's cache key → an edit repaints one section, not the stack
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
            entry = prev;
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
        entry.layer.style.opacity = opts.dimId === section.id ? "0.4" : "1"; // reset each paint (layers cache)
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

// CSS-scale from top-left so text wraps identically (thumbnails); `center` letterboxes into a fixed frame
export function scaledHostCss(
    layoutW: number,
    height: number,
    scale: number,
    center?: { frameW: number; frameH: number },
): string {
    const base = `width:${layoutW}px;height:${height}px;transform:scale(${scale});transform-origin:top left`;
    if (!center) return base;
    const left = (center.frameW - center.frameW * scale) / 2;
    const top = (center.frameH - height * scale) / 2;
    return `position:absolute;${base};left:${left}px;top:${top}px`;
}
