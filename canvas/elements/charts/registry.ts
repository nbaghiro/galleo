import type { ChartType } from "./types";

// The chart-type registry — mirrors the element registry (@elements/spec). Grouped modules
// (cartesian.ts, radial.ts) register their types at import; render.ts imports them for the side effect.
const registry = new Map<string, ChartType>();

export function registerChart(type: ChartType): void {
    registry.set(type.id, type);
}

export function getChart(id: string): ChartType | undefined {
    return registry.get(id);
}

// Options for the element's "Type" control, in registration order (bar · line · area · pie · donut · radar).
export function chartTypeOptions(): { label: string; value: string }[] {
    return [...registry.values()].map((t) => ({ label: t.label, value: t.id }));
}
