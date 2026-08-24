import { createSignal } from "solid-js";
import { capture } from "@ui/analytics";

// imports nothing else from app/: api.ts reads modelHeaders() and would otherwise cycle

export const MODEL_HEADER = "x-galleo-models";
const KEY = "galleo.models";

export type ModelOverrides = Record<string, string>;

const read = (): ModelOverrides => {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== "object") return {};
        const out: ModelOverrides = {};
        for (const [task, id] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof id === "string" && id) out[task] = id;
        }
        return out;
    } catch {
        return {};
    }
};

const [overrides, setOverrides] = createSignal<ModelOverrides>(read());
export { overrides as modelOverrides };

const persist = (next: ModelOverrides): void => {
    setOverrides(next);
    try {
        if (Object.keys(next).length) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
    } catch {
        // private mode / quota — the choice still applies for this session
    }
};

// empty id clears the task back to the server default
export function setModelOverride(task: string, id: string): void {
    capture("model_pinned", { task, model_id: id });
    const next = { ...overrides() };
    if (id) next[task] = id;
    else delete next[task];
    persist(next);
}

export const clearModelOverrides = (): void => persist({});

export const overrideCount = (): number => Object.keys(overrides()).length;

export function modelHeaders(): Record<string, string> {
    const picked = overrides();
    return Object.keys(picked).length ? { [MODEL_HEADER]: JSON.stringify(picked) } : {};
}

// Mirrors the server's modelFor(): a pick the registry does not serve falls back to the tier
// default, so a stale localStorage entry degrades instead of routing a call to nothing.
export function pickModel(
    task: string,
    overrides: ModelOverrides,
    served: readonly string[],
    defaults: Record<string, string>,
): string {
    const picked = overrides[task];
    return picked && served.includes(picked) ? picked : (defaults[task] ?? "");
}

export const summarizeSteps = (
    steps: Record<string, string>,
    labelFor: (id: string) => string,
): string =>
    Object.entries(steps)
        .map(([task, id]) => `${task} · ${labelFor(id)}`)
        .join("   ");
