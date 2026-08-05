import { hexA } from "@themes";
import {
    PAD,
    captionText,
    clamp,
    inkOn,
    linkColor,
    nodeText,
    registerDiagram,
    stackedLabel,
    type Renderer,
} from "./utils";

// `value` spans a bar in axis columns (default 1); `axes` names the columns (quarters, phases, …).
const roadmap: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const n = items.length;
    const pad = PAD;
    const ticks = diagram.axes.length ? diagram.axes : [];
    const headH = ticks.length ? 22 : 0;
    const track = { x: pad, y: pad + headH, w: W - pad * 2, h: H - pad * 2 - headH };
    // lanes divide the track rather than claiming a fixed height, so a long plan compresses to fit
    const lane = track.h / n;
    const laneGap = clamp(lane * 0.18, 2, 8);
    const laneH = Math.max(1, Math.min(56, lane - laneGap));
    const columns = Math.max(ticks.length, n);
    const colW = track.w / columns;

    ticks.forEach((tick, i) => {
        const x = track.x + i * colW;
        g.text(
            tick,
            x + colW / 2,
            pad + headH / 2,
            captionText(theme, { fill: theme.muted, size: 11, weight: 600 }),
        );
        if (i > 0)
            g.line(x, pad + headH - 4, x, H - pad, {
                stroke: hexA(linkColor(theme), 0.22),
                width: 1,
            });
    });

    const ink = inkOn(theme.surface, theme);
    items.forEach((item, i) => {
        const y = track.y + i * (laneH + laneGap);
        // each lane starts a column later than the one above, wrapping before it runs off the track
        const startCol = columns > 1 ? i % Math.max(1, columns - 1) : 0;
        const span = clamp(item.value ?? 1, 1, columns - startCol);
        const x = track.x + startCol * colW;
        const w = Math.max(48, span * colW - 6);
        g.rect(x, y, w, laneH, {
            fill: hexA(cols[i]!, 0.14),
            stroke: cols[i]!,
            width: 1.5,
            radius: Math.min(10, laneH / 2),
        });
        const tx = x + 12;
        const maxW = Math.max(24, x + w - 10 - tx);
        stackedLabel(
            g,
            item,
            tx + maxW / 2,
            y + laneH / 2,
            maxW,
            nodeText(theme, { fill: ink, size: 12.5 }),
            laneH >= 46 ? captionText(theme, { fill: hexA(ink, 0.66) }) : undefined,
        );
    });
};

registerDiagram({ id: "roadmap", label: "Roadmap", render: roadmap });
