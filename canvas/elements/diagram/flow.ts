import { mix } from "@themes";
import dagre from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import type { NodeShape } from "./utils";
import {
    clamp,
    drawEdgeLabel,
    drawLink,
    drawNode,
    nodeText,
    registerDiagram,
    type DiagEdge,
    type DiagramCtx,
    type ResolvedDiagram,
} from "./utils";

const isNum = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function chainEdges(nodes: ResolvedDiagram["nodes"]): DiagEdge[] {
    const out: DiagEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        out.push({ from: nodes[i]!.id, to: nodes[i + 1]!.id });
    }
    return out;
}

// a label phrased as a question is a decision
const shapeFor = (label: string): NodeShape => (label.trim().endsWith("?") ? "diamond" : "rounded");

function renderFlow(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const { nodes } = diagram;
    if (nodes.length === 0) return;

    const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
    graph.setGraph({
        rankdir: opts.flow === "right" ? "LR" : "TB",
        nodesep: 28,
        ranksep: 44,
    });
    graph.setDefaultEdgeLabel(() => ({}));

    const edges = diagram.edges.length > 0 ? diagram.edges : chainEdges(nodes);
    const shapes = new Map(nodes.map((n) => [n.id, shapeFor(n.label)]));

    const nodeH = 36;
    for (const n of nodes) {
        const decision = shapes.get(n.id) === "diamond";
        const text = g.measureText(n.label, nodeText(theme)).width;
        // a diamond only offers its middle band for text, so it needs the extra width
        const w = clamp(text + (decision ? 60 : 26), decision ? 106 : 90, 150);
        graph.setNode(n.id, { label: n.label, width: w, height: decision ? 56 : nodeH });
    }
    for (const e of edges) {
        if (graph.hasNode(e.from) && graph.hasNode(e.to))
            graph.setEdge(e.from, e.to, { label: e.label ?? "" });
    }

    dagre.layout(graph);

    const gl = graph.graph();
    const gw = isNum(gl.width) && gl.width > 0 ? gl.width : W;
    const gh = isNum(gl.height) && gl.height > 0 ? gl.height : H;
    const pad = 16;
    const s = Math.min((W - 2 * pad) / gw, (H - 2 * pad) / gh);
    const ox = (W - gw * s) / 2;
    const oy = (H - gh * s) / 2;
    const mapX = (x: number): number => ox + x * s;
    const mapY = (y: number): number => oy + y * s;

    // edges first, so node boxes paint over the arrow tails
    const link = mix(theme.line, theme.surface, 0.15);
    for (const e of graph.edges()) {
        const pts = (graph.edge(e).points ?? [])
            .filter((pt) => isNum(pt.x) && isNum(pt.y))
            .map((pt) => [mapX(pt.x), mapY(pt.y)] as [number, number]);
        if (pts.length < 2) continue;
        drawLink(g, pts, theme, { color: link, width: 1.6 });
        const label = graph.edge(e).label;
        if (label) {
            const mid = pts[Math.floor(pts.length / 2)]!;
            drawEdgeLabel(g, mid[0], mid[1], String(label), theme);
        }
    }

    for (const n of nodes) {
        const nd = graph.node(n.id);
        if (!nd || !isNum(nd.x) || !isNum(nd.y)) continue;
        const w = (isNum(nd.width) ? nd.width : 96) * s;
        const h = (isNum(nd.height) ? nd.height : nodeH) * s;
        drawNode(
            g,
            { x: mapX(nd.x) - w / 2, y: mapY(nd.y) - h / 2, w, h },
            { label: n.label },
            theme,
            { shape: shapes.get(n.id) ?? "rounded", radius: 8 },
        );
    }
}

registerDiagram({ id: "flow", label: "Flowchart", render: renderFlow });
