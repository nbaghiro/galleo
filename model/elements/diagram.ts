// Diagram-category value-sets — the `data.type` discriminant. Render impls live in the canvas diagram
// registry; kept in lockstep via the drift guard. Graph diagrams read the `links` edge string.

export const DIAGRAM_TYPES = [
    "process",
    "cycle",
    "pyramid",
    "funnel",
    "timeline",
    "venn",
    "quadrant",
    "matrix",
    "tree",
    "org",
    "mindmap",
    "flow",
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const GRAPH_DIAGRAM_TYPES = ["flow", "tree", "org", "mindmap"] as const;
