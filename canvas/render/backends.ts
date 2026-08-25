import type {
    DrawContext,
    DrawStyle,
    DrawTextStyle,
    PathSink,
    Run,
    TextLeaf,
    RenderCommand,
    Rect,
    Region,
} from "@engine/node";
import { arcSegments, buildPathData, gradientDir, gradientUnitPoints } from "./svg-emit";
import {
    CODE_BG,
    MONO_FONT_STACK,
    layoutRuns,
    measureText,
    layoutSection,
    layoutSlide,
    SECTION_GAP,
} from "./commands";
import type { Section, SectionBackground } from "@model/artifact";
import { sectionLinkId } from "@model/artifact";
import type { Tokens } from "@themes";
import { hexA } from "@themes";
import type { FormatDescriptor } from "@model/geometry";
import { pagedSize, sectionFrame } from "@engine/profile";
import { toneGround } from "@elements/compose";

// raster supersampling factor for crisp export
export const EXPORT_SCALE = 2;

// concatenated span text equals the plain string
function appendRuns(el: HTMLElement, runs: Run[]): void {
    for (const run of runs) {
        const span: HTMLElement = document.createElement(run.link ? "a" : "span");
        if (run.link) {
            span.setAttribute("href", run.link);
            if (!sectionLinkId(run.link)) {
                span.setAttribute("target", "_blank");
                span.setAttribute("rel", "noopener noreferrer");
            }
            span.style.color = "inherit"; // the theme's ink, not the UA's link blue
        }
        span.textContent = run.text;
        if (run.bold) span.style.fontWeight = "700";
        if (run.italic) span.style.fontStyle = "italic";
        const deco = [
            run.underline || run.link ? "underline" : "",
            run.strike ? "line-through" : "",
        ]
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
    // reused elements keep their attributes, so an absent level must clear the previous one
    if (t.level) {
        el.setAttribute("role", "heading");
        el.setAttribute("aria-level", String(t.level));
    } else {
        el.removeAttribute("role");
        el.removeAttribute("aria-level");
    }
    el.style.font = `${t.weight ?? 400} ${t.size}px ${t.fontId}`;
    el.style.lineHeight = `${t.lineHeight ?? t.size * 1.35}px`;
    el.style.color = t.color ?? "#1a1a1a";
    el.style.textAlign = t.align ?? "start";
    el.style.whiteSpace = t.wrap === "none" ? "pre" : "pre-wrap"; // honor \n hard breaks
    el.style.overflow = "hidden";
    if (t.runs && t.runs.length > 0) appendRuns(el, t.runs);
    else el.textContent = t.text;
}

// conservative bbox of a path build: every coordinate the sink sees, control points included
function pathBounds(build: (sink: PathSink) => void): Rect {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const pt = (x: number, y: number): void => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };
    const sink: PathSink = {
        moveTo: pt,
        lineTo: pt,
        bezierCurveTo: (a, b, c, d, x, y) => {
            pt(a, b);
            pt(c, d);
            pt(x, y);
        },
        quadraticCurveTo: (a, b, x, y) => {
            pt(a, b);
            pt(x, y);
        },
        arc: (cx, cy, r) => {
            pt(cx - r, cy - r);
            pt(cx + r, cy + r);
        },
        arcTo: (x1, y1, x2, y2) => {
            pt(x1, y1);
            pt(x2, y2);
        },
        rect: (x, y, w, h) => {
            pt(x, y);
            pt(x + w, y + h);
        },
        closePath: () => {},
    };
    build(sink);
    if (minX > maxX) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// one linear-gradient builder for both fill shapes (FillLeaf and DrawStyle share the same object),
// on the CSS angle semantics the DOM backend paints — so editor and canvas exports agree
function canvasGradient(
    cx: CanvasRenderingContext2D,
    g: { from: string; to: string; angle?: number },
    b: Rect,
): CanvasGradient {
    const [dx, dy] = gradientDir(g.angle);
    const half = (Math.abs(dx) * b.w + Math.abs(dy) * b.h) / 2;
    const cxn = b.x + b.w / 2;
    const cyn = b.y + b.h / 2;
    const grad = cx.createLinearGradient(
        cxn - dx * half,
        cyn - dy * half,
        cxn + dx * half,
        cyn + dy * half,
    );
    grad.addColorStop(0, g.from);
    grad.addColorStop(1, g.to);
    return grad;
}

export function canvasDrawContext(cx: CanvasRenderingContext2D): DrawContext {
    const apply = (s: DrawStyle, bounds?: Rect): void => {
        if (s.gradient && bounds) cx.fillStyle = canvasGradient(cx, s.gradient, bounds);
        else if (s.fill) cx.fillStyle = s.fill;
        if (s.stroke) cx.strokeStyle = s.stroke;
        cx.lineWidth = s.width ?? 1;
        cx.lineCap = s.cap ?? "butt";
        cx.lineJoin = s.join ?? "miter";
        cx.setLineDash(s.dash ?? []);
    };
    const finish = (s: DrawStyle): void => {
        const filled = s.fill || s.gradient;
        if (filled && s.shadow) {
            cx.save();
            cx.shadowColor = s.shadow.color;
            cx.shadowBlur = s.shadow.blur;
            cx.shadowOffsetY = s.shadow.dy;
            cx.fill(s.fillRule ?? "nonzero");
            cx.restore();
        } else if (filled) {
            cx.fill(s.fillRule ?? "nonzero");
        }
        if (s.stroke) cx.stroke();
    };
    return {
        rect(x, y, w, h, s) {
            apply(s, { x, y, w, h });
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
            apply(s, { x: cxx - r, y: cyy - r, w: r * 2, h: r * 2 });
            cx.beginPath();
            cx.arc(cxx, cyy, r, 0, Math.PI * 2);
            finish(s);
        },
        polyline(points, s) {
            let bounds: Rect | undefined;
            if (s.gradient && points.length) {
                const xs = points.map((p) => p[0]);
                const ys = points.map((p) => p[1]);
                const x = Math.min(...xs);
                const y = Math.min(...ys);
                bounds = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
            }
            apply(s, bounds);
            cx.beginPath();
            points.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])));
            finish(s);
        },
        wedge(cxx, cyy, r, a0, a1, s) {
            apply(s, { x: cxx - r, y: cyy - r, w: r * 2, h: r * 2 });
            cx.beginPath();
            cx.moveTo(cxx, cyy);
            cx.arc(cxx, cyy, r, a0, a1);
            cx.closePath();
            finish(s);
        },
        path(build, s) {
            apply(s, s.gradient ? pathBounds(build) : undefined);
            cx.beginPath();
            build(cx); // the 2D context is itself a PathSink
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

const SVG_NS = "http://www.w3.org/2000/svg";

// shared 2D context for advance-width measurement inside an SVG surface (no DOM text metrics on <text>)
let measureCanvas: CanvasRenderingContext2D | null | undefined;
function measureCx(): CanvasRenderingContext2D | null {
    if (measureCanvas === undefined)
        measureCanvas = document.createElement("canvas").getContext("2d");
    return measureCanvas;
}

// ids are document-global for url(#...) even across inline <svg>s, so a module counter keeps them unique
let svgDefId = 0;

// Same contract as canvasDrawContext, so surfaces render as crisp vector on the DOM backend.
export function svgDrawContext(svg: SVGSVGElement): DrawContext {
    const make = (tag: string): SVGElement => document.createElementNS(SVG_NS, tag);
    let defs: SVGElement | null = null;
    // identical styles reuse one def (a card diagram shadows every node the same way)
    const seen = new Map<string, string>();
    const def = (el: SVGElement): void => {
        if (!defs) {
            defs = make("defs");
            svg.insertBefore(defs, svg.firstChild);
        }
        defs.appendChild(el);
    };
    const gradientRef = (g: NonNullable<DrawStyle["gradient"]>): string => {
        const key = `g:${g.from}:${g.to}:${g.angle ?? ""}`;
        const hit = seen.get(key);
        if (hit) return hit;
        const id = `dsg-${++svgDefId}`;
        seen.set(key, `url(#${id})`);
        const el = make("linearGradient");
        el.setAttribute("id", id);
        el.setAttribute("gradientUnits", "objectBoundingBox");
        const p = gradientUnitPoints(g.angle);
        el.setAttribute("x1", String(p.x1));
        el.setAttribute("y1", String(p.y1));
        el.setAttribute("x2", String(p.x2));
        el.setAttribute("y2", String(p.y2));
        const s0 = make("stop");
        s0.setAttribute("offset", "0");
        s0.setAttribute("stop-color", g.from);
        const s1 = make("stop");
        s1.setAttribute("offset", "1");
        s1.setAttribute("stop-color", g.to);
        el.appendChild(s0);
        el.appendChild(s1);
        def(el);
        return `url(#${id})`;
    };
    const shadowRef = (sh: NonNullable<DrawStyle["shadow"]>): string => {
        const key = `s:${sh.blur}:${sh.dy}:${sh.color}`;
        const hit = seen.get(key);
        if (hit) return hit;
        const id = `dsf-${++svgDefId}`;
        seen.set(key, `url(#${id})`);
        const f = make("filter");
        f.setAttribute("id", id);
        // widen the filter region so the blur is not clipped at the shape's own bounds
        f.setAttribute("x", "-40%");
        f.setAttribute("y", "-40%");
        f.setAttribute("width", "180%");
        f.setAttribute("height", "180%");
        const d = make("feDropShadow");
        d.setAttribute("dx", "0");
        d.setAttribute("dy", String(sh.dy));
        d.setAttribute("stdDeviation", String(sh.blur / 2));
        d.setAttribute("flood-color", sh.color);
        f.appendChild(d);
        def(f);
        return `url(#${id})`;
    };
    const stylize = (el: SVGElement, s: DrawStyle, stroked = false): void => {
        const fill = !stroked && s.gradient ? gradientRef(s.gradient) : (s.fill ?? "none");
        el.setAttribute("fill", stroked ? "none" : fill);
        if (!stroked && s.fillRule) el.setAttribute("fill-rule", s.fillRule);
        if (!stroked && (s.fill || s.gradient) && s.shadow)
            el.setAttribute("filter", shadowRef(s.shadow));
        const stroke = s.stroke ?? (stroked ? s.fill : undefined);
        if (stroke) {
            el.setAttribute("stroke", stroke);
            el.setAttribute("stroke-width", String(s.width ?? 1));
            if (s.cap) el.setAttribute("stroke-linecap", s.cap);
            if (s.join) el.setAttribute("stroke-linejoin", s.join);
            if (s.dash && s.dash.length) el.setAttribute("stroke-dasharray", s.dash.join(" "));
        }
        svg.appendChild(el);
    };
    return {
        rect(x, y, w, h, s) {
            const el = make("rect");
            el.setAttribute("x", String(x));
            el.setAttribute("y", String(y));
            el.setAttribute("width", String(Math.max(0, w)));
            el.setAttribute("height", String(Math.max(0, h)));
            if (s.radius) el.setAttribute("rx", String(s.radius));
            stylize(el, s);
        },
        line(x1, y1, x2, y2, s) {
            const el = make("line");
            el.setAttribute("x1", String(x1));
            el.setAttribute("y1", String(y1));
            el.setAttribute("x2", String(x2));
            el.setAttribute("y2", String(y2));
            stylize(el, s, true);
        },
        circle(cx, cy, r, s) {
            const el = make("circle");
            el.setAttribute("cx", String(cx));
            el.setAttribute("cy", String(cy));
            el.setAttribute("r", String(Math.max(0, r)));
            stylize(el, s);
        },
        polyline(points, s) {
            const el = make(s.fill ? "polygon" : "polyline");
            el.setAttribute("points", points.map((p) => `${p[0]},${p[1]}`).join(" "));
            stylize(el, s);
        },
        wedge(cx, cy, r, a0, a1, s) {
            const el = make("path");
            el.setAttribute(
                "d",
                `M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}${arcSegments(cx, cy, r, a0, a1, false)}Z`,
            );
            stylize(el, s);
        },
        path(build, s) {
            const el = make("path");
            el.setAttribute("d", buildPathData(build));
            stylize(el, s);
        },
        text(text, x, y, s: DrawTextStyle) {
            const el = make("text");
            el.setAttribute("x", String(x));
            el.setAttribute("y", String(y));
            el.setAttribute("font-size", String(s.size ?? 12));
            el.setAttribute("font-family", s.font ?? "system-ui, sans-serif");
            el.setAttribute("font-weight", String(s.weight ?? 400));
            el.setAttribute("fill", s.fill ?? "#000");
            el.setAttribute(
                "text-anchor",
                s.align === "start" ? "start" : s.align === "end" ? "end" : "middle",
            );
            el.setAttribute(
                "dominant-baseline",
                s.baseline === "top"
                    ? "text-before-edge"
                    : s.baseline === "bottom"
                      ? "text-after-edge"
                      : s.baseline === "middle"
                        ? "central"
                        : "alphabetic",
            );
            el.textContent = text;
            svg.appendChild(el);
        },
        measureText(text, s: DrawTextStyle) {
            const mx = measureCx();
            if (!mx) return { width: text.length * 8 };
            mx.font = `${s.weight ?? 400} ${s.size ?? 12}px ${s.font ?? "system-ui, sans-serif"}`;
            return { width: mx.measureText(text).width };
        },
    };
}

// Keeps in-flight bg fetches alive across re-paints; LRU-bounded so nothing pins for the session.
const WARM_MAX = 60;
const warmed = new Map<string, HTMLImageElement>();
function warmImage(src: string): void {
    if (!src) return;
    const existing = warmed.get(src);
    if (existing) {
        warmed.delete(src); // re-insert to mark it most-recently used
        warmed.set(src, existing);
        return;
    }
    const im = new Image();
    im.src = src;
    warmed.set(src, im);
    while (warmed.size > WARM_MAX) {
        const oldest = warmed.keys().next().value;
        if (oldest === undefined) break;
        warmed.delete(oldest);
    }
}

// An anchor earns a place in the a11y tree only when it has a name: the text under a linked button
// is that name, the button's own fill is decoration wrapped in the same href so the click lands.
function named(c: RenderCommand): boolean {
    return c.kind === "text" || (c.kind === "image" && !!c.image.alt);
}

function applyLink(el: HTMLElement, c: RenderCommand): void {
    const href = c.link;
    if (!href) return;
    el.setAttribute("href", href);
    // an internal `#section` link stays in the page, so it gets neither a new tab nor its rel guard;
    // the playback surfaces intercept it and scroll, the editor jumps
    if (sectionLinkId(href)) {
        el.removeAttribute("target");
        el.removeAttribute("rel");
    } else {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
    }
    el.style.textDecoration = "none"; // the UA underline would repaint every linked box
    el.draggable = false;
    if (named(c)) {
        // a reused anchor may have been the decorative half of the previous paint
        el.removeAttribute("aria-hidden");
        el.removeAttribute("tabindex");
        return;
    }
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("tabindex", "-1");
}

// commands paint as flat siblings, so a linked one is its own anchor rather than a wrapper
const tagFor = (c: RenderCommand): string => (c.link ? "a" : "div");

function applyCommand(el: HTMLElement, c: RenderCommand): void {
    applyLink(el, c);
    // Decoration paints but is not read: it sits behind the flow and says nothing the text does not.
    // A reused node may have been either, so the non-decor case clears what applyLink didn't own.
    if (c.decor) el.setAttribute("aria-hidden", "true");
    else if (!c.link) el.removeAttribute("aria-hidden");
    el.style.position = "absolute";
    el.style.left = `${c.box.x}px`;
    el.style.top = `${c.box.y}px`;
    el.style.width = `${c.box.w}px`;
    el.style.height = `${c.box.h}px`;
    el.style.boxSizing = "border-box";
    if (c.opacity !== undefined) el.style.opacity = String(c.opacity);
    // box-relative clip-path insets; reused els have cssText reset first
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
        // reused elements keep their attributes; the zoomed path names itself with a real <img alt>
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
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
            img.alt = im.alt ?? "";
            img.draggable = false;
            img.decoding = "async"; // don't block the stack's paint on one decode
            img.style.cssText = `width:100%;height:100%;object-fit:${im.fit};object-position:center;transform:scale(${im.zoom});display:block`;
            el.appendChild(img);
        } else {
            warmImage(im.src);
            if (im.alt) {
                el.setAttribute("role", "img");
                el.setAttribute("aria-label", im.alt);
            }
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
        // surfaces paint as vector SVG on the DOM backend
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("viewBox", `0 0 ${Math.max(1, c.box.w)} ${Math.max(1, c.box.h)}`);
        svg.style.display = "block";
        c.paint(svgDrawContext(svg), { x: 0, y: 0, w: c.box.w, h: c.box.h });
        el.appendChild(svg);
    }
}

// Returns the nodes it created, index-parallel to `commands`, for chrome that has to address one.
export function paint(commands: RenderCommand[], host: HTMLElement): HTMLElement[] {
    host.replaceChildren();
    host.style.position = "relative";
    const nodes: HTMLElement[] = [];
    for (const c of commands) {
        const el = document.createElement(tagFor(c));
        applyCommand(el, c);
        host.appendChild(el);
        nodes.push(el);
    }
    return nodes;
}

// reset each reused node first so a kind change can't inherit old styling; a tag change (div ↔ a)
// can only be resolved by replacing it
function paintReconcile(host: HTMLElement, commands: RenderCommand[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    const nodes = host.childNodes;
    for (let i = 0; i < commands.length; i++) {
        const tag = tagFor(commands[i]!);
        let el = nodes[i] as HTMLElement | undefined;
        if (!el || el.nodeType !== 1 || el.tagName !== tag.toUpperCase()) {
            const fresh = document.createElement(tag);
            if (nodes[i]) host.replaceChild(fresh, nodes[i]!);
            else host.appendChild(fresh);
            el = fresh;
        } else {
            el.style.cssText = "";
            el.replaceChildren();
        }
        applyCommand(el, commands[i]!);
        out.push(el);
    }
    while (host.childNodes.length > commands.length) host.removeChild(host.lastChild!);
    return out;
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
                cx.fillStyle = canvasGradient(cx, f.gradient, b);
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

export async function loadImages(
    commands: RenderCommand[],
): Promise<Map<string, HTMLImageElement>> {
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
                    // a stalled connection fires neither handler — time out so exports can't wedge
                    const timer = setTimeout(resolve, 15_000);
                    const settle = (): void => {
                        clearTimeout(timer);
                        resolve();
                    };
                    const im = new Image();
                    im.crossOrigin = "anonymous";
                    im.onload = () => {
                        map.set(src, im);
                        settle();
                    };
                    im.onerror = settle;
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
    if (bg.kind === "tone") return toneGround(bg.tone ?? "tint", tokens);
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

// Keyed on section identity; layout is always cached, the DOM layer only near the view.
interface SectionCacheEntry {
    section: Section;
    layoutW: number;
    theme: Tokens;
    profileKey: string;
    hideKey: string;
    fitKey: string; // the frozen autofit scale, so lifting the freeze is a miss
    commands: RenderCommand[];
    ghost: boolean; // a stand-in, so resolving the real content is always a cache miss
    layer: HTMLElement | null;
    nodes: HTMLElement[]; // index-parallel to `commands`, empty until the layer is painted
    regions: Region[]; // section-local (offset into stage coords per draw)
    height: number;
    fitScale: number;
}
export interface SectionStackCache {
    entries: Map<string, SectionCacheEntry>;
}

/** One materialized section, for chrome that has to address a painted section or its elements. */
export interface SectionLayer {
    id: string;
    section: Section;
    el: HTMLElement;
    commands: RenderCommand[];
    nodes: HTMLElement[];
}

export function createSectionStackCache(): SectionStackCache {
    return { entries: new Map() };
}

// a custom page size changes paged geometry without changing the id, so the id alone can't key it
function profileCacheKey(profile: FormatDescriptor): string {
    if (profile.kind !== "paged") return profile.id;
    const { w, h } = pagedSize(profile);
    return `${profile.id}:${w}x${h}`;
}

// section-local → stage coords; a sub-element shape (a chart wedge) travels with its box
export function offsetRegion(r: Region, dx: number, dy: number): Region {
    const box = { x: r.box.x + dx, y: r.box.y + dy, w: r.box.w, h: r.box.h };
    if (!r.shape) return { ...r, box };
    const points = r.shape.points.map(([px, py]): [number, number] => [px + dx, py + dy]);
    return { ...r, box, shape: { kind: "poly", points } };
}

// Retention beyond the paint window, so a small scroll oscillation doesn't thrash DOM.
const KEEP_MARGIN = 400;

// A pinned layer stays in flow to stick, so it needs a z of its own to ride over the absolutely
// positioned sections around it. Anything a surface floats over the stack (the live overlay) must
// be stacked above this, or a press on it lands on the painted layer instead.
export const PINNED_Z = 1;

export interface StackWindow {
    top: number;
    bottom: number;
}

const intersects = (top: number, height: number, w: StackWindow): boolean =>
    top < w.bottom && top + height > w.top;

// The paged frame's height at the editor's own layout width. A deck reflows narrower in the editor
// than in Present (maxContentWidth vs width), so slide framing forces the shape, not the pixels.
export function sectionFrameHeight(
    section: Section,
    profile: FormatDescriptor,
    layoutW: number,
): number {
    const fr = sectionFrame(section, profile);
    return Math.round((layoutW * fr.h) / fr.w);
}

// Where a slide-framed section spills past its frame, so the author sees what Present will break.
const overflowMark = (layoutW: number, frameH: number, theme: Tokens): RenderCommand => ({
    kind: "rect",
    box: { x: 0, y: frameH, w: layoutW, h: 1 },
    fill: { color: hexA(theme.accent, 0.5) },
});

// stack painter + minimap thumb must agree here so text wraps identically
export function sectionLayoutWidth(
    section: Section,
    profile: FormatDescriptor,
    fullW: number,
): number {
    const bleed = (section.bleed ?? false) || profile.bleedSections === true;
    return bleed
        ? fullW
        : Math.min(fullW - (profile.stackInset ?? 64), profile.maxContentWidth ?? 1080);
}

/** Windowed: off-screen sections still lay out (tops/height exact) but build no DOM or regions. */
export function paintSectionStack(
    host: HTMLElement,
    sections: Section[],
    profile: FormatDescriptor,
    theme: Tokens,
    opts: {
        fullW: number;
        startY?: number;
        hideId?: string | null;
        dimId?: string | null; // the drag-reordered section, painted dimmed
        cache?: SectionStackCache;
        window?: StackWindow;
        // paged only: give every section its frame's shape (a deck authored as slides) instead of
        // its natural height. Short content centres in the frame; taller content keeps growing.
        slideFrame?: boolean;
        // playback only: honor `Section.pinned`. The editor renders a pinned section in place, so
        // its geometry stays the one the author is arranging.
        pinned?: boolean;
        // slide framing only: hold one section's autofit scale steady rather than re-solving it.
        // The section carrying an open inline edit, so type cannot resize under the caret between
        // keystrokes; the editor re-solves on commit by dropping the freeze.
        freezeFit?: { id: string; scale: number } | null;
        // stand-in for a section whose content hasn't loaded yet
        placeholder?: (
            section: Section,
            layoutW: number,
        ) => { commands: RenderCommand[]; height: number } | undefined;
    },
): {
    tops: number[];
    heights: number[];
    fitScales: number[];
    regions: Region[];
    height: number;
    painted: number;
    layers: SectionLayer[];
} {
    const gap = profile.kind === "continuous" ? 0 : SECTION_GAP; // doc/web merge seamlessly
    const slide = !!opts.slideFrame && profile.kind === "paged";
    // paged has no scroll to stick against, so it ignores pinning the way PNG ignores a link
    const honorPin = !!opts.pinned && profile.kind === "continuous";
    // folded into the profile key so toggling the mode invalidates every cached layer
    const profileKey = profileCacheKey(profile) + (slide ? ":slide" : "");
    const cache = opts.cache;
    const win = opts.window;
    const tops: number[] = [];
    const heights: number[] = [];
    const fitScales: number[] = [];
    const regions: Region[] = [];
    const layers: HTMLElement[] = [];
    const painted: SectionLayer[] = [];
    const live = new Set<string>();
    let y = opts.startY ?? 0;
    // Pinned layers are the only ones left in normal flow, so the flow cursor counts just them and a
    // top margin walks each one down to its own slot; the absolute layers around it displace nothing.
    let flowY = opts.startY ?? 0;

    for (const section of sections) {
        live.add(section.id);
        const pin = honorPin && !!section.pinned;
        const layoutW = sectionLayoutWidth(section, profile, opts.fullW);
        const x = Math.round((opts.fullW - layoutW) / 2); // bleed → layoutW == fullW → centered at 0
        // hideKey only in the edited section's cache key → an edit repaints one section, not the stack
        const hideKey = opts.hideId?.startsWith(`el:${section.id}:`) ? opts.hideId : "";
        const freeze =
            slide && opts.freezeFit?.id === section.id ? opts.freezeFit.scale : undefined;
        const fitKey = freeze === undefined ? "" : `${freeze}`;
        const prev = cache?.entries.get(section.id);
        const ghost = opts.placeholder?.(section, layoutW);
        const reuse =
            prev &&
            prev.ghost === !!ghost &&
            prev.section === section &&
            prev.layoutW === layoutW &&
            prev.theme === theme &&
            prev.profileKey === profileKey &&
            prev.hideKey === hideKey &&
            prev.fitKey === fitKey;

        let entry: SectionCacheEntry;
        if (reuse) {
            entry = prev;
        } else if (ghost) {
            entry = {
                section,
                layoutW,
                theme,
                profileKey,
                hideKey,
                fitKey,
                commands: ghost.commands,
                ghost: true,
                layer: prev?.layer ?? null,
                nodes: [],
                regions: [], // a stand-in isn't selectable
                height: ghost.height,
                fitScale: 1,
            };
            cache?.entries.set(section.id, entry);
        } else {
            const frameH = slide ? sectionFrameHeight(section, profile, layoutW) : 0;
            const res = slide
                ? layoutSlide(section, layoutW, frameH, measureText, theme, profile, false, freeze)
                : { ...layoutSection(section, layoutW, measureText, theme, profile), fitScale: 1 };
            let commands = hideKey
                ? res.commands.filter((c) => !(c.kind === "text" && c.id === hideKey))
                : res.commands;
            // autofit reaches the frame where it can, so the hairline is left for what it cannot
            if (slide && res.height > frameH)
                commands = [...commands, overflowMark(layoutW, frameH, theme)];
            entry = {
                section,
                layoutW,
                theme,
                profileKey,
                hideKey,
                fitKey,
                commands,
                ghost: false,
                layer: prev?.layer ?? null,
                nodes: [],
                regions: res.regions,
                height: res.height,
                fitScale: res.fitScale,
            };
            cache?.entries.set(section.id, entry);
        }

        // a stuck nav bar must exist however far past its own slot the reader has scrolled
        const inWindow = !win || pin || intersects(y, entry.height, win);
        if (inWindow && entry.commands.length) {
            if (!entry.layer) {
                entry.layer = document.createElement("div");
                entry.nodes = paint(entry.commands, entry.layer);
            } else if (!reuse) {
                entry.nodes = cache
                    ? paintReconcile(entry.layer, entry.commands)
                    : paint(entry.commands, entry.layer);
            }
            const layer = entry.layer;
            // paint() forces relative; keep layers out of flow. A pinned one is the exception: it
            // sticks, which needs flow, and rides above its siblings once it does.
            layer.style.position = pin ? "sticky" : "absolute";
            layer.style.left = pin ? "" : `${x}px`;
            layer.style.top = pin ? "0px" : `${y}px`;
            layer.style.marginLeft = pin ? `${x}px` : "";
            layer.style.marginTop = pin ? `${Math.max(0, y - flowY)}px` : "";
            layer.style.zIndex = pin ? `${PINNED_Z}` : "";
            layer.style.width = `${layoutW}px`;
            layer.style.height = `${entry.height}px`;
            layer.style.opacity = opts.dimId === section.id ? "0.4" : "1"; // reset each paint (layers cache)
            if (pin) flowY = y + entry.height;
            layers.push(layer);
            painted.push({
                id: section.id,
                section,
                el: layer,
                commands: entry.commands,
                nodes: entry.nodes,
            });
            for (const r of entry.regions) regions.push(offsetRegion(r, x, y));
        } else if (win && !pin && entry.layer && !intersects(y, entry.height, keep(win))) {
            entry.layer = null; // out of retention range: drop the DOM, keep the layout
        }
        tops.push(y);
        heights.push(entry.height);
        fitScales.push(entry.fitScale);
        y += entry.height + gap;
    }
    if (cache)
        for (const id of [...cache.entries.keys()]) if (!live.has(id)) cache.entries.delete(id);
    host.replaceChildren(...layers);
    return {
        tops,
        heights,
        fitScales,
        regions,
        height: y,
        painted: layers.length,
        layers: painted,
    };
}

const keep = (w: StackWindow): StackWindow => ({
    top: w.top - KEEP_MARGIN,
    bottom: w.bottom + KEEP_MARGIN,
});

export function fitSlideContent(
    commands: RenderCommand[],
    contentH: number,
    slideW: number,
    slideH: number,
): { el: HTMLDivElement; nodes: HTMLElement[] } {
    const fit = Math.min(1, slideH / contentH);
    const content = document.createElement("div");
    content.style.cssText = `position:absolute;width:${slideW}px;height:${contentH}px;transform:scale(${fit});transform-origin:top left;left:${(slideW - slideW * fit) / 2}px;top:${(slideH - contentH * fit) / 2}px`;
    return { el: content, nodes: paint(commands, content) };
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
