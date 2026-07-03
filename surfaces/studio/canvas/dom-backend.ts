import type { DrawContext, DrawStyle, DrawTextStyle, Run, TextLeaf } from "@engine/node";
import type { RenderCommand } from "@engine/render-command";
import { CODE_BG, MONO_FONT_STACK } from "./measure";

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
