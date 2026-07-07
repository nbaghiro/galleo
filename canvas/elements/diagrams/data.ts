import type { DiagramData, DiagEdge, ResolvedDiagram } from "./types";

// Labels split on newline OR comma (either authoring style works), trimmed, blanks dropped.
function splitItems(s: string | undefined): string[] {
    return (s ?? "")
        .split(/[\n,]/)
        .map((x) => x.trim())
        .filter(Boolean);
}

// Edges from a "links" string: entries separated by comma/newline, each "From->To" or "From>To"
// (arrow spelled -> or >). An optional ":label" tail names the edge ("A->B:yes").
function parseEdges(links: string | undefined): DiagEdge[] {
    return (links ?? "")
        .split(/[\n,]/)
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e): DiagEdge | null => {
            const [pair, label] = e.split(":");
            const parts = (pair ?? "").split(/->|>/).map((p) => p.trim());
            if (parts.length < 2 || !parts[0] || !parts[1]) return null;
            return { from: parts[0], to: parts[1], label: label?.trim() || undefined };
        })
        .filter((e): e is DiagEdge => e !== null);
}

const LEGACY_KIND: Record<string, string> = {
    process: "process",
    pyramid: "pyramid",
    funnel: "funnel",
    cycle: "cycle",
};

export function normalizeDiagram(d: DiagramData): ResolvedDiagram {
    const type = d.type ?? (d.kind ? (LEGACY_KIND[d.kind] ?? d.kind) : "process");
    const items = splitItems(d.items);
    return {
        type,
        items,
        nodes: items.map((label) => ({ id: label, label })),
        edges: parseEdges(d.links),
    };
}
