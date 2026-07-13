// Metered credits: an action's cost = the sum of the primitive units of work it produces.

// anchored so a typical (~12-section, ~3-image) generation ≈ 40 credits
export const COST_UNITS = {
    plan: 3, // one outline / planning call
    section: 2, // one section written/regenerated/reasoned over
    image: 5, // one image generated (per variation)
    text: 1, // one text run rewritten/translated
    theme: 4, // one theme designed
    reply: 2, // one chat/summary reply
} as const;

export type CostUnit = keyof typeof COST_UNITS;

// what an action estimates, or what a run actually did
export type Usage = Partial<Record<CostUnit, number>>;

// Σ unit price × count, floored at 1 so nothing is free
export function costOf(usage: Usage): number {
    let sum = 0;
    for (const u of Object.keys(COST_UNITS) as CostUnit[]) sum += COST_UNITS[u] * (usage[u] ?? 0);
    return Math.max(1, Math.round(sum));
}

// add usage bags together
export function mergeUsage(...usages: Usage[]): Usage {
    const out: Usage = {};
    for (const usage of usages)
        for (const u of Object.keys(COST_UNITS) as CostUnit[])
            if (usage[u]) out[u] = (out[u] ?? 0) + usage[u]!;
    return out;
}

// human-readable breakdown for the credit ledger
export function describeUsage(usage: Usage): string {
    const parts = (Object.keys(COST_UNITS) as CostUnit[])
        .filter((u) => usage[u])
        .map((u) => `${usage[u]} ${u}${usage[u]! > 1 ? "s" : ""}`);
    return parts.join(" · ") || "—";
}
