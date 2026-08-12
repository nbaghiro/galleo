// Metered credits: an action's cost = the sum of the primitive units of work it produces.
// What each tool costs, and which tools exist at all, is model/tools.ts.

// anchored so a typical (~12-section, ~3-image) generation ≈ 40 credits
export const COST_UNITS = {
    plan: 3, // one outline / planning call
    section: 2, // one section written/regenerated/reasoned over
    image: 5, // one image generated (per variation)
    video: 100, // one 8s clip generated (Veo Fast ≈ 20 images' worth of provider cost)
    text: 1, // one text run rewritten/translated
    theme: 4, // one theme designed
    reply: 2, // one chat/summary reply
} as const;

export type CostUnit = keyof typeof COST_UNITS;

// What one credit stands for in provider spend. Derived, not chosen: a default 12-section deck
// measures at $0.0092 for the outline plus 12 × $0.0312 for the sections ≈ $0.384, and the unit
// table above bills it at 27 credits. Re-derive this whenever the default model or its price moves,
// or the two drift apart. Measured 2026-08-05 on gemini-3.5-flash.
export const CREDIT_USD = 0.0142;

/** Provider spend → credits. Floored at 1 so a real call is never free. */
export const creditsForUsd = (usd: number): number => Math.max(1, Math.round(usd / CREDIT_USD));

// what an action estimates, or what a run actually did
export type Usage = Partial<Record<CostUnit, number>>;

// A unit's price scales with what the model behind it costs us: the same section is ~6x the provider
// spend on Fable 5 as on the default Flash. Absent multipliers price everything at the baseline.
export type UnitRates = Partial<Record<CostUnit, number>>;

// Σ unit price × count × model rate, floored at 1 so nothing is free
export function costOf(usage: Usage, rates: UnitRates = {}): number {
    let sum = 0;
    for (const u of Object.keys(COST_UNITS) as CostUnit[])
        sum += COST_UNITS[u] * (usage[u] ?? 0) * (rates[u] ?? 1);
    return Math.max(1, Math.round(sum));
}

// human-readable breakdown for the credit ledger
export function describeUsage(usage: Usage): string {
    const parts = (Object.keys(COST_UNITS) as CostUnit[])
        .filter((u) => usage[u])
        .map((u) => `${usage[u]} ${u}${usage[u]! > 1 ? "s" : ""}`);
    return parts.join(" · ") || "—";
}

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
const UNIT_TASK: Record<CostUnit, AiTask | null> = {
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
): UnitRates {
    const out: UnitRates = {};
    for (const [unit, task] of Object.entries(UNIT_TASK) as [CostUnit, AiTask | null][]) {
        if (!task) continue;
        const id = taskModel(task);
        const rate = id ? rateFor(id) : undefined;
        if (rate && rate > 0 && rate !== 1) out[unit] = rate;
    }
    return out;
}
