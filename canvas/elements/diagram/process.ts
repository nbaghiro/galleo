import { PAD, drawLink, drawNode, registerDiagram, type Renderer } from "./utils";

const GAP = 40;
const ROW_GAP = 26;
const NODE_H = 56;

const process: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const avail = W - PAD * 2;
    const fit = Math.max(1, Math.min(items.length, Math.floor((avail + GAP) / (96 + GAP))));
    // spread evenly once it wraps: 4 steps in a 3-wide row read as 2+2, not 3 and a stranded 1
    const rows = Math.ceil(items.length / fit);
    const perRow = Math.ceil(items.length / rows);
    const nodeW = (avail - GAP * (perRow - 1)) / perRow;
    // sizes only shrink from the natural ones, so a crowded list compresses instead of overflowing
    const cell = (H - PAD * 2) / rows;
    const rowGap = Math.min(ROW_GAP, cell * 0.22);
    const nodeH = Math.max(1, Math.min(NODE_H, cell - rowGap));
    const top = (H - (rows * nodeH + (rows - 1) * rowGap)) / 2;

    items.forEach((item, i) => {
        const c = i % perRow;
        const x = PAD + c * (nodeW + GAP);
        const y = top + Math.floor(i / perRow) * (nodeH + rowGap);
        drawNode(g, { x, y, w: nodeW, h: nodeH }, item, theme, {
            color: cols[i]!,
            showBody: !!item.body && nodeH >= 54,
        });
        if (c < perRow - 1 && i < items.length - 1) {
            const cy = y + nodeH / 2;
            drawLink(
                g,
                [
                    [x + nodeW, cy],
                    [x + nodeW + GAP, cy],
                ],
                theme,
                { color: theme.muted, width: 2 },
            );
        }
    });
};

registerDiagram({ id: "process", label: "Process", render: process });
