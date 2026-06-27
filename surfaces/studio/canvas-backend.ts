import type { RenderCommand } from "@engine/render-command";
import type { Section } from "@model/content";
import type { Tokens } from "@themes/theme";
import { canvasDrawContext } from "./dom-backend";
import { measureText } from "./measure";
import { layoutSection } from "./render";

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

function roundRectPath(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    cx.beginPath();
    cx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

function drawImageFit(cx: CanvasRenderingContext2D, img: HTMLImageElement, b: { x: number; y: number; w: number; h: number }, fit: string, radius?: number, scrim?: number): void {
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

export function drawCommands(cx: CanvasRenderingContext2D, commands: RenderCommand[], images: Map<string, HTMLImageElement>): void {
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
                const grad = cx.createLinearGradient(cxn - Math.cos(a) * hx, cyn - Math.sin(a) * hx, cxn + Math.cos(a) * hx, cyn + Math.sin(a) * hx);
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
                cx.setLineDash(f.border.style === "dashed" ? [f.border.width * 2.5, f.border.width * 2] : []);
                cx.stroke();
                cx.setLineDash([]);
            }
        } else if (c.kind === "image") {
            const img = images.get(c.image.src);
            if (img) drawImageFit(cx, img, b, c.image.fit, c.image.radius, c.image.scrim);
        } else if (c.kind === "text") {
            const t = c.text;
            cx.font = `${t.weight ?? 400} ${t.size}px ${t.fontId}`;
            cx.fillStyle = t.color ?? "#1a1a1a";
            cx.textBaseline = "middle";
            cx.textAlign = t.align === "center" ? "center" : t.align === "end" ? "right" : "left";
            const x = t.align === "center" ? b.x + b.w / 2 : t.align === "end" ? b.x + b.w : b.x;
            const lh = t.lineHeight ?? t.size * 1.35;
            const lines = t.wrap === "none" ? [t.text] : wrapLines(cx, t.text, b.w);
            lines.forEach((line, i) => cx.fillText(line, x, b.y + i * lh + lh / 2));
        } else {
            cx.save();
            cx.translate(b.x, b.y);
            c.paint(canvasDrawContext(cx), { x: 0, y: 0, w: b.w, h: b.h });
            cx.restore();
        }
    }
}

export async function loadImages(commands: RenderCommand[]): Promise<Map<string, HTMLImageElement>> {
    const srcs = [...new Set(commands.filter((c): c is Extract<RenderCommand, { kind: "image" }> => c.kind === "image").map((c) => c.image.src))];
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

export interface SlideRender {
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
export async function renderSlide(section: Section, tk: Tokens, opts: { w: number; h: number; contentW: number; scale: number }): Promise<SlideRender> {
    const { w, h, contentW, scale } = opts;
    const bleed = section.bleed ?? false;
    const layoutW = bleed ? w : contentW;
    const { commands, height } = layoutSection(section, layoutW, measureText, tk);
    const fit = Math.min(1, h / height);
    const offsetX = (w - layoutW * fit) / 2;
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
    return { canvas, commands, layoutW, height, fit, offsetX, offsetY };
}
