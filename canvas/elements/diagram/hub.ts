import { clamp, drawLink, drawNode, registerDiagram, type Renderer } from "./utils";

// First item is the hub, the rest ring it as spokes.
const hub: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const [centre, ...spokes] = diagram.items;
    if (!centre) return;
    const cols = ctx.colors(Math.max(1, spokes.length));
    const cx = W / 2;
    const cy = H / 2;
    const bodied = spokes.some((s) => s.body);
    const nodeW = clamp(W / 4.2, 84, 150);
    const nodeH = bodied ? 58 : 42;
    const hubW = clamp(W / 4.4, 88, 152);
    const hubH = Math.max(nodeH, 52);
    // ring radius is whatever keeps the spoke boxes on-canvas; clearing the hub is the softer goal
    const rx = Math.max(hubW / 2, W / 2 - nodeW / 2 - 8);
    const ry = Math.max(hubH / 2, H / 2 - nodeH / 2 - 8);
    const n = spokes.length;
    const start = -Math.PI / 2;

    spokes.forEach((_, i) => {
        const a = start + (i / Math.max(1, n)) * Math.PI * 2;
        const ex = cx + Math.cos(a) * rx;
        const ey = cy + Math.sin(a) * ry;
        // stop the spoke at each box's edge instead of its centre, so nothing pokes out from under a node
        const t = Math.min(
            1,
            Math.min(
                Math.abs(ex - cx) > 0.5 ? (Math.abs(ex - cx) - nodeW / 2) / Math.abs(ex - cx) : 1,
                Math.abs(ey - cy) > 0.5 ? (Math.abs(ey - cy) - nodeH / 2) / Math.abs(ey - cy) : 1,
            ),
        );
        const from = Math.max(
            0,
            Math.min(
                Math.abs(ex - cx) > 0.5 ? (hubW / 2 + 4) / Math.abs(ex - cx) : 0,
                Math.abs(ey - cy) > 0.5 ? (hubH / 2 + 4) / Math.abs(ey - cy) : 0,
            ),
        );
        drawLink(
            g,
            [
                [cx + (ex - cx) * from, cy + (ey - cy) * from],
                [cx + (ex - cx) * t, cy + (ey - cy) * t],
            ],
            theme,
            { color: cols[i]!, width: 1.8, head: false },
        );
    });

    spokes.forEach((item, i) => {
        const a = start + (i / Math.max(1, n)) * Math.PI * 2;
        const x = cx + Math.cos(a) * rx - nodeW / 2;
        const y = cy + Math.sin(a) * ry - nodeH / 2;
        drawNode(g, { x, y, w: nodeW, h: nodeH }, item, theme, {
            color: cols[i]!,
            pad: 9,
            titleSize: 12,
            showBody: !!item.body && nodeH >= 56,
        });
    });

    drawNode(g, { x: cx - hubW / 2, y: cy - hubH / 2, w: hubW, h: hubH }, centre, theme, {
        color: theme.accent,
        shape: "pill",
        pad: 10,
    });
};

registerDiagram({ id: "hub", label: "Hub & spoke", render: hub });
