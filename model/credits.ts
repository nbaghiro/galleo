// The metered-credit engine — the generic layer under AI pricing. Credits are not charged per *action*
// (a flat fee) but per *unit of work*: an action's cost is the sum of the primitive units it actually
// produced. A 20-section deck costs more than a 6-section one because it wrote more sections; translating a
// big doc costs more than a small one because it touched more text runs. New actions never need a bespoke
// price — they just declare which units they consume, and it all composes through `costOf`.
//
// One unit ≈ one model call's worth of work, so credits track real provider spend. Pure data + math; no IO.

// The atomic priced things. Tune the numbers here and every action's cost (and the pricing showcase) moves
// together. Anchored so a typical (~12-section, ~3-image) generation lands near 40 credits.
export const COST_UNITS = {
    plan: 3, // one outline / planning call
    section: 2, // one section written, regenerated, or reasoned over
    image: 5, // one image generated (per variation)
    text: 1, // one text run rewritten / translated
    theme: 4, // one theme designed
    reply: 2, // one chat / summary reply
} as const;

export type CostUnit = keyof typeof COST_UNITS;

// A bag of units — what an action estimates it will do, or what a run actually did.
export type Usage = Partial<Record<CostUnit, number>>;

// The credit cost of a usage bag: Σ unit price × count, floored at 1 so nothing is free.
export function costOf(usage: Usage): number {
    let sum = 0;
    for (const u of Object.keys(COST_UNITS) as CostUnit[]) sum += COST_UNITS[u] * (usage[u] ?? 0);
    return Math.max(1, Math.round(sum));
}

// Add usage bags together — how a runtime accumulates the true cost of a multi-step action (a generation
// = the outline usage + each section's usage + each image's usage), so the charge is exactly what ran.
export function mergeUsage(...usages: Usage[]): Usage {
    const out: Usage = {};
    for (const usage of usages)
        for (const u of Object.keys(COST_UNITS) as CostUnit[])
            if (usage[u]) out[u] = (out[u] ?? 0) + usage[u]!;
    return out;
}

// A human-readable breakdown ("1 plan · 12 sections · 3 images"), for the credit ledger's `reason`.
export function describeUsage(usage: Usage): string {
    const parts = (Object.keys(COST_UNITS) as CostUnit[])
        .filter((u) => usage[u])
        .map((u) => `${usage[u]} ${u}${usage[u]! > 1 ? "s" : ""}`);
    return parts.join(" · ") || "—";
}
