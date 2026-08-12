import { createSignal } from "solid-js";
import type { UnitRates } from "@model/credits";
import { unitMultipliers } from "@model/credits";
import { featuresState } from "./features";
import { modelOverrides, pickModel, setModelOverride, summarizeSteps } from "./models";

// Which model each step will run on, and which one each past run actually used. Kept apart from
// models.ts so that file stays a leaf: api.ts reads its header and would otherwise cycle through
// features.ts back to itself.

const KEY = "galleo.models.runs";
const KEEP = 12;

export interface RunRecord {
    id: string;
    label: string;
    artifactId?: string;
    at: number;
    steps: Record<string, string>; // task → model id, as resolved when the step ran
}

const catalogue = () => featuresState()?.models ?? null;

export const catalogueReady = (): boolean => !!catalogue();

export function modelLabel(id: string): string {
    return catalogue()?.models.find((m) => m.id === id)?.label ?? id;
}

export function effectiveModel(task: string): string {
    const c = catalogue();
    if (!c) return "";
    return pickModel(
        task,
        modelOverrides(),
        c.models.map((m) => m.id),
        c.defaults,
    );
}

export const isOverridden = (task: string): boolean => {
    const c = catalogue();
    const picked = modelOverrides()[task];
    return !!c && !!picked && c.models.some((m) => m.id === picked);
};

const read = (): RunRecord[] => {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
        return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
    } catch {
        return [];
    }
};

const [runs, setRuns] = createSignal<RunRecord[]>(read());
export { runs as modelRuns };

const persist = (next: RunRecord[]): void => {
    setRuns(next);
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // private mode / quota — the list still holds for this session
    }
};

let currentId: string | null = null;

export function beginRun(label: string): void {
    if (!catalogueReady()) return;
    currentId = `r-${Date.now()}`;
    persist([{ id: currentId, label, at: Date.now(), steps: {} }, ...runs()].slice(0, KEEP));
}

// last write wins: a step re-run after the picker changed reports what it actually used
export function noteStep(task: string): void {
    const id = currentId;
    if (!id || !catalogueReady()) return;
    const model = effectiveModel(task);
    if (!model) return;
    persist(runs().map((r) => (r.id === id ? { ...r, steps: { ...r.steps, [task]: model } } : r)));
}

export function nameRun(label: string): void {
    const id = currentId;
    if (!id || !label.trim()) return;
    persist(runs().map((r) => (r.id === id ? { ...r, label: label.trim() } : r)));
}

export function attachArtifact(artifactId: string): void {
    const id = currentId;
    if (!id) return;
    persist(runs().map((r) => (r.id === id ? { ...r, artifactId } : r)));
}

export const clearRuns = (): void => persist([]);

// picking the model the server would have chosen anyway is not an override: store nothing, so the
// "all default" read stays true and the header never sends a redundant task
export function chooseModel(task: string, id: string): void {
    setModelOverride(task, id === catalogue()?.defaults[task] ? "" : id);
}

// "outline · Gemini 3.5 Flash   section · Claude Opus 5", in the order the steps ran
export const stepSummary = (r: RunRecord): string => summarizeSteps(r.steps, modelLabel);

export function currentRunSteps(): Record<string, string> {
    return runs().find((r) => r.id === currentId)?.steps ?? {};
}

// what the studio's cost previews scale by, so the number on the board is the number charged
export const unitRates = (): UnitRates =>
    unitMultipliers(effectiveModel, (id) => catalogue()?.rates[id]);
