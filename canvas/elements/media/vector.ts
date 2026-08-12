import type { ControlField, ElementSpec } from "@elements/spec";
import type { DrawContext, DrawStyle, PathSink, Rect } from "@engine/node";
import type { Size } from "@model/geometry";
import type { Paint, ThemeRole, Vector, VNode, VStyle, VTransform } from "@model/elements";
import type { Tokens } from "@themes";
import { register } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { hexA } from "@themes";

// Iconify glyph: parseSvg lifts `body` into a Vector at paint time.
export interface IconGlyph {
    id: string;
    body: string;
    vb: string;
}

// affine (2×3): apply(x,y) = [a·x + c·y + e, b·x + d·y + f]
type Affine = [number, number, number, number, number, number]; // a b c d e f
const IDENT: Affine = [1, 0, 0, 1, 0, 0];

// A ∘ B: B applied first.
function mul(a: Affine, b: Affine): Affine {
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ];
}
const at = (m: Affine, x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
];
const meanScale = (m: Affine): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const axisAligned = (m: Affine): boolean => Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6;

function transformAffine(tf: VTransform): Affine {
    let m: Affine = tf.matrix ? [...tf.matrix] : IDENT;
    if (tf.scale) m = mul([tf.scale[0], 0, 0, tf.scale[1], 0, 0], m);
    if (tf.rotate) {
        const r = (tf.rotate * Math.PI) / 180;
        m = mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], m);
    }
    if (tf.translate) m = mul([1, 0, 0, 1, tf.translate[0], tf.translate[1]], m);
    return m;
}

type Pt = [number, number];
type Map2 = (x: number, y: number) => Pt;

// SVG elliptical arc → cubic beziers (endpoint parameterization); each segment ≤ 90°.
function arcToCubics(
    x0: number,
    y0: number,
    rx: number,
    ry: number,
    rot: number,
    large: number,
    sweep: number,
    x: number,
    y: number,
): number[][] {
    if (rx === 0 || ry === 0) return [[x0, y0, x, y, x, y]];
    const phi = (rot * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (x0 - x) / 2;
    const dy = (y0 - y) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    let arx = Math.abs(rx);
    let ary = Math.abs(ry);
    const lambda = (x1 * x1) / (arx * arx) + (y1 * y1) / (ary * ary);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        arx *= s;
        ary *= s;
    }
    const sign = large === sweep ? -1 : 1;
    const num = arx * arx * ary * ary - arx * arx * y1 * y1 - ary * ary * x1 * x1;
    const den = arx * arx * y1 * y1 + ary * ary * x1 * x1;
    const co = sign * Math.sqrt(Math.max(0, num / den));
    const cxp = (co * (arx * y1)) / ary;
    const cyp = (co * -(ary * x1)) / arx;
    const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
    const cy = sin * cxp + cos * cyp + (y0 + y) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number): number => {
        const dot = ux * vx + uy * vy;
        const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
        if (ux * vy - uy * vx < 0) a = -a;
        return a;
    };
    const theta = ang(1, 0, (x1 - cxp) / arx, (y1 - cyp) / ary);
    let delta = ang((x1 - cxp) / arx, (y1 - cyp) / ary, (-x1 - cxp) / arx, (-y1 - cyp) / ary);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    if (sweep && delta < 0) delta += 2 * Math.PI;
    const segs = Math.ceil(Math.abs(delta) / (Math.PI / 2));
    const out: number[][] = [];
    const dt = delta / segs;
    const t = (4 / 3) * Math.tan(dt / 4);
    let a0 = theta;
    let px = x0;
    let py = y0;
    for (let i = 0; i < segs; i++) {
        const a1 = a0 + dt;
        const cosA1 = Math.cos(a1);
        const sinA1 = Math.sin(a1);
        const ex = cos * arx * cosA1 - sin * ary * sinA1 + cx;
        const ey = sin * arx * cosA1 + cos * ary * sinA1 + cy;
        const d0x = -arx * Math.cos(a0);
        const d0y = -ary * Math.sin(a0);
        const d1x = arx * cosA1;
        const d1y = ary * sinA1;
        const c1x = px + t * (cos * d0x - sin * d0y);
        const c1y = py + t * (sin * d0x + cos * d0y);
        const c2x = ex + t * (cos * d1x - sin * d1y);
        const c2y = ey + t * (sin * d1x + cos * d1y);
        out.push([c1x, c1y, c2x, c2y, ex, ey]);
        a0 = a1;
        px = ex;
        py = ey;
    }
    return out;
}

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function emitPath(d: string, sink: PathSink, map: Map2): void {
    const cmds = d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? [];
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let px = 0; // last control reflection point
    let py = 0;
    let prev = "";
    const moveTo = (x: number, y: number): void => sink.moveTo(...map(x, y));
    const lineTo = (x: number, y: number): void => sink.lineTo(...map(x, y));
    const cubic = (a: number, b: number, c: number, e: number, x: number, y: number): void => {
        const [m1x, m1y] = map(a, b);
        const [m2x, m2y] = map(c, e);
        const [mx, my] = map(x, y);
        sink.bezierCurveTo(m1x, m1y, m2x, m2y, mx, my);
    };
    for (const seg of cmds) {
        const type = seg[0]!;
        const rel = type >= "a";
        const n = (seg.slice(1).match(NUM) ?? []).map(Number);
        const up = type.toUpperCase();
        let i = 0;
        const rx = (v: number): number => (rel ? cx + v : v);
        const ry = (v: number): number => (rel ? cy + v : v);
        if (up === "M") {
            cx = rx(n[i++]!);
            cy = ry(n[i++]!);
            moveTo(cx, cy);
            sx = cx;
            sy = cy;
            while (i + 1 < n.length) {
                cx = rel ? cx + n[i++]! : n[i++]!;
                cy = rel ? cy + n[i++]! : n[i++]!;
                lineTo(cx, cy);
            }
        } else if (up === "L") {
            while (i + 1 < n.length) {
                cx = rel ? cx + n[i++]! : n[i++]!;
                cy = rel ? cy + n[i++]! : n[i++]!;
                lineTo(cx, cy);
            }
        } else if (up === "H") {
            while (i < n.length) {
                cx = rel ? cx + n[i++]! : n[i++]!;
                lineTo(cx, cy);
            }
        } else if (up === "V") {
            while (i < n.length) {
                cy = rel ? cy + n[i++]! : n[i++]!;
                lineTo(cx, cy);
            }
        } else if (up === "C") {
            while (i + 5 < n.length) {
                const a = rx(n[i++]!);
                const b = ry(n[i++]!);
                const c = rx(n[i++]!);
                const e = ry(n[i++]!);
                const x = rx(n[i++]!);
                const y = ry(n[i++]!);
                cubic(a, b, c, e, x, y);
                px = c;
                py = e;
                cx = x;
                cy = y;
            }
        } else if (up === "S") {
            while (i + 3 < n.length) {
                const refl = prev === "C" || prev === "S";
                const a = refl ? 2 * cx - px : cx;
                const b = refl ? 2 * cy - py : cy;
                const c = rx(n[i++]!);
                const e = ry(n[i++]!);
                const x = rx(n[i++]!);
                const y = ry(n[i++]!);
                cubic(a, b, c, e, x, y);
                px = c;
                py = e;
                cx = x;
                cy = y;
            }
        } else if (up === "Q") {
            while (i + 3 < n.length) {
                const a = rx(n[i++]!);
                const b = ry(n[i++]!);
                const x = rx(n[i++]!);
                const y = ry(n[i++]!);
                sink.quadraticCurveTo(...map(a, b), ...map(x, y));
                px = a;
                py = b;
                cx = x;
                cy = y;
            }
        } else if (up === "T") {
            while (i + 1 < n.length) {
                const refl = prev === "Q" || prev === "T";
                const a = refl ? 2 * cx - px : cx;
                const b = refl ? 2 * cy - py : cy;
                const x = rx(n[i++]!);
                const y = ry(n[i++]!);
                sink.quadraticCurveTo(...map(a, b), ...map(x, y));
                px = a;
                py = b;
                cx = x;
                cy = y;
            }
        } else if (up === "A") {
            while (i + 6 < n.length) {
                const arx = n[i++]!;
                const ary = n[i++]!;
                const rot = n[i++]!;
                const large = n[i++]!;
                const sweep = n[i++]!;
                const x = rx(n[i++]!);
                const y = ry(n[i++]!);
                for (const c of arcToCubics(cx, cy, arx, ary, rot, large, sweep, x, y))
                    cubic(c[0]!, c[1]!, c[2]!, c[3]!, c[4]!, c[5]!);
                cx = x;
                cy = y;
            }
        } else if (up === "Z") {
            sink.closePath();
            cx = sx;
            cy = sy;
        }
        prev = up;
    }
}

// the sanitizing ingest boundary: only these tags/attrs survive
const attr = (tag: string, name: string): string | undefined =>
    tag.match(new RegExp(`\\b${name.replace("-", "\\-")}="([^"]*)"`))?.[1];

function paintOf(v: string | undefined): Paint | undefined {
    if (v === undefined || v === "") return undefined;
    if (v === "none") return "none";
    if (v === "currentColor") return "currentColor";
    return { color: v };
}

const NUMERIC = /^[-+]?(\d*\.\d+|\d+\.?)([eE][-+]?\d+)?$/;

function styleFrom(tag: string): VStyle {
    const st: VStyle = {};
    const f = paintOf(attr(tag, "fill"));
    const s = paintOf(attr(tag, "stroke"));
    if (f) st.fill = f;
    if (s) st.stroke = s;
    const w = attr(tag, "stroke-width");
    if (w && NUMERIC.test(w)) st.width = Number(w);
    const cap = attr(tag, "stroke-linecap");
    if (cap === "butt" || cap === "round" || cap === "square") st.cap = cap;
    const join = attr(tag, "stroke-linejoin");
    if (join === "miter" || join === "round" || join === "bevel") st.join = join;
    const rule = attr(tag, "fill-rule") ?? attr(tag, "clip-rule");
    if (rule === "evenodd" || rule === "nonzero") st.fillRule = rule;
    const op = attr(tag, "opacity");
    if (op && NUMERIC.test(op)) st.opacity = Number(op);
    return st;
}

function transformFrom(tag: string): VTransform | undefined {
    const t = attr(tag, "transform");
    if (!t) return undefined;
    let m: Affine = IDENT;
    for (const fn of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
        const a = (fn[2]!.match(NUM) ?? []).map(Number);
        const name = fn[1];
        let next: Affine = IDENT;
        if (name === "translate") next = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        else if (name === "scale") next = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        else if (name === "rotate") {
            const r = ((a[0] ?? 0) * Math.PI) / 180;
            const rot: Affine = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
            next =
                a.length >= 3
                    ? mul([1, 0, 0, 1, a[1]!, a[2]!], mul(rot, [1, 0, 0, 1, -a[1]!, -a[2]!]))
                    : rot;
        } else if (name === "matrix" && a.length >= 6)
            next = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        m = mul(m, next);
    }
    return { matrix: m };
}

function ptsOf(tag: string): Pt[] {
    const nums = (attr(tag, "points")?.match(NUM) ?? []).map(Number);
    const out: Pt[] = [];
    for (let k = 0; k + 1 < nums.length; k += 2) out.push([nums[k]!, nums[k + 1]!]);
    return out;
}

function shapeNodeFrom(kind: string, tag: string): VNode | null {
    const style = styleFrom(tag);
    const tf = transformFrom(tag);
    const num = (name: string, dflt = 0): number => {
        const v = attr(tag, name);
        return v !== undefined && NUMERIC.test(v) ? Number(v) : dflt;
    };
    if (kind === "path") {
        const d = attr(tag, "d");
        return d ? { t: "path", d, style, tf } : null;
    }
    if (kind === "rect")
        return {
            t: "rect",
            x: num("x"),
            y: num("y"),
            w: num("width"),
            h: num("height"),
            rx: num("rx") || undefined,
            style,
            tf,
        };
    if (kind === "circle")
        return {
            t: "ellipse",
            cx: num("cx"),
            cy: num("cy"),
            rx: num("r"),
            ry: num("r"),
            style,
            tf,
        };
    if (kind === "ellipse")
        return {
            t: "ellipse",
            cx: num("cx"),
            cy: num("cy"),
            rx: num("rx"),
            ry: num("ry"),
            style,
            tf,
        };
    if (kind === "line")
        return { t: "line", x1: num("x1"), y1: num("y1"), x2: num("x2"), y2: num("y2"), style, tf };
    if (kind === "polyline") return { t: "poly", pts: ptsOf(tag), closed: false, style, tf };
    if (kind === "polygon") return { t: "poly", pts: ptsOf(tag), closed: true, style, tf };
    return null;
}

const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

function parseNodes(src: string): VNode[] {
    const root: VNode[] = [];
    const stack: VNode[][] = [root];
    TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG.exec(src))) {
        const closing = m[1] === "/";
        const name = m[2]!.toLowerCase();
        const full = m[0];
        const selfClose = m[4] === "/";
        if (name === "g") {
            if (closing) {
                if (stack.length > 1) stack.pop();
            } else {
                const group: VNode = {
                    t: "group",
                    children: [],
                    style: styleFrom(full),
                    tf: transformFrom(full),
                };
                stack[stack.length - 1]!.push(group);
                if (!selfClose) stack.push(group.children);
            }
            continue;
        }
        if (closing) continue;
        if (SHAPES.has(name)) {
            const node = shapeNodeFrom(name, full);
            if (node) stack[stack.length - 1]!.push(node);
        }
        // everything else (svg/defs/use/image/text/style/script/…) is dropped
    }
    return root;
}

// Accepts a full `<svg>` document or a bare inner `body`; `vbHint` supplies the viewBox for the latter.
export function parseSvg(markup: string, vbHint?: string): Vector {
    let inner = markup;
    let vb = vbHint ?? "0 0 24 24";
    const open = markup.match(/<svg\b[^>]*>/i);
    if (open) {
        const box = attr(open[0], "viewBox");
        if (box) vb = box;
        else {
            const w = attr(open[0], "width");
            const h = attr(open[0], "height");
            if (w && h) vb = `0 0 ${parseFloat(w)} ${parseFloat(h)}`;
        }
        const start = markup.indexOf(open[0]) + open[0].length;
        inner = markup.slice(start).replace(/<\/svg\s*>[\s\S]*$/i, "");
    }
    const p = vb.split(/[\s,]+/).map(Number);
    const dims: [number, number, number, number] = [p[0] || 0, p[1] || 0, p[2] || 24, p[3] || 24];
    return { vb: dims, nodes: parseNodes(inner) };
}

const KAPPA = 0.5523;
// SVG initial values: the root the node tree inherits from.
const SVG_INITIAL: VStyle = { fill: { color: "#000" }, stroke: "none" };

function concrete(p: Paint, theme: Tokens | undefined): string | undefined {
    if (p === "none") return undefined;
    if (p === "currentColor") return theme?.ink ?? "#000";
    if ("role" in p) return theme?.[p.role] ?? "#000";
    return p.color;
}

function resolvePaint(
    p: Paint | undefined,
    theme: Tokens | undefined,
    tint: Paint | undefined,
    opacity: number | undefined,
): string | undefined {
    if (!p || p === "none") return undefined;
    let color = tint ? concrete(tint, theme) : concrete(p, theme);
    if (color === undefined) return undefined;
    if (opacity !== undefined && opacity < 1) color = hexA(color, opacity);
    return color;
}

function mergeStyle(parent: VStyle, s: VStyle | undefined): VStyle {
    if (!s) return parent;
    return {
        fill: s.fill ?? parent.fill,
        stroke: s.stroke ?? parent.stroke,
        width: s.width ?? parent.width,
        cap: s.cap ?? parent.cap,
        join: s.join ?? parent.join,
        dash: s.dash ?? parent.dash,
        fillRule: s.fillRule ?? parent.fillRule,
        opacity: (s.opacity ?? 1) * (parent.opacity ?? 1),
    };
}

interface DrawOpts {
    tint?: Paint;
    fit?: "contain" | "cover";
    adoptTheme?: boolean;
}

function drawStyleOf(style: VStyle, m: Affine, theme: Tokens | undefined, o: DrawOpts): DrawStyle {
    const scale = meanScale(m);
    const fill = resolvePaint(adopt(style.fill, o), theme, o.tint, style.opacity);
    const stroke = resolvePaint(adopt(style.stroke, o), theme, o.tint, style.opacity);
    const ds: DrawStyle = {};
    if (fill) ds.fill = fill;
    if (stroke) {
        ds.stroke = stroke;
        ds.width = (style.width ?? 1) * scale;
        if (style.cap) ds.cap = style.cap;
        if (style.join) ds.join = style.join;
        if (style.dash) ds.dash = style.dash.map((d) => d * scale);
    }
    if (style.fillRule) ds.fillRule = style.fillRule;
    return ds;
}

// remap literal colors to the nearest theme role by luminance, so imported art recolors
function adopt(p: Paint | undefined, o: DrawOpts): Paint | undefined {
    if (!o.adoptTheme || !p || p === "none" || p === "currentColor" || "role" in p) return p;
    const lum = luminanceOf(p.color);
    if (lum === undefined) return p;
    const role: ThemeRole = lum < 0.3 ? "ink" : lum > 0.82 ? "surface" : "accent";
    return { role };
}

function luminanceOf(color: string): number | undefined {
    const m = color.match(/^#?([0-9a-f]{6})$/i) ?? color.match(/^#?([0-9a-f]{3})$/i);
    if (!m) return undefined;
    let hex = m[1]!;
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function paintNode(
    g: DrawContext,
    node: VNode,
    acc: Affine,
    parentStyle: VStyle,
    theme: Tokens | undefined,
    o: DrawOpts,
): void {
    const m = node.tf ? mul(acc, transformAffine(node.tf)) : acc;
    const style = mergeStyle(parentStyle, node.style);
    const map: Map2 = (x, y) => at(m, x, y);
    if (node.t === "group") {
        for (const child of node.children) paintNode(g, child, m, style, theme, o);
        return;
    }
    const ds = drawStyleOf(style, m, theme, o);
    if (ds.fill === undefined && ds.stroke === undefined) return;
    if (node.t === "path") {
        g.path((sink) => emitPath(node.d, sink, map), ds);
    } else if (node.t === "line") {
        const a = map(node.x1, node.y1);
        const b = map(node.x2, node.y2);
        g.line(a[0], a[1], b[0], b[1], { ...ds, fill: undefined });
    } else if (node.t === "poly") {
        g.path((sink) => {
            node.pts.forEach((p, i) => {
                const q = map(p[0], p[1]);
                if (i === 0) sink.moveTo(q[0], q[1]);
                else sink.lineTo(q[0], q[1]);
            });
            if (node.closed) sink.closePath();
        }, ds);
    } else if (node.t === "ellipse") {
        const { cx, cy, rx, ry } = node;
        const kx = rx * KAPPA;
        const ky = ry * KAPPA;
        g.path((sink) => {
            const s0 = map(cx, cy - ry);
            sink.moveTo(s0[0], s0[1]);
            const bez = (p1: Pt, p2: Pt, p3: Pt): void => {
                const a = map(p1[0], p1[1]);
                const b = map(p2[0], p2[1]);
                const c = map(p3[0], p3[1]);
                sink.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
            };
            bez([cx + kx, cy - ry], [cx + rx, cy - ky], [cx + rx, cy]);
            bez([cx + rx, cy + ky], [cx + kx, cy + ry], [cx, cy + ry]);
            bez([cx - kx, cy + ry], [cx - rx, cy + ky], [cx - rx, cy]);
            bez([cx - rx, cy - ky], [cx - kx, cy - ry], [cx, cy - ry]);
            sink.closePath();
        }, ds);
    } else if (node.t === "rect") {
        if (axisAligned(m)) {
            const p = map(node.x, node.y);
            g.rect(p[0], p[1], node.w * m[0], node.h * m[3], {
                ...ds,
                radius: (node.rx ?? 0) * m[0],
            });
        } else {
            g.path((sink) => {
                const c = [
                    map(node.x, node.y),
                    map(node.x + node.w, node.y),
                    map(node.x + node.w, node.y + node.h),
                    map(node.x, node.y + node.h),
                ];
                sink.moveTo(c[0]![0], c[0]![1]);
                sink.lineTo(c[1]![0], c[1]![1]);
                sink.lineTo(c[2]![0], c[2]![1]);
                sink.lineTo(c[3]![0], c[3]![1]);
                sink.closePath();
            }, ds);
        }
    }
}

// `tint` forces one paint (monochrome icons); `adoptTheme` remaps literals to theme roles.
export function drawVector(
    g: DrawContext,
    box: Rect,
    v: Vector,
    theme: Tokens | undefined,
    o: DrawOpts = {},
): void {
    const [minX, minY, vbW, vbH] = v.vb;
    const bw = vbW || 1;
    const bh = vbH || 1;
    const s = (o.fit === "cover" ? Math.max : Math.min)(box.w / bw, box.h / bh);
    const ox = box.x + (box.w - bw * s) / 2;
    const oy = box.y + (box.h - bh * s) / 2;
    const base: Affine = [s, 0, 0, s, ox - minX * s, oy - minY * s];
    for (const node of v.nodes) paintNode(g, node, base, SVG_INITIAL, theme, o);
}

// bare ICON_LIBRARY glyphs are stroke-based, so wrap them in a stroke context
export function drawIcon(
    g: DrawContext,
    glyph: IconGlyph,
    x: number,
    y: number,
    size: number,
    color: string,
): void {
    const body = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph.body}</g>`;
    drawVector(g, { x, y, w: size, h: size }, parseSvg(body, glyph.vb), undefined, {
        tint: { color },
    });
}

// shape presets, authored in box coords
export type ShapeKind = "rectangle" | "ellipse" | "triangle" | "star" | "line" | "arrow";
const isStroked = (k: ShapeKind): boolean => k === "line" || k === "arrow";

interface ShapeOpts {
    fill: Paint;
    stroke?: Paint;
    width?: number;
    radius?: number;
}

function starPts(cx: number, cy: number, r: number, points: number): Pt[] {
    const inner = r * 0.42;
    const out: Pt[] = [];
    for (let k = 0; k < points * 2; k++) {
        const rad = k % 2 === 0 ? r : inner;
        const a = -Math.PI / 2 + (k * Math.PI) / points;
        out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    return out;
}

export function shapeVector(kind: ShapeKind, w: number, h: number, o: ShapeOpts): Vector {
    const line = isStroked(kind);
    const sw = o.width ?? (line ? 3 : 2);
    const stroked = o.stroke !== undefined && o.stroke !== "none";
    const i = stroked || line ? sw / 2 : 0; // inset so the outline/cap isn't clipped at the box edge
    const iw = Math.max(0, w - 2 * i);
    const ih = Math.max(0, h - 2 * i);
    const style: VStyle = {
        fill: o.fill,
        stroke: o.stroke,
        width: stroked ? sw : undefined,
        cap: "round",
        join: "round",
    };
    const nodes: VNode[] = [];
    if (kind === "rectangle") {
        nodes.push({ t: "rect", x: i, y: i, w: iw, h: ih, rx: o.radius, style });
    } else if (kind === "ellipse") {
        nodes.push({ t: "ellipse", cx: i + iw / 2, cy: i + ih / 2, rx: iw / 2, ry: ih / 2, style });
    } else if (kind === "triangle") {
        nodes.push({
            t: "poly",
            pts: [
                [w / 2, i],
                [w - i, h - i],
                [i, h - i],
            ],
            closed: true,
            style,
        });
    } else if (kind === "star") {
        nodes.push({
            t: "poly",
            pts: starPts(w / 2, h / 2, Math.min(iw, ih) / 2, 5),
            closed: true,
            style,
        });
    } else if (kind === "line") {
        nodes.push({
            t: "line",
            x1: i,
            y1: h / 2,
            x2: w - i,
            y2: h / 2,
            style: { fill: "none", stroke: o.fill, width: sw, cap: "round" },
        });
    } else if (kind === "arrow") {
        const y = h / 2;
        const head = Math.min(Math.max(h * 0.5, 12), 28) + sw;
        const back = w - i - head;
        const st: VStyle = { fill: "none", stroke: o.fill, width: sw, cap: "round", join: "round" };
        nodes.push({ t: "line", x1: i, y1: y, x2: w - i - head * 0.5, y2: y, style: st });
        nodes.push({
            t: "poly",
            pts: [
                [back, y - head * 0.6],
                [w - i, y],
                [back, y + head * 0.6],
            ],
            closed: false,
            style: st,
        });
    }
    return { vb: [0, 0, w, h], nodes };
}

// stroke glyphs, 24-box; keys stay in sync with the diagram `icons` description in model/ai.ts
export const ICON_LIBRARY: Record<string, IconGlyph> = {
    search: {
        id: "search",
        vb: "0 0 24 24",
        body: `<circle cx="11" cy="11" r="7"/><line x1="16.2" y1="16.2" x2="21" y2="21"/>`,
    },
    edit: {
        id: "edit",
        vb: "0 0 24 24",
        body: `<path d="M4 20l4-1L20 7l-3-3L5 16z"/><line x1="14" y1="6" x2="18" y2="10"/>`,
    },
    build: {
        id: "build",
        vb: "0 0 24 24",
        body: `<path d="M3 8 12 3 21 8 21 16 12 21 3 16Z"/><path d="M3 8 12 13 21 8"/><line x1="12" y1="13" x2="12" y2="21"/>`,
    },
    flask: {
        id: "flask",
        vb: "0 0 24 24",
        body: `<path d="M9 3 15 3M10 3 10 10 5 20 19 20 14 10 14 3"/><line x1="8" y1="15" x2="16" y2="15"/>`,
    },
    rocket: {
        id: "rocket",
        vb: "0 0 24 24",
        body: `<path d="M5 15C5 9 9 4 12 3C15 4 19 9 19 15L15 18 9 18Z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 18 7 21M15 18 17 21"/>`,
    },
    flag: { id: "flag", vb: "0 0 24 24", body: `<path d="M5 21 5 4 18 4 15 8 18 12 5 12"/>` },
    sprout: {
        id: "sprout",
        vb: "0 0 24 24",
        body: `<path d="M12 21 12 11"/><path d="M12 11C12 7 9 6 5 6C5 10 8 11 12 11Z"/><path d="M12 11C12 8 15 6 19 6C19 9 16 11 12 11Z"/>`,
    },
    trend: {
        id: "trend",
        vb: "0 0 24 24",
        body: `<polyline points="3,17 9,11 13,15 21,7"/><polyline points="15,7 21,7 21,13"/>`,
    },
    expand: {
        id: "expand",
        vb: "0 0 24 24",
        body: `<path d="M8 3 3 3 3 8"/><path d="M16 3 21 3 21 8"/><path d="M8 21 3 21 3 16"/><path d="M16 21 21 21 21 16"/>`,
    },
    shield: {
        id: "shield",
        vb: "0 0 24 24",
        body: `<path d="M12 3 20 6 20 12C20 17 16 20 12 21C8 20 4 17 4 12L4 6Z"/>`,
    },
    alert: {
        id: "alert",
        vb: "0 0 24 24",
        body: `<path d="M12 3 22 20 2 20Z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.4"/>`,
    },
    idea: {
        id: "idea",
        vb: "0 0 24 24",
        body: `<path d="M9 18 15 18M10 21 14 21"/><path d="M12 3C8 3 6 6 6 9C6 11 7 12 8 14L8 18 16 18 16 14C17 12 18 11 18 9C18 6 16 3 12 3Z"/>`,
    },
    close: {
        id: "close",
        vb: "0 0 24 24",
        body: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`,
    },
    check: { id: "check", vb: "0 0 24 24", body: `<polyline points="4,12 10,18 20,6"/>` },
    users: {
        id: "users",
        vb: "0 0 24 24",
        body: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20C3 16 6 14 9 14C12 14 15 16 15 20"/><path d="M16 5C18 6 18 9 16 11"/><path d="M18 20C18 17 17 15 15.5 14.5"/>`,
    },
    target: {
        id: "target",
        vb: "0 0 24 24",
        body: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>`,
    },
    cycle: {
        id: "cycle",
        vb: "0 0 24 24",
        body: `<path d="M4 12A8 8 0 1 1 7 18"/><polyline points="4,7 4,12 9,12"/>`,
    },
    layers: {
        id: "layers",
        vb: "0 0 24 24",
        body: `<polygon points="12,3 21,8 12,13 3,8"/><polyline points="3,12 12,17 21,12"/><polyline points="3,16 12,21 21,16"/>`,
    },
    calendar: {
        id: "calendar",
        vb: "0 0 24 24",
        body: `<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>`,
    },
};

const DEFAULT_GLYPH: IconGlyph = {
    id: "lucide:sparkles",
    vb: "0 0 24 24",
    body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><circle cx="4" cy="20" r="2"/></g>`,
};

const DEFAULT_GRAPHIC = parseSvg(
    `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 24l6 6 12-12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);

interface VectorSpecCfg<D> {
    type: string;
    label: string;
    category: string;
    create: () => D;
    controls: ControlField[];
    bar?: string[];
    resize?: ElementSpec<D>["resize"];
    node: (data: D) => { w: Size; h: Size; aspect?: number };
    render: (g: DrawContext, box: Rect, data: D, theme: Tokens) => void;
}

function vectorSpec<D>(cfg: VectorSpecCfg<D>): ElementSpec<D> {
    return {
        type: cfg.type,
        label: cfg.label,
        category: cfg.category,
        tier: "primitive",
        create: cfg.create,
        layout: (data, ctx) => ({
            ...cfg.node(data),
            surface: { paint: (g, box) => cfg.render(g, box, data, ctx.theme) },
        }),
        controls: cfg.controls,
        bar: cfg.bar,
        resize: cfg.resize,
    };
}

interface IconData {
    glyph: IconGlyph;
    color?: string; // theme role (accent/ink/soft/muted) or hex
    size?: number;
}
function iconPaint(color: string | undefined): Paint {
    if (!color) return { role: "accent" };
    if (color.startsWith("#")) return { color };
    return { role: color as ThemeRole };
}
register(
    vectorSpec<IconData>({
        type: "icon",
        label: "Icon",
        category: "media",
        create: () => ({ glyph: DEFAULT_GLYPH, color: "accent", size: 72 }),
        node: (d) => ({ w: fixed(d.size ?? 72), h: fixed(d.size ?? 72) }),
        render: (g, box, d, theme) =>
            drawVector(g, box, parseSvg(d.glyph.body, d.glyph.vb), theme, {
                tint: iconPaint(d.color),
            }),
        resize: { width: false, height: { key: "size", min: 24, max: 240, step: 4 } },
        bar: ["glyph", "color"],
        controls: [
            { key: "glyph", label: "Icon", control: "icon" },
            { key: "color", label: "Color", control: "iconColor" },
        ],
    }),
);

interface ShapeData {
    kind: ShapeKind;
    fill?: string; // solids: fill; line/arrow: line color; unset → accent
    stroke?: string; // outline for solids
    strokeWidth?: number;
    radius?: number; // rectangle only
    height?: number;
}
const SHAPE_KINDS: { label: string; value: string }[] = [
    { label: "Rectangle", value: "rectangle" },
    { label: "Ellipse", value: "ellipse" },
    { label: "Triangle", value: "triangle" },
    { label: "Star", value: "star" },
    { label: "Line", value: "line" },
    { label: "Arrow", value: "arrow" },
];
register(
    vectorSpec<ShapeData>({
        type: "shape",
        label: "Shape",
        category: "basic",
        create: () => ({ kind: "rectangle", height: 160 }),
        node: (d) => ({
            w: grow(),
            h: fixed(d.height ?? (isStroked(d.kind) ? 44 : 160)),
        }),
        render: (g, box, d, theme) =>
            drawVector(
                g,
                box,
                shapeVector(d.kind, box.w, box.h, {
                    fill: d.fill ? { color: d.fill } : { role: "accent" },
                    stroke: d.stroke ? { color: d.stroke } : undefined,
                    width: d.strokeWidth,
                    radius: d.radius,
                }),
                theme,
            ),
        resize: { height: { key: "height", min: 24, max: 600, step: 8 } },
        bar: ["kind", "fill"],
        controls: [
            { key: "kind", label: "Shape", control: "select", options: SHAPE_KINDS },
            { key: "fill", label: "Fill", control: "color" },
            {
                key: "radius",
                label: "Corner radius",
                control: "slider",
                min: 0,
                max: 80,
                step: 1,
                unit: "px",
                visibleWhen: (d) => d.kind === "rectangle",
            },
            {
                key: "stroke",
                label: "Stroke",
                control: "color",
                visibleWhen: (d) => d.kind !== "line" && d.kind !== "arrow",
                group: "Outline",
            },
            {
                key: "strokeWidth",
                label: "Weight",
                control: "slider",
                min: 0,
                max: 20,
                step: 1,
                unit: "px",
                group: "Outline",
            },
        ],
    }),
);

interface GraphicData {
    doc: Vector;
    adoptTheme?: boolean;
}
register(
    vectorSpec<GraphicData>({
        type: "graphic",
        label: "Graphic",
        category: "media",
        create: () => ({ doc: DEFAULT_GRAPHIC, adoptTheme: true }),
        node: (d) => ({ w: grow(), h: fit(), aspect: (d.doc.vb[2] || 1) / (d.doc.vb[3] || 1) }),
        render: (g, box, d, theme) =>
            drawVector(g, box, d.doc ?? DEFAULT_GRAPHIC, theme, { adoptTheme: d.adoptTheme }),
        resize: { aspect: { min: 0.3, max: 3 } },
        bar: ["doc"],
        controls: [
            { key: "doc", label: "SVG", control: "vector" },
            { key: "adoptTheme", label: "Match theme colors", control: "toggle", group: "Color" },
        ],
    }),
);
