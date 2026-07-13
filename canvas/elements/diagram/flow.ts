import { mix } from "@themes";
import dagre from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import {
    arrowPath,
    clamp,
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

function renderFlow(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    const { nodes } = diagram;
    if (nodes.length === 0) return;

    const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
    graph.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 44 });
    graph.setDefaultEdgeLabel(() => ({}));

    const nodeH = 36;
    for (const n of nodes) {
        const w = clamp(g.measureText(n.label, nodeText(theme)).width + 26, 90, 150);
        graph.setNode(n.id, { label: n.label, width: w, height: nodeH });
    }

    const edges = diagram.edges.length > 0 ? diagram.edges : chainEdges(nodes);
    for (const e of edges) {
        if (graph.hasNode(e.from) && graph.hasNode(e.to)) graph.setEdge(e.from, e.to);
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

    // Edges first, so node boxes paint over the arrow tails.
    const link = mix(theme.line, theme.surface, 0.15);
    for (const e of graph.edges()) {
        const pts = graph.edge(e).points ?? [];
        const scaled = pts
            .filter((pt) => isNum(pt.x) && isNum(pt.y))
            .map((pt) => [mapX(pt.x), mapY(pt.y)] as [number, number]);
        if (scaled.length >= 2) arrowPath(g, scaled, link, 1.6);
    }

    for (const n of nodes) {
        const nd = graph.node(n.id);
        if (!nd || !isNum(nd.x) || !isNum(nd.y)) continue;
        const w = (isNum(nd.width) ? nd.width : 96) * s;
        const h = (isNum(nd.height) ? nd.height : nodeH) * s;
        drawNode(g, mapX(nd.x) - w / 2, mapY(nd.y) - h / 2, w, h, n.label, theme, { radius: 8 });
    }
}

registerDiagram({ id: "flow", label: "Flowchart", render: renderFlow });
