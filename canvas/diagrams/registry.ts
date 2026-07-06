import type { DiagramType } from "./types";

// The diagram-type registry — mirrors the chart registry (@canvas/charts/registry). Grouped modules
// (templated.ts, hierarchy.ts, flow.ts) register their types at import; render.ts imports them.
const registry = new Map<string, DiagramType>();

export function registerDiagram(type: DiagramType): void {
    registry.set(type.id, type);
}

export function getDiagram(id: string): DiagramType | undefined {
    return registry.get(id);
}

export function diagramTypeOptions(): { label: string; value: string }[] {
    return [...registry.values()].map((t) => ({ label: t.label, value: t.id }));
}
