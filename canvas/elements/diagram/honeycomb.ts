import { hexA } from "@themes";
import { drawNode, registerDiagram, type Renderer } from "./utils";

// Offset hex rows: every other row shifts half a cell, so the tiles interlock.
const honeycomb: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const n = items.length;
    const pad = 10;
    const gap = 6;
    const perRow = Math.max(2, Math.round(Math.sqrt(n * 1.4)));
    const rows = Math.ceil(n / perRow);
    // an offset row overhangs by half a cell, so budget that extra half before sizing
    const overhang = rows > 1 ? 0.5 : 0;
    const cellW = (W - pad * 2 - gap * (perRow - 1 + overhang)) / (perRow + overhang);
    const cellH = Math.min(cellW * 0.92, (H - pad * 2 - gap * (rows - 1)) / rows);
    const left = (W - (perRow * cellW + gap * (perRow - 1)) - overhang * (cellW + gap)) / 2;
    const top = (H - (rows * cellH + gap * (rows - 1))) / 2;

    items.forEach((item, i) => {
        const r = Math.floor(i / perRow);
        const c = i % perRow;
        const shift = r % 2 === 1 ? (cellW + gap) / 2 : 0;
        drawNode(
            g,
            {
                x: left + shift + c * (cellW + gap),
                y: top + r * (cellH + gap),
                w: cellW,
                h: cellH,
            },
            item,
            theme,
            {
                fill: hexA(cols[i]!, 0.14),
                stroke: cols[i]!,
                shape: "hexagon",
                pad: 6,
                titleSize: 12,
                showBody: !!item.body && cellH >= 62,
            },
        );
    });
};

registerDiagram({ id: "honeycomb", label: "Honeycomb", render: honeycomb });
