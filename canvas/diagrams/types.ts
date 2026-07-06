import type { DrawContext } from "@engine/node";
import type { Tokens } from "@themes/theme";

// Authored/persisted diagram data (artifact JSONB). String-based like charts: `items` is the label list
// (templated diagrams), `links` are the edges (graph/hierarchy diagrams). Legacy `{ kind, items }`
// folds into `type` on normalize.
export interface DiagramData {
    type?: string; // process | cycle | pyramid | funnel | timeline | venn | quadrant | matrix | tree | org | mindmap | flow
    kind?: string; // legacy discriminant (process | pyramid | funnel | cycle)
    items: string; // labels, newline- or comma-separated
    links?: string; // edges: "A->B, B->C" (flow) or "Parent>Child" (tree/org/mindmap)
    palette?: "ramp" | "categorical"; // node fills: accent ramp (mono) or hue-rotated (multi)
    height?: number;
}

export interface DiagNode {
    id: string;
    label: string;
}

export interface DiagEdge {
    from: string; // node id (= label)
    to: string;
    label?: string;
}

// A diagram after parsing — the single shape every diagram renders from. Templated diagrams read
// `items`; graph/hierarchy diagrams read `nodes` + `edges`.
export interface ResolvedDiagram {
    type: string;
    items: string[];
    nodes: DiagNode[];
    edges: DiagEdge[];
}

// The surface handed to a diagram renderer: local-origin size, theme tokens, and the same accent-derived
// palette factory the charts use (so a diagram's fills track the theme accent identically).
export interface DiagramCtx {
    g: DrawContext;
    W: number;
    H: number;
    theme: Tokens;
    colors: (n: number) => string[];
}

export interface DiagramType {
    id: string;
    label: string;
    render: (diagram: ResolvedDiagram, ctx: DiagramCtx) => void;
}
