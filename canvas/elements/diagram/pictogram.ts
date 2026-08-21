import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
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

function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items;
    const n = items.length;
    if (n === 0) return { w: grow(), h: fixed(height) };
    const cols = itemColors(items, ctx.theme);
    const counts = items.map((i) => clamp(Math.round(i.value ?? 1), 0, MAX_SLOTS));
    const slots = Math.max(1, ...counts);
    const rowH = Math.max(16, (height - PAD * 2 - GAP * (n - 1)) / n);
    const labelW = clamp(maxLabelWidth(ctx, items) + 20, 60, ctx.availWidth * 0.42);
    const stripW = Math.max(1, ctx.availWidth - PAD * 2 - labelW - GAP);
    const size = clamp(Math.min(rowH * 0.7, (stripW / slots) * 0.82), 7, 28);
    const step = slots > 1 ? Math.min(size * 1.3, (stripW - size) / (slots - 1)) : 0;

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
                            },
                        },
                    },
                ],
            };
        }),
    };
}

registerDiagram({ id: "pictogram", label: "Pictogram", arrange });
