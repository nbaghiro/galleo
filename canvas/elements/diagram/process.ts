import type { EngineNode, Rect } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import type { Tokens } from "@themes";
import { fit, fixed, grow } from "@model/geometry";
import { seriesColors } from "@elements/chart/utils";
import {
    NODE_RADIUS,
    NODE_TEXT,
    PAD,
    captionText,
    drawLink,
    drawNode,
    nodePaint,
    registerDiagram,
    type DiagramCtx,
    type ResolvedDiagram,
} from "./utils";

const GAP = 40;
const ROW_GAP = 26;
const NODE_H = 56;
const CELL_PAD = { top: 8, bottom: 8, left: 10, right: 10 };

// One geometry pass, shared by the engine tree and the surface that paints between its boxes.
interface Shape {
    perRow: number;
    rows: number;
    nodeW: number;
    nodeH: number;
    rowGap: number;
    top: number;
}
function shape(n: number, W: number, H: number): Shape {
    const avail = W - PAD * 2;
    const fits = Math.max(1, Math.min(n, Math.floor((avail + GAP) / (96 + GAP))));
    // spread evenly once it wraps: 4 steps in a 3-wide row read as 2+2, not 3 and a stranded 1
    const rows = Math.ceil(n / fits);
    const perRow = Math.ceil(n / rows);
    const cell = (H - PAD * 2) / rows;
    const rowGap = Math.min(ROW_GAP, cell * 0.22);
    const nodeH = Math.max(1, Math.min(NODE_H, cell - rowGap));
    return {
        perRow,
        rows,
        nodeW: (avail - GAP * (perRow - 1)) / perRow,
        nodeH,
        rowGap,
        top: (H - (rows * nodeH + (rows - 1) * rowGap)) / 2,
    };
}

const rectAt = (i: number, s: Shape): Rect => ({
    x: PAD + (i % s.perRow) * (s.nodeW + GAP),
    y: s.top + Math.floor(i / s.perRow) * (s.nodeH + s.rowGap),
    w: s.nodeW,
    h: s.nodeH,
});

// Standalone path (thumbnails, the data editor's preview): paints the whole diagram, labels included.
function render(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    const n = diagram.items.length;
    if (n === 0) return;
    const cols = ctx.colors(n);
    const s = shape(n, W, H);
    diagram.items.forEach((item, i) => {
        const b = rectAt(i, s);
        drawNode(g, b, item, theme, { color: cols[i]!, showBody: !!item.body && b.h >= 54 });
        link(g, b, i, s, n, theme);
    });
}

function link(g: DiagramCtx["g"], b: Rect, i: number, s: Shape, n: number, theme: Tokens): void {
    if (i % s.perRow >= s.perRow - 1 || i >= n - 1) return;
    const cy = b.y + b.h / 2;
    drawLink(
        g,
        [
            [b.x + b.w, cy],
            [b.x + b.w + GAP, cy],
        ],
        theme,
        { color: theme.muted, width: 2 },
    );
}

// Container path: the cells are real engine boxes holding real text children, so the surface behind
// them only has the connectors left to draw. Both derive from `shape` at the same content width.
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = seriesColors(ctx.theme, n, diagram.palette);
    const s = shape(n, ctx.availWidth, height);
    const rows: EngineNode[] = [];
    for (let r = 0; r < s.rows; r++) {
        const slice = Array.from({ length: s.perRow }, (_, c) => r * s.perRow + c).filter(
            (i) => i < n,
        );
        rows.push({
            w: grow(),
            h: fixed(s.nodeH),
            direction: "row",
            gap: GAP,
            children: slice.map((i) => cell(kids[i * 2], kids[i * 2 + 1], cols[i]!, ctx.theme)),
        });
    }
    return {
        w: grow(),
        h: fixed(height),
        direction: "col",
        alignY: "center",
        gap: s.rowGap,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: [
            ...rows,
            {
                w: grow(),
                h: grow(),
                float: { x: "start", y: "start" },
                // structure comes from the same `s` the rows were built with; only the pixel widths
                // come from the real box, so the connectors always land between the boxes above them
                surface: {
                    paint: (g, box) => {
                        const nodeW = (box.w - GAP * (s.perRow - 1)) / s.perRow;
                        const total = s.rows * s.nodeH + (s.rows - 1) * s.rowGap;
                        const top = (box.h - total) / 2;
                        for (let i = 0; i < n; i++) {
                            const c = i % s.perRow;
                            const b = {
                                x: c * (nodeW + GAP),
                                y: top + Math.floor(i / s.perRow) * (s.nodeH + s.rowGap),
                                w: nodeW,
                                h: s.nodeH,
                            };
                            link(g, b, i, s, n, ctx.theme);
                        }
                    },
                },
            },
        ],
    };
}

// the element owns tone, as the table owns its cells' — so nodes read uniformly however text is styled
function cell(
    label: EngineNode | undefined,
    detail: EngineNode | undefined,
    color: string,
    theme: Tokens,
): EngineNode {
    const paint = nodePaint(color, theme);
    const kids: EngineNode[] = [];
    if (label?.text) {
        label.text.size = NODE_TEXT;
        label.text.weight = 600;
        label.text.color = paint.ink;
        label.text.align = "center";
        label.w = grow();
        label.h = fit(14);
        kids.push(label);
    }
    if (detail?.text) {
        const c = captionText(theme);
        detail.text.size = c.size ?? 11;
        detail.text.weight = c.weight ?? 500;
        detail.text.color = paint.dim;
        detail.text.align = "center";
        detail.w = grow();
        detail.h = fit(14);
        kids.push(detail);
    }
    return {
        w: grow(),
        h: grow(),
        padding: CELL_PAD,
        alignY: "center",
        gap: 2,
        fill: { color: paint.fill, radius: NODE_RADIUS },
        children: kids,
    };
}

registerDiagram({ id: "process", label: "Process", render, arrange });
