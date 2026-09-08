import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import { fontStack } from "@themes";
import { drawIcon, ICON_LIBRARY } from "@elements/media/vector";
import {
    PAD,
    clamp,
    diagramCell,
    itemColors,
    maxLabelWidth,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 10;
const MAX_SLOTS = 20; // past this the marks stop being countable at a glance
const DEFAULT_GLYPH = "users";
const VALUE_W = 38; // the count's own column at the end of the strip

function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items;
    const n = items.length;
    if (n === 0) return { w: grow(), h: fixed(height) };
    const cols = itemColors(diagram, ctx.theme);
    const counts = items.map((i) => clamp(Math.round(i.value ?? 1), 0, MAX_SLOTS));
    const slots = Math.max(1, ...counts);
    const rowH = Math.max(16, (height - PAD * 2 - GAP * (n - 1)) / n);
    const labelW = clamp(maxLabelWidth(ctx, items) + 20, 60, ctx.availWidth * 0.42);
    // Measured against the strip's own box, never against ctx.availWidth: that is compose's
    // estimate and can run wide, and a row laid out to a wider strip than it gets clips its last
    // mark. The mark is capped by the row it sits in rather than by a constant.
    const marks = (boxW: number, boxH: number): { size: number; step: number } => {
        const size = clamp(Math.min(boxH * 0.72, (boxW / slots) * 0.86), 7, 44);
        return { size, step: slots > 1 ? Math.min(size * 1.3, (boxW - size) / (slots - 1)) : 0 };
    };

    return {
        w: grow(),
        h: fixed(height),
        direction: "col",
        alignY: "center",
        gap: GAP,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: items.map((item, i): EngineNode => {
            const label = diagramCell(kids[i * 2], kids[i * 2 + 1], {
                ink: ctx.theme.ink,
                dim: ctx.theme.muted,
                iconInk: cols[i]!,
            });
            label.w = fixed(labelW);
            label.h = fixed(rowH);
            const glyph = ICON_LIBRARY[item.icon ?? ""] ?? ICON_LIBRARY[DEFAULT_GLYPH]!;
            const filled = counts[i]!;
            return {
                w: grow(),
                h: fixed(rowH),
                direction: "row",
                gap: GAP,
                alignY: "center",
                children: [
                    label,
                    {
                        w: grow(),
                        h: fixed(rowH),
                        surface: {
                            paint: (g, box) => {
                                // the count sits in a column of its own; without it the marks take
                                // the whole strip and the figure paints past the edge
                                const { size, step } = marks(Math.max(40, box.w - VALUE_W), box.h);
                                const y = (box.h - size) / 2;
                                for (let k = 0; k < slots; k++)
                                    drawIcon(
                                        g,
                                        glyph,
                                        k * step,
                                        y,
                                        size,
                                        k < filled ? cols[i]! : ctx.theme.line,
                                    );
                                // the marks are counted against each other, so they need a shared
                                // line to be counted from
                                const end = step * (slots - 1) + size;
                                const base = Math.min(box.h - 1, y + size + 5);
                                g.line(0, base, end, base, { stroke: ctx.theme.line, width: 1 });
                                // the marks are countable, but nobody counts twenty of them; the
                                // figure is chrome the data already carries, like a chart's label
                                g.text(String(filled), end + 12, box.h / 2, {
                                    fill: ctx.theme.muted,
                                    size: 12,
                                    weight: 600,
                                    font: fontStack("mono", ctx.theme),
                                    align: "start",
                                    baseline: "middle",
                                });
                            },
                        },
                    },
                ],
            };
        }),
    };
}

registerDiagram({ id: "pictogram", label: "Pictogram", arrange, fill: "ground" });
