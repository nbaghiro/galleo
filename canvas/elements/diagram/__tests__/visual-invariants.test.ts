import { describe, expect, it } from "vitest";
import type { EngineNode, PathSink, Rect, RenderCommand } from "@engine/node";
import { layout } from "@engine/layout";
import { fit, grow } from "@model/geometry";
import { diagramTypeOptions } from "@elements/diagram/render";
import { contrastRatio, resolveTheme } from "@themes";
import {
    BADGE_R,
    getDiagram,
    getNodeShape,
    normalizeDiagram,
    toDiagramData,
    type ResolvedDiagram,
} from "@elements/diagram/utils";
import "@elements/register";
import { tokens } from "@canvas/testkit";

// Deterministic geometry invariants over the composed output, run across a matrix of types, item
// counts, sizes, shapes, and options. These encode the mechanical half of "does it look right":
//   1. clip safety — nothing a decorate surface paints may leave its box (a badge disc half
//      outside the surface renders clipped in the app);
//   2. chrome/cell alignment — connectors live in the gaps: no link endpoint inside a cell fill
//      (the wrapped-row process bug painted arrows inside the stretched last-row cells);
//   3. badge attachment — every numbering disc hugs some cell's leading edge;
//   4. badge/label separation — discs never overlap label text;
//   5. shape proportion — a silhouette or pill never paints beyond its declared max aspect
//      (a pill on a tall tread renders as an egg);
//   6. text containment — a label never spills outside the cell that backs it;
//   7. contrast — label ink always clears 3:1 against its backing fill;
//   8. occlusion — no decoration painted after a label may cover it (floats with z < 0 paint
//      under the flow; a band or silhouette over the text renders it invisible);
//   9. label alignment — inside a cell a label block is either top-anchored or centered, never
//      drifting (an empty detail slot reserving height pushed labels off-center);
//   10. caption clearance — text outside every cell (axis captions) must not lap into a cell fill.
// The aesthetic half (rhythm, balance, palette) is the LLM-judge script in scripts/eval-diagrams.ts,
// which renders this same matrix to SVG fixtures.

interface Op {
    kind: string;
    box: Rect;
    endpoints?: [number, number][];
}

// a DrawContext that records the geometry of every op, path bounds included
function geometryRecorder(): { ctx: Record<string, unknown>; ops: Op[] } {
    const ops: Op[] = [];
    const push = (kind: string, box: Rect, endpoints?: [number, number][]): void => {
        ops.push({ kind, box, endpoints });
    };
    const ctx = {
        rect: (x: number, y: number, w: number, h: number) => push("rect", { x, y, w, h }),
        line: (x1: number, y1: number, x2: number, y2: number) =>
            push(
                "line",
                {
                    x: Math.min(x1, x2),
                    y: Math.min(y1, y2),
                    w: Math.abs(x2 - x1),
                    h: Math.abs(y2 - y1),
                },
                [
                    [x1, y1],
                    [x2, y2],
                ],
            ),
        circle: (cx: number, cy: number, r: number) =>
            push("circle", { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }),
        polyline: (points: [number, number][]) => {
            const xs = points.map((p) => p[0]);
            const ys = points.map((p) => p[1]);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            push("polyline", { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, [
                points[0]!,
                points[points.length - 1]!,
            ]);
        },
        wedge: (cx: number, cy: number, r: number) =>
            push("wedge", { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }),
        path: (build: (p: PathSink) => void) => {
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
            if (minX <= maxX) push("path", { x: minX, y: minY, w: maxX - minX, h: maxY - minY });
        },
        text: (text: string, x: number, y: number) => {
            const w = text.length * 7 + 4;
            push("chrome-text", { x: x - w / 2, y: y - 7, w, h: 14 });
        },
        measureText: (text: string) => ({ width: text.length * 8 }),
    };
    return { ctx, ops };
}

const measure = (
    leaf: { text: string; size: number },
    maxWidth: number,
): { width: number; height: number } => {
    const w = leaf.text.length * 8;
    const lines = Math.max(1, Math.ceil(w / Math.max(1, maxWidth)));
    return { width: Math.min(w, maxWidth), height: lines * leaf.size * 1.35 };
};

const kidsFor = (diagram: ResolvedDiagram): EngineNode[] =>
    diagram.items.flatMap((i): EngineNode[] => [
        { w: grow(), h: fit(), text: { text: i.label, fontId: "t", size: 13, wrap: "words" } },
        { w: grow(), h: fit(), text: { text: i.body ?? "", fontId: "t", size: 11, wrap: "words" } },
    ]);

interface Audit {
    commands: RenderCommand[];
    cellFills: Rect[];
    labelTexts: Rect[]; // engine text command boxes
    chrome: { surface: Rect; ops: Op[] }[];
    fills: Extract<RenderCommand, { kind: "rect" }>[];
    texts: Extract<RenderCommand, { kind: "text" }>[];
}

function audit(data: Record<string, unknown>, w: number, h: number, theme = tokens): Audit {
    const diagram = normalizeDiagram(toDiagramData(data));
    const type = getDiagram(diagram.type)!;
    const ctx = {
        box: { x: 0, y: 0, w, h },
        availWidth: w,
        format: {
            id: "deck",
            name: "Deck",
            kind: "paged",
            width: 1280,
            height: 720,
            tokenScale: 1,
            splitMinWidth: 520,
            overflow: "paginate",
        },
        theme,
        measure,
    };
    const node = type.arrange(diagram, ctx as never, kidsFor(diagram), h);
    const { commands } = layout(node, { x: 0, y: 0, w, h }, measure as never);
    const fills = commands.filter(
        (c): c is Extract<RenderCommand, { kind: "rect" }> =>
            c.kind === "rect" && !!c.fill && !!(c.fill.color || c.fill.gradient),
    );
    const cellFills = fills.map((c) => c.box);
    const texts = commands.filter(
        (c): c is Extract<RenderCommand, { kind: "text" }> => c.kind === "text",
    );
    const labelTexts = texts.map((c) => c.box);
    const chrome = commands
        .filter((c) => c.kind === "surface")
        .map((c) => {
            const rec = geometryRecorder();
            (c as { paint: (g: unknown, b: unknown) => void }).paint(rec.ctx, {
                x: 0,
                y: 0,
                w: c.box.w,
                h: c.box.h,
            });
            // ops are surface-local; shift into command space for comparisons against cells
            return {
                surface: c.box,
                ops: rec.ops.map((o) => ({
                    ...o,
                    box: { ...o.box, x: o.box.x + c.box.x, y: o.box.y + c.box.y },
                    endpoints: o.endpoints?.map(
                        (p) => [p[0] + c.box.x, p[1] + c.box.y] as [number, number],
                    ),
                })),
            };
        });
    return { commands, cellFills, labelTexts, chrome, fills, texts };
}

const EPS = 1;
const inside = (p: [number, number], r: Rect, pad = 0): boolean =>
    p[0] > r.x + pad && p[0] < r.x + r.w - pad && p[1] > r.y + pad && p[1] < r.y + r.h - pad;
const within = (b: Rect, r: Rect, eps = EPS): boolean =>
    b.x >= r.x - eps &&
    b.y >= r.y - eps &&
    b.x + b.w <= r.x + r.w + eps &&
    b.y + b.h <= r.y + r.h + eps;
const intersects = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const MATRIX: { label: string; data: Record<string, unknown> }[] = [];
for (const { value: type } of diagramTypeOptions()) {
    for (const n of [3, 5]) {
        const items = Array.from({ length: n }, (_, i) => `Item ${i + 1}`).join(", ");
        MATRIX.push({
            label: `${type} n=${n} numbered`,
            data: { type, items, numbers: "number", axes: "low end, high end, near, far" },
        });
        if (["process", "steps", "cycle", "hub", "matrix"].includes(type))
            MATRIX.push({
                label: `${type} n=${n} chevron`,
                data: { type, items, shape: "chevron", numbers: "number" },
            });
        // alternating icons over numbering: iconed items drop their badge, the rest keep it
        MATRIX.push({
            label: `${type} n=${n} icons`,
            data: {
                type,
                items,
                numbers: "number",
                axes: "low end, high end, near, far",
                itemsMeta: Array.from({ length: n }, (_, i) =>
                    i % 2 === 0 ? { icon: "rocket", emphasis: i === 0 } : {},
                ),
            },
        });
        // uneven weights: connectors, badges, and silhouettes must track the resized cells
        if (type === "process")
            MATRIX.push({
                label: `process n=${n} weighted`,
                data: {
                    type,
                    items,
                    numbers: "number",
                    itemsMeta: Array.from({ length: n }, (_, i) =>
                        i === 0 ? { weight: 2.4 } : i === 1 ? { weight: 0.6 } : {},
                    ),
                },
            });
        // the graph types branch, which is where their layouts actually differ from a chain
        if (type === "flow" || type === "mindmap" || type === "org") {
            const kids = Array.from({ length: n - 1 }, (_, i) => `Item ${i + 2}`);
            const arrow = type === "flow" ? "->" : ">";
            MATRIX.push({
                label: `${type} n=${n} branching`,
                data: {
                    type,
                    items,
                    links: kids.map((k) => `Item 1${arrow}${k}`).join(", "),
                },
            });
        }
        // detail lines exercise the grown-cell path (a wrapped detail must stay inside its fill)
        if (type === "org")
            MATRIX.push({
                label: `org n=${n} detailed`,
                data: {
                    type,
                    items: Array.from(
                        { length: n },
                        (_, i) => `Item ${i + 1} | supporting line ${i + 1}`,
                    ).join("\n"),
                },
            });
    }
}

// carbon is the adversarial theme: a dark page AND a near-neutral accent, so both lightness and
// hue differentiation must come from the page-aware ramp; studio covers the shipped light look
const THEME_CASES = [
    ["studio", tokens],
    ["carbon", resolveTheme("carbon").tokens],
] as const;

describe.each(THEME_CASES)("visual invariants (%s)", (_themeName, themeTokens) => {
    for (const { label, data } of MATRIX) {
        for (const [w, h] of [
            [560, 240],
            [360, 200],
        ] as const) {
            it(`${label} at ${w}x${h}`, () => {
                const a = audit(data, w, h, themeTokens);

                // 5. shape proportion: engine pill fills and painted silhouettes stay within the
                // shape's declared max aspect
                const shapeId = String((data as { shape?: string }).shape ?? "rounded");
                const def = getNodeShape(shapeId);
                if (def.maxAspect) {
                    const shaped = def.engineRadius
                        ? a.cellFills
                        : a.chrome.flatMap((c) =>
                              c.ops.filter((o) => o.kind === "path").map((o) => o.box),
                          );
                    for (const b of shaped)
                        expect(
                            b.h / Math.max(1, b.w),
                            `${shapeId} degenerate at aspect ${(b.h / b.w).toFixed(2)} (${JSON.stringify(b)})`,
                        ).toBeLessThanOrEqual(def.maxAspect);
                }

                // 8. occlusion: no later-painted opaque op may fully cover a label
                const cmdIndex = new Map(a.commands.map((c, i) => [c, i] as const));
                for (const t of a.texts) {
                    const ti = cmdIndex.get(t)!;
                    for (const c of a.chrome) {
                        const si = a.commands.findIndex(
                            (x) => x.kind === "surface" && x.box === c.surface,
                        );
                        if (si < ti) continue; // painted before the label: safe
                        for (const op of c.ops) {
                            if (op.kind !== "path" && op.kind !== "rect" && op.kind !== "wedge")
                                continue;
                            expect(
                                within(t.box, op.box, -2),
                                `label ${JSON.stringify(t.box)} occluded by later ${op.kind} ${JSON.stringify(op.box)}`,
                            ).toBe(false);
                        }
                    }
                }

                // 9. a label block is top-anchored or centered in its cell, never adrift
                for (const cell of a.cellFills) {
                    const inCell = a.texts.filter((t) =>
                        inside([t.box.x + t.box.w / 2, t.box.y + t.box.h / 2], cell),
                    );
                    if (!inCell.length) continue;
                    const top = Math.min(...inCell.map((t) => t.box.y));
                    const bottom = Math.max(...inCell.map((t) => t.box.y + t.box.h));
                    const drift = Math.abs((top + bottom) / 2 - (cell.y + cell.h / 2));
                    const topAnchored = top - cell.y <= 16;
                    expect(
                        topAnchored || drift <= 5,
                        `label block adrift in cell: drift ${drift.toFixed(1)} (${JSON.stringify(cell)})`,
                    ).toBe(true);
                }

                // 6 + 7. every label stays inside its backing fill and clears 3:1 contrast on it
                for (const t of a.texts) {
                    const center: [number, number] = [t.box.x + t.box.w / 2, t.box.y + t.box.h / 2];
                    const backing = a.fills.find((f) => inside(center, f.box));
                    if (!backing) {
                        // 10. a caption owns its lane: it may not lap into any cell fill
                        for (const f of a.cellFills)
                            expect(
                                intersects(t.box, f),
                                `caption ${JSON.stringify(t.box)} laps cell ${JSON.stringify(f)}`,
                            ).toBe(false);
                        continue; // transparent-cell types read on the surface
                    }
                    expect(
                        within(t.box, backing.box, 2),
                        `text ${JSON.stringify(t.box)} spills its cell ${JSON.stringify(backing.box)}`,
                    ).toBe(true);
                    const ink = t.text.color;
                    const bg = backing.fill?.gradient?.from ?? backing.fill?.color;
                    if (ink && bg && ink.startsWith("#") && bg.startsWith("#"))
                        expect(
                            contrastRatio(ink, bg),
                            `low contrast ${ink} on ${bg}`,
                        ).toBeGreaterThanOrEqual(3);
                }

                for (const { surface, ops } of a.chrome) {
                    // a surface wholly inside a cell is in-cell content (an icon glyph), not
                    // connector chrome — its strokes belong there
                    const inCell = a.cellFills.some((f) => within(surface, f, 2));
                    for (const op of ops) {
                        // 1. clip safety: decorate paints must stay inside their surface
                        expect(
                            within(op.box, surface),
                            `clipped ${op.kind} at ${JSON.stringify(op.box)} outside surface ${JSON.stringify(surface)}`,
                        ).toBe(true);

                        // 2. connectors live in the gaps, never inside a cell fill
                        if (
                            !inCell &&
                            (op.kind === "line" || op.kind === "polyline") &&
                            op.endpoints
                        ) {
                            for (const p of op.endpoints)
                                for (const cell of a.cellFills)
                                    expect(
                                        inside(p, cell, 2),
                                        `connector endpoint ${p} inside cell ${JSON.stringify(cell)}`,
                                    ).toBe(false);
                        }

                        if (op.kind === "circle" && Math.round(op.box.w / 2) === BADGE_R) {
                            // 3. a numbering disc hugs some cell's leading edge; angled shapes
                            // compose transparent cells, so their painted silhouettes anchor too
                            const cx = op.box.x + BADGE_R;
                            const cy = op.box.y + BADGE_R;
                            const silhouettes = ops
                                .filter((o) => o.kind === "path")
                                .map((o) => o.box);
                            const anchors = [...a.cellFills, ...silhouettes];
                            const anchored =
                                anchors.some(
                                    (cell) =>
                                        Math.abs(cx - cell.x) <= BADGE_R * 4 &&
                                        cy >= cell.y - BADGE_R &&
                                        cy <= cell.y + cell.h + BADGE_R,
                                ) || anchors.length === 0;
                            expect(anchored, `badge at ${cx},${cy} anchored to no cell`).toBe(true);

                            // 4. discs never overlap label text
                            for (const t of a.labelTexts)
                                expect(
                                    intersects(op.box, t),
                                    `badge ${JSON.stringify(op.box)} overlaps text ${JSON.stringify(t)}`,
                                ).toBe(false);
                        }
                    }
                }
            });
        }
    }
});
