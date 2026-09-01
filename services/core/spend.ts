import type { TurnKind, TurnRequest } from "@model/ai";
import type { CostUnit, UnitPrices, Usage } from "@model/credits";
import type { MeterParams, ToolId, ToolSurface } from "@model/tools";
import type { PlanBearer } from "@model/billing";
import type { WorkspaceRole } from "@model/workspace";
import { creditsForUsd, DEFAULT_UNIT_PRICES, taskForUsage, usdOfUsage } from "@model/credits";
import { ACTION_FOR, reserveCost, sectionsForLength, usageFor } from "@model/tools";
export { ACTION_FOR };
import { canTopUp, canUpgradeFrom, featuresFor, planFor } from "@model/billing";
import type { AiFailureReason } from "@model/analytics";
import { capture } from "@services/utils/analytics";
import { unitPricesFor, type ModelOverrides } from "./models";
import type { WorkspaceCreditFields } from "./ledger";
import { chargeCredits, settleCredits, spendThisCycle } from "./ledger";
import type { Meter, TokenUse } from "./ai/meter";
import { usdOf, withMeter } from "./ai/meter";

// AI spend policy: what a turn or a tool costs, and the reserve-then-settle protocol around it.
// The balance mechanics underneath are core/ledger.ts; the measurement it settles against is
// core/ai/meter.ts.

// Others 501 before any charge (blocking here avoids reserving credits for an unbuildable kind).
export const IMPLEMENTED: readonly TurnKind[] = ["generate", "section", "chat", "plan", "build"];

// Only generate scales; the plan's section cap clamps the metered size, so a Free "In-depth" brief
// is billed for (and gets) 10 sections.
export const meterFor = (req: TurnRequest, maxSections?: number): MeterParams =>
    req.kind === "generate"
        ? {
              length: req.input.length,
              imageSource: req.input.imageSource,
              ...(maxSections
                  ? { sections: Math.min(sectionsForLength(req.input.length), maxSections) }
                  : {}),
          }
        : {};

// The dollar price of every unit for this caller's picks, text and media alike. Every metered route
// reserves and settles through it, so the model that served the work is what the credits reflect.
export const pricesFor = (ws: PlanBearer, overrides: ModelOverrides): UnitPrices =>
    unitPricesFor(featuresFor(ws).textModelTier, overrides);

// One rule for every paid action: reserve the estimate up front, then owe what the work really did —
// the tokens it burned at provider list price, plus the assets it produced at their flat rate. A run
// that burned nothing and produced nothing owes nothing, so a failure refunds itself rather than
// needing a policy of its own.

/** Report flat-priced assets as they land; tokens are measured for you. */
type Produced = (units: Usage) => void;

type Reservation =
    | { ok: false; remaining: number; capped?: number }
    | {
          ok: true;
          // the meter is handed back so a caller that asked to trace can read the spans it collected
          settle: <T>(run: (produced: Produced, meter: Meter) => Promise<T>) => Promise<T>;
      };

// Who ran what, so the three ai_action_* events can be attributed without threading a context down.
interface Runner {
    ws: WorkspaceCreditFields;
    userId: string;
    tool: ToolId;
    // Where the call arrived, not where the catalog says the tool can be reached: every tool the
    // MCP server exposes also declares "agent", so reading the declaration made a run from a
    // desktop client indistinguishable from one in the app's chat rail.
    surface: ToolSurface;
}

// The model that did most of the writing. A turn can touch several, and output tokens are what the
// work actually was, so the biggest producer is the one a latency or failure belongs to.
const dominantModel = (uses: readonly TokenUse[]): string | undefined =>
    uses.reduce<TokenUse | undefined>((a, b) => (!a || b.output > a.output ? b : a), undefined)
        ?.modelId;

// Provider wording is all we get back, so the reason is read off it. Order matters: first match wins.
const REASONS: [RegExp, AiFailureReason, boolean][] = [
    [/abort|cancell?ed/i, "aborted", false],
    [/rate.?limit|429|overloaded|quota exceeded/i, "rate_limited", true],
    [/timed out|timeout|ETIMEDOUT|deadline/i, "timeout", true],
    [/did not match schema|no object generated|grammar compilation/i, "invalid_output", true],
    [/no credits|insufficient[_ ]quota|payment/i, "no_credits", false],
];

const failure = (e: unknown): [AiFailureReason, boolean] => {
    const message = e instanceof Error ? e.message : String(e);
    const hit = REASONS.find(([re]) => re.test(message));
    return hit ? [hit[1], hit[2]] : ["provider_error", true];
};

const context = (r: Runner) => ({ userId: r.userId, workspaceId: r.ws.id });

// One of the two places the product tells a user no. A member over their own ceiling is a different
// wall from an empty pool: neither remedy applies, because the pool may be full and only an admin
// can raise the cap, so `offer` says whether there is anything to sell.
function exhausted(r: Runner, remaining: number, offer: boolean): void {
    const plan = planFor(r.ws.plan).id;
    capture(context(r), "credits_exhausted", {
        plan_id: plan,
        blocked_tool_id: r.tool,
        upgrade_offered: offer && canUpgradeFrom(plan),
        topup_offered: offer && canTopUp(plan),
        credits_remaining: remaining,
    });
}

/**
 * Wrap one metered run so it reports start, completion and failure.
 *
 * Every priced action passes through here, including the free ones, so a tool added later is
 * measured the moment it runs rather than when somebody remembers to instrument it. `charged`
 * reads the settled cost after the fact, since a run only owes what it really did.
 */
async function measured<T>(
    r: Runner,
    estimate: number,
    usage: Usage,
    body: (meter: Meter) => Promise<T>,
    meter: Meter,
    charged: () => number,
): Promise<T> {
    const task = taskForUsage(usage);
    capture(context(r), "ai_action_started", {
        tool_id: r.tool,
        tool_surface: r.surface,
        estimated_credits: estimate,
        ...(task ? { task } : {}),
    });
    const startedAt = Date.now();
    try {
        const result = await body(meter);
        const tokens = meter.uses.reduce(
            (a, u) => ({ input: a.input + u.input, output: a.output + u.output }),
            { input: 0, output: 0 },
        );
        capture(context(r), "ai_action_completed", {
            tool_id: r.tool,
            credits_charged: charged(),
            ms: Date.now() - startedAt,
            input_tokens: tokens.input,
            output_tokens: tokens.output,
            cached: false,
            ...(task ? { task } : {}),
            ...(dominantModel(meter.uses) ? { model_id: dominantModel(meter.uses) } : {}),
        });
        return result;
    } catch (e) {
        const [reason, retryable] = failure(e);
        capture(context(r), "ai_action_failed", {
            tool_id: r.tool,
            ms: Date.now() - startedAt,
            reason,
            retryable,
            ...(task ? { task } : {}),
            ...(dominantModel(meter.uses) ? { model_id: dominantModel(meter.uses) } : {}),
        });
        throw e;
    }
}

// A free tool never reaches the ledger: no row to write, no balance to lock, and nothing to settle
// against, so `owed` must not run either — it would bill the real tokens of a call we chose to give
// away. It is still measured, because a free action that fails is a reliability question.
const free = (r: Runner): Reservation => ({
    ok: true,
    settle: (run) => {
        const meter: Meter = { uses: [], extraUsd: 0, parts: new Map(), trace: false };
        return measured(
            r,
            0,
            {},
            () => run(() => {}, meter),
            meter,
            () => 0,
        );
    },
});

/** Everything about the run other than who is making it, which is the part that keeps growing. */
export interface ReserveOptions {
    /** scales the estimate for metered tools */
    size?: MeterParams;
    /** prices the estimate against the models this caller pinned */
    prices?: UnitPrices;
    /** an eval admin asked for this run to be recorded */
    trace?: boolean;
    /** members are capped, admins and owners are not */
    role?: WorkspaceRole;
    /**
     * Where the call arrived, which is what the ai_action_* events report. The executor passes the
     * surface its caller used; everything else that reserves is an HTTP route, so it says so.
     */
    surface?: ToolSurface;
}

/**
 * Hold the estimated cost of `tool`, then settle it against real usage.
 *
 * The returned `settle` opens the token meter, so every model call underneath is counted without
 * being threaded through, and reconciles in a `finally`: an error still bills the tokens already
 * spent, and an abort mid-stream settles what landed. The reconcile rewrites the charge's own
 * ledger row, so one action stays one line of history.
 *
 * Tools with no price reserve nothing and are handed a settle that only runs the work.
 */
export async function reserve(
    ws: WorkspaceCreditFields,
    userId: string,
    tool: ToolId,
    opts: ReserveOptions = {},
): Promise<Reservation> {
    const {
        size = {},
        // a caller that forgets still bills the default model's real cost, not the bare floor
        prices = DEFAULT_UNIT_PRICES,
        trace = false,
        role = "member",
        surface = "direct",
    } = opts;
    const runner: Runner = { ws, userId, tool, surface };
    const usage = usageFor(tool, size);
    const cost = reserveCost(tool, size, prices);
    if (cost === 0) return free(runner);
    // The per-member ceiling, checked before the balance: the pool is shared and the owner is the
    // only one who can refill it, so one member cannot spend the whole month. Admins run the
    // workspace and are not capped. Checked against the estimate, so a run that would cross the cap
    // never starts rather than being cut off mid-stream.
    const cap = ws.memberCreditCap;
    if (role === "member" && cap != null && cap >= 0 && ws.creditsStartedAt) {
        const spent = await spendThisCycle(
            { id: ws.id, creditsStartedAt: ws.creditsStartedAt },
            userId,
        );
        if (spent + cost > cap) {
            const remaining = Math.max(0, cap - spent);
            exhausted(runner, remaining, false);
            return { ok: false, remaining, capped: cap };
        }
    }
    const held = await chargeCredits(ws, cost, tool, userId, usage);
    if (!held.ok || !held.entryId) {
        exhausted(runner, held.remaining, true);
        return { ok: false, remaining: held.remaining };
    }
    const entryId = held.entryId;
    return {
        ok: true,
        settle: (run) => {
            const made: Usage = {};
            const produced: Produced = (units) => {
                for (const [unit, n] of Object.entries(units) as [CostUnit, number][])
                    made[unit] = (made[unit] ?? 0) + n;
            };
            // What the run really owed, read after the settle rather than recomputed, so analytics
            // and the ledger cannot disagree and the ledger is the one customers see.
            let settled = cost;
            return withMeter(
                (meter) =>
                    measured(
                        runner,
                        cost,
                        usage,
                        async () => {
                            try {
                                return await run(produced, meter);
                            } finally {
                                const delta = owed(meter.uses, made, meter.extraUsd, prices) - cost;
                                settled = cost + delta;
                                await settleCredits(ws, entryId, delta, settledUsage(usage, made));
                            }
                        },
                        meter,
                        () => settled,
                    ),
                trace,
            );
        },
    };
}

/**
 * The charge row's usage is the estimate; the units a run reported replace theirs and unreported
 * units keep the estimate, so a token-billed section count survives while a cached synthesis stops
 * claiming characters it never spoke. undefined = unchanged, null = nothing real to describe.
 */
export function settledUsage(estimate: Usage, made: Usage): Usage | null | undefined {
    const reported = Object.keys(made) as CostUnit[];
    if (!reported.length) return undefined;
    const actual: Usage = { ...estimate };
    for (const unit of reported) {
        if (made[unit]) actual[unit] = made[unit];
        else delete actual[unit];
    }
    const units = Object.keys(actual) as CostUnit[];
    const unchanged =
        units.length === Object.keys(estimate).length &&
        units.every((u) => actual[u] === estimate[u]);
    if (unchanged) return undefined;
    return units.length ? actual : null;
}

/**
 * What a finished run owes: everything it spent, in dollars, converted once. Tokens price at the
 * model that burned them and produced units at the model that made them, so an asset from a dearer
 * media model settles dearer.
 *
 * `creditsForUsd` floors at 1 so a real call is never free; a run that spent nothing at all has to
 * reach zero instead, or a failure before the first token would bill for doing nothing.
 */
export function owed(
    uses: readonly TokenUse[],
    made: Usage,
    extraUsd = 0,
    prices: UnitPrices = DEFAULT_UNIT_PRICES,
): number {
    const usd = usdOf(uses) + usdOfUsage(made, prices) + extraUsd;
    return usd > 0 ? creditsForUsd(usd) : 0;
}
