import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, EngineNode, PathSink, Rect } from "@engine/node";
import type { Tokens } from "@themes";
import { GHOST, register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";

type ShapeKind = "rectangle" | "ellipse" | "triangle" | "star" | "line" | "arrow";

interface ShapeData {
    kind: ShapeKind;
    fill?: string; // fill for solids, line colour for line/arrow; unset → theme accent
    stroke?: string; // outline for filled shapes; unset → none
    strokeWidth?: number; // px
    radius?: number; // rectangle only
    height?: number; // box height px; width fills the column
}

const isStroked = (k: ShapeKind): boolean => k === "line" || k === "arrow";

// 4 cubic beziers, standard kappa approximation (0.5523).
function ellipsePath(p: PathSink, x: number, y: number, w: number, h: number): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const kx = rx * 0.5523;
    const ky = ry * 0.5523;
    p.moveTo(cx, cy - ry);
    p.bezierCurveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
    p.bezierCurveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    p.bezierCurveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    p.bezierCurveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
    p.closePath();
}

function starPath(p: PathSink, cx: number, cy: number, r: number, points: number): void {
    const inner = r * 0.42;
    for (let k = 0; k < points * 2; k++) {
        const rad = k % 2 === 0 ? r : inner;
        const a = -Math.PI / 2 + (k * Math.PI) / points;
        const px = cx + rad * Math.cos(a);
        const py = cy + rad * Math.sin(a);
        if (k === 0) p.moveTo(px, py);
        else p.lineTo(px, py);
    }
    p.closePath();
}

function paintShape(g: DrawContext, box: Rect, d: ShapeData, theme: Tokens): void {
    const { w, h } = box;
    const color = d.fill ?? theme.accent;
    const stroke = d.stroke || undefined;
    const line = isStroked(d.kind);
    const sw = d.strokeWidth ?? (line ? 3 : 2);
    // inset half the stroke so the outline/line cap isn't clipped at the box edge.
    const i = stroke || line ? sw / 2 : 0;
    const iw = Math.max(0, w - 2 * i);
    const ih = Math.max(0, h - 2 * i);
    const filled = { fill: color, stroke, width: stroke ? sw : undefined };

    switch (d.kind) {
        case "rectangle":
            g.rect(i, i, iw, ih, { ...filled, radius: d.radius ?? 0 });
            break;
        case "ellipse":
            g.path((p) => ellipsePath(p, i, i, iw, ih), filled);
            break;
        case "triangle":
            g.path((p) => {
                p.moveTo(w / 2, i);
                p.lineTo(w - i, h - i);
                p.lineTo(i, h - i);
                p.closePath();
            }, filled);
            break;
        case "star":
            g.path((p) => starPath(p, w / 2, h / 2, Math.min(iw, ih) / 2, 5), filled);
            break;
        case "line":
            g.line(i, h / 2, w - i, h / 2, { stroke: color, width: sw });
            break;
        case "arrow": {
            const y = h / 2;
            const head = Math.min(Math.max(h * 0.5, 12), 28) + sw;
            g.line(i, y, w - i - head * 0.5, y, { stroke: color, width: sw });
            const tip = w - i;
            const back = w - i - head;
            const arrowHead: [number, number][] = [
                [back, y - head * 0.6],
                [tip, y],
                [back, y + head * 0.6],
            ];
            g.polyline(arrowHead, { stroke: color, width: sw });
            break;
        }
    }
}

const KIND_OPTIONS = [
    { label: "Rectangle", value: "rectangle" },
    { label: "Ellipse", value: "ellipse" },
    { label: "Triangle", value: "triangle" },
    { label: "Star", value: "star" },
    { label: "Line", value: "line" },
    { label: "Arrow", value: "arrow" },
];

const CONTROLS: ControlField[] = [
    { key: "kind", label: "Shape", control: "select", options: KIND_OPTIONS },
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
];

export const shapeElement: ElementSpec<ShapeData> = {
    type: "shape",
    label: "Shape",
    category: "basic",
    tier: "primitive",
    create: () => ({ kind: "rectangle", height: 160 }),
    layout: (d: ShapeData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fixed(d.height ?? (isStroked(d.kind) ? 44 : 160)),
        surface: { paint: (g, box) => paintShape(g, box, d, ctx.theme) },
    }),
    resize: { height: { key: "height", min: 24, max: 600, step: 8 } },
    // surface has no fill leaf, so auto-skeletonize would tag a 16:9 ghost — draw a block.
    skeleton: (): EngineNode => ({ w: grow(), h: fixed(120), fill: { color: GHOST, radius: 12 } }),
    bar: ["kind", "fill"],
    controls: CONTROLS,
};

register(shapeElement);
