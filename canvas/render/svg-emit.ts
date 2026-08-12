import type { DrawContext, DrawStyle, DrawTextStyle, PathSink } from "@engine/node";

// canvas center-parameterized arc → cubic path segments, ≤90° each
export function arcSegments(
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    ccw: boolean,
): string {
    let delta = a1 - a0;
    if (ccw && delta > 0) delta -= 2 * Math.PI;
    if (!ccw && delta < 0) delta += 2 * Math.PI;
    const segs = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
    const step = delta / segs;
    const k = (4 / 3) * Math.tan(step / 4);
    let a = a0;
    let d = "";
    for (let i = 0; i < segs; i++) {
        const b = a + step;
        const x0 = cx + r * Math.cos(a);
        const y0 = cy + r * Math.sin(a);
        const x1 = cx + r * Math.cos(b);
        const y1 = cy + r * Math.sin(b);
        d += `C${x0 - k * r * Math.sin(a)} ${y0 + k * r * Math.cos(a)} ${x1 + k * r * Math.sin(b)} ${y1 - k * r * Math.cos(b)} ${x1} ${y1}`;
        a = b;
    }
    return d;
}

// shared by every SVG/PDF emitter
export function buildPathData(build: (sink: PathSink) => void): string {
    let d = "";
    const sink: PathSink = {
        moveTo: (x, y) => (d += `M${x} ${y}`),
        lineTo: (x, y) => (d += `L${x} ${y}`),
        bezierCurveTo: (a, b, c, e, x, y) => (d += `C${a} ${b} ${c} ${e} ${x} ${y}`),
        quadraticCurveTo: (a, b, x, y) => (d += `Q${a} ${b} ${x} ${y}`),
        arc: (acx, acy, r, aa0, aa1, ccw) =>
            (d +=
                (d === "" ? "M" : "L") +
                `${acx + r * Math.cos(aa0)} ${acy + r * Math.sin(aa0)}` +
                arcSegments(acx, acy, r, aa0, aa1, !!ccw)),
        arcTo: (x1, y1, x2, y2) => (d += `L${x1} ${y1}L${x2} ${y2}`),
        rect: (x, y, w, h) => (d += `M${x} ${y}h${w}v${h}h${-w}Z`),
        closePath: () => (d += "Z"),
    };
    build(sink);
    return d;
}

// CSS gradient semantics (clockwise from "to top"): unit direction, and objectBoundingBox
// endpoints, shared by every backend so the editor and exports agree on a gradient's run
export const gradientDir = (angle: number | undefined): [number, number] => {
    const a = (((angle ?? 135) - 90) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
};

export function gradientUnitPoints(angle: number | undefined): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
} {
    const [dx, dy] = gradientDir(angle);
    return { x1: 0.5 - dx / 2, y1: 0.5 - dy / 2, x2: 0.5 + dx / 2, y2: 0.5 + dy / 2 };
}

const xmlEsc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function strokeAttrs(s: DrawStyle, stroked: boolean, fillOverride?: string): string {
    let a = ` fill="${stroked ? "none" : (fillOverride ?? s.fill ?? "none")}"`;
    if (!stroked && s.fillRule) a += ` fill-rule="${s.fillRule}"`;
    const stroke = s.stroke ?? (stroked ? s.fill : undefined);
    if (stroke) {
        a += ` stroke="${stroke}" stroke-width="${s.width ?? 1}"`;
        if (s.cap) a += ` stroke-linecap="${s.cap}"`;
        if (s.join) a += ` stroke-linejoin="${s.join}"`;
        if (s.dash && s.dash.length) a += ` stroke-dasharray="${s.dash.join(" ")}"`;
    }
    return a;
}

let sharedMeasure: CanvasRenderingContext2D | null | undefined;
function measure(text: string, s: DrawTextStyle): number {
    if (sharedMeasure === undefined)
        sharedMeasure =
            typeof document !== "undefined"
                ? document.createElement("canvas").getContext("2d")
                : null;
    if (!sharedMeasure) return text.length * (s.size ?? 12) * 0.5;
    sharedMeasure.font = `${s.weight ?? 400} ${s.size ?? 12}px ${s.font ?? "system-ui, sans-serif"}`;
    return sharedMeasure.measureText(text).width;
}

const anchor = (a: DrawTextStyle["align"]): string =>
    a === "start" ? "start" : a === "end" ? "end" : "middle";
const baseline = (b: DrawTextStyle["baseline"]): string =>
    b === "top"
        ? "text-before-edge"
        : b === "bottom"
          ? "text-after-edge"
          : b === "middle"
            ? "central"
            : "alphabetic";

// node-safe (used for PPTX embedding); mirrors svgDrawContext op-for-op. Gradients emit as defs;
// shadows are dropped here on purpose (PowerPoint's SVG renderer handles filters unreliably).
export function svgStringContext(w: number, h: number): { ctx: DrawContext; svg: () => string } {
    const parts: string[] = [];
    const defs: string[] = [];
    let defId = 0;
    const gradientFill = (s: DrawStyle): string | undefined => {
        const g = s.gradient;
        if (!g) return undefined;
        const id = `esg-${++defId}`;
        const p = gradientUnitPoints(g.angle);
        defs.push(
            `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}">` +
                `<stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>`,
        );
        return `url(#${id})`;
    };
    const ctx: DrawContext = {
        rect(x, y, rw, rh, s) {
            const rx = s.radius ? ` rx="${s.radius}"` : "";
            parts.push(
                `<rect x="${x}" y="${y}" width="${Math.max(0, rw)}" height="${Math.max(0, rh)}"${rx}${strokeAttrs(s, false, gradientFill(s))}/>`,
            );
        },
        line(x1, y1, x2, y2, s) {
            parts.push(
                `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${strokeAttrs(s, true)}/>`,
            );
        },
        circle(cx, cy, r, s) {
            parts.push(
                `<circle cx="${cx}" cy="${cy}" r="${Math.max(0, r)}"${strokeAttrs(s, false, gradientFill(s))}/>`,
            );
        },
        polyline(points, s) {
            const pts = points.map((p) => `${p[0]},${p[1]}`).join(" ");
            parts.push(
                `<${s.fill || s.gradient ? "polygon" : "polyline"} points="${pts}"${strokeAttrs(s, false, gradientFill(s))}/>`,
            );
        },
        wedge(cx, cy, r, a0, a1, s) {
            const d = `M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}${arcSegments(cx, cy, r, a0, a1, false)}Z`;
            parts.push(`<path d="${d}"${strokeAttrs(s, false, gradientFill(s))}/>`);
        },
        path(build, s) {
            parts.push(
                `<path d="${buildPathData(build)}"${strokeAttrs(s, false, gradientFill(s))}/>`,
            );
        },
        text(text, x, y, s) {
            parts.push(
                `<text x="${x}" y="${y}" font-size="${s.size ?? 12}" font-family="${xmlEsc(s.font ?? "system-ui, sans-serif")}" font-weight="${s.weight ?? 400}" fill="${s.fill ?? "#000"}" text-anchor="${anchor(s.align)}" dominant-baseline="${baseline(s.baseline)}">${xmlEsc(text)}</text>`,
            );
        },
        measureText: (text, s) => ({ width: measure(text, s) }),
    };
    return {
        ctx,
        svg: () =>
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${parts.join("")}</svg>`,
    };
}
