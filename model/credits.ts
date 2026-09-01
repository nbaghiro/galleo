// Metered credits. One rule prices everything: work is measured in dollars of provider spend, and
// credits = dollars / CREDIT_USD. An estimate is that formula on the units an action is expected to
// produce; a charge is the same formula on the units it really produced plus the tokens it really
// burned, so the two cannot disagree about what an action costs.
//
// What each tool is expected to produce is model/tools.ts. What a unit costs in dollars depends on
// the model that serves it, which is services/core/models.ts.

/** A primitive unit of work. What it costs is a dollar price per unit, never a fixed credit count. */
export type CostUnit =
    | "plan"
    | "section"
    | "image"
    | "video"
    | "text"
    | "theme"
    | "reply"
    | "speech"
    | "music";

// What a unit is called in the ledger, where the plural of the key is not a word: "9 speechs".
// Also the canonical unit list, so a new unit is one entry rather than several.
const UNIT_NOUN: Record<CostUnit, [one: string, many: string]> = {
    plan: ["plan", "plans"],
    section: ["section", "sections"],
    image: ["image", "images"],
    video: ["video", "videos"],
    text: ["text run", "text runs"],
    theme: ["theme", "themes"],
    reply: ["reply", "replies"],
    speech: ["1k characters spoken", "k characters spoken"],
    music: ["minute of music", "minutes of music"],
};

export const COST_UNITS_ALL = Object.keys(UNIT_NOUN) as CostUnit[];

/**
 * What one credit sells for, in dollars of provider spend. CHOSEN, not measured: it is the exchange
 * rate between what a run costs us and what we bill, so it is the margin dial rather than a fact
 * about any model.
 *
 *     margin = 1 - (CREDIT_USD / price per credit)
 *
 * Lowering it raises margin and bills more credits for the same work; raising it does the reverse.
 * Changing it moves every price, so it is a pricing decision rather than a fix.
 *
 * 0.0025 is the coarsest credit that still prices every action distinctly. Measured over the 21
 * priced actions: here none collapses to a single credit and the meter is within 2% of true cost on
 * average (7% worst); at 0.005 six actions collapse to one credit and the average error is 12%. A
 * coarser credit reads as smaller numbers and quietly reintroduces rounding loss on cheap work.
 */
export const CREDIT_USD = 0.0025;

/** Provider spend → credits. Floored at 1 so a real call is never free. */
export const creditsForUsd = (usd: number): number => Math.max(1, Math.round(usd / CREDIT_USD));

// what an action expects to produce, or what a run actually did
export type Usage = Partial<Record<CostUnit, number>>;

/** USD per unit for the models a run will actually use. A unit with no price contributes nothing. */
export type UnitPrices = Partial<Record<CostUnit, number>>;

/** What a bag of units costs in dollars. The one input to every credit figure in the product. */
export function usdOfUsage(usage: Usage, prices: UnitPrices): number {
    let usd = 0;
    for (const u of COST_UNITS_ALL) usd += (usage[u] ?? 0) * (prices[u] ?? 0);
    return usd;
}

// human-readable breakdown for the credit ledger
export function describeUsage(usage: Usage): string {
    const parts = COST_UNITS_ALL.filter((u) => usage[u]).map((u) => {
        const n = usage[u]!;
        const [one, many] = UNIT_NOUN[u];
        return u === "speech" ? (n === 1 ? one : `${n}${many}`) : `${n} ${n > 1 ? many : one}`;
    });
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
    | "theme"
    | "extract"; // reading uploaded files that need a model (images, scanned PDFs)

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
    "extract",
];

// Which task's model does the work a cost unit stands for. The media units run on their own models
// and have no text task, so they price per unit rather than per token.
const UNIT_TASK: Record<CostUnit, AiTask | null> = {
    plan: "outline",
    section: "section",
    text: "rewrite",
    theme: "theme",
    reply: "chat",
    image: null,
    video: null,
    speech: null,
    music: null,
};

/**
 * The task whose model does the bulk of a usage's work, for attributing a run to a model tier.
 * Weighted by what the units cost when prices are known, by count otherwise. Null when the work is
 * all media, which runs on models no task names.
 */
export function taskForUsage(usage: Usage, prices: UnitPrices = {}): AiTask | null {
    let best: AiTask | null = null;
    let heaviest = 0;
    for (const unit of COST_UNITS_ALL) {
        const task = UNIT_TASK[unit];
        const weight = (usage[unit] ?? 0) * (prices[unit] ?? 1);
        if (task && weight > heaviest) {
            heaviest = weight;
            best = task;
        }
    }
    return best;
}

/**
 * USD per unit for the models a run will use: text units from the model their task resolves to,
 * media units from the model that serves them. Both resolvers are injected because pricing a model
 * is a services concern and this layer imports none.
 */
export function unitPricesFrom(
    taskModel: (task: AiTask) => string | undefined,
    textPrice: (modelId: string, unit: CostUnit) => number | undefined,
    mediaPrice?: (unit: CostUnit) => number | undefined,
): UnitPrices {
    const out: UnitPrices = {};
    for (const unit of COST_UNITS_ALL) {
        const task = UNIT_TASK[unit];
        const id = task ? taskModel(task) : undefined;
        const usd = task ? (id ? textPrice(id, unit) : undefined) : mediaPrice?.(unit);
        if (usd !== undefined && usd > 0) out[unit] = usd;
    }
    return out;
}

/**
 * Unit prices on the model every task defaults to, so this layer can price its own copy (the plan
 * cards name how many generations an allowance buys) without reaching into services. A mirror, not
 * a second source of truth: services/core/models.ts computes the real table and a test there pins
 * these equal to it.
 */
export const DEFAULT_UNIT_PRICES: UnitPrices = {
    plan: 0.0190455,
    section: 0.0181605,
    text: 0.00735,
    theme: 0.01875,
    reply: 0.0192,
    image: 0.071,
    video: 1.42,
    speech: 0.1,
    music: 0.15,
};
