import { hexA } from "@themes";
import {
    PAD,
    captionText,
    clamp,
    inkOn,
    nodeText,
    registerDiagram,
    stackedLabel,
    type Renderer,
} from "./utils";

const BODY_ROOM = 72; // block height below which the detail line is dropped

// every block rises a level and drops to the baseline, so the climb reads as progress
const steps: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const n = items.length;
    const pad = PAD;
    const gap = 8;
    const stepW = (W - pad * 2 - gap * (n - 1)) / n;
    const base = H - pad;
    const span = base - pad;

    items.forEach((item, i) => {
        const x = pad + i * (stepW + gap);
        const h = Math.max(34, span * ((i + 1) / n));
        const y = base - h;
        const fill = hexA(cols[i]!, 0.14);
        g.rect(x, y, stepW, h, { fill, stroke: cols[i]!, width: 1.5, radius: 10 });
        // the label rides the tread, so captions line up with the climb
        const ink = inkOn(theme.surface, theme);
        stackedLabel(
            g,
            item,
            x + stepW / 2,
            clamp(y + 24, y + 14, y + h - 14),
            Math.max(24, stepW - 16),
            nodeText(theme, { fill: ink }),
            h >= BODY_ROOM ? captionText(theme, { fill: hexA(ink, 0.66) }) : undefined,
        );
    });
};

registerDiagram({ id: "steps", label: "Steps", render: steps });
