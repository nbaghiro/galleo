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

const xmlEsc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function strokeAttrs(s: DrawStyle, stroked: boolean): string {
    let a = ` fill="${stroked ? "none" : (s.fill ?? "none")}"`;
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

// node-safe (used for PPTX embedding); mirrors svgDrawContext op-for-op
export function svgStringContext(w: number, h: number): { ctx: DrawContext; svg: () => string } {
    const parts: string[] = [];
    const ctx: DrawContext = {
        rect(x, y, rw, rh, s) {
            const rx = s.radius ? ` rx="${s.radius}"` : "";
            parts.push(
                `<rect x="${x}" y="${y}" width="${Math.max(0, rw)}" height="${Math.max(0, rh)}"${rx}${strokeAttrs(s, false)}/>`,
            );
        },
        line(x1, y1, x2, y2, s) {
            parts.push(
                `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${strokeAttrs(s, true)}/>`,
            );
        },
        circle(cx, cy, r, s) {
            parts.push(
                `<circle cx="${cx}" cy="${cy}" r="${Math.max(0, r)}"${strokeAttrs(s, false)}/>`,
            );
        },
        polyline(points, s) {
            const pts = points.map((p) => `${p[0]},${p[1]}`).join(" ");
            parts.push(
                `<${s.fill ? "polygon" : "polyline"} points="${pts}"${strokeAttrs(s, false)}/>`,
            );
        },
        wedge(cx, cy, r, a0, a1, s) {
            const d = `M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}${arcSegments(cx, cy, r, a0, a1, false)}Z`;
            parts.push(`<path d="${d}"${strokeAttrs(s, false)}/>`);
        },
        path(build, s) {
            parts.push(`<path d="${buildPathData(build)}"${strokeAttrs(s, false)}/>`);
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
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`,
    };
}
