import type { CostUnit } from "./credits";

// The steps a run is made of. Named here rather than in `services` because both sides need them:
// the client pins models per task over `x-galleo-models`, and the artifact records what each step
// used in `ai_meta`.
export type AiTask =
    | "generate"
    | "brief"
    | "outline"
    | "section"
    | "edit"
    | "rewrite"
    | "translate"
    | "chat"
    | "theme";

export const AI_TASKS: readonly AiTask[] = [
    "generate",
    "brief",
    "outline",
    "section",
    "edit",
    "rewrite",
    "translate",
    "chat",
    "theme",
];

// Which task's model does the work a cost unit stands for. `image` and `video` run on their own
// media models and are priced flat, so they have no text task.
export const UNIT_TASK: Record<CostUnit, AiTask | null> = {
    plan: "outline",
    section: "section",
    text: "rewrite",
    theme: "theme",
    reply: "chat",
    image: null,
    video: null,
};

/**
 * Per-unit price multipliers for the models a run will actually use.
 * `taskModel` resolves a task to a model id; `rateFor` prices that model against the baseline.
 */
export function unitMultipliers(
    taskModel: (task: AiTask) => string | undefined,
    rateFor: (modelId: string) => number | undefined,
): Partial<Record<CostUnit, number>> {
    const out: Partial<Record<CostUnit, number>> = {};
    for (const [unit, task] of Object.entries(UNIT_TASK) as [CostUnit, AiTask | null][]) {
        if (!task) continue;
        const id = taskModel(task);
        const rate = id ? rateFor(id) : undefined;
        if (rate && rate > 0 && rate !== 1) out[unit] = rate;
    }
    return out;
}
