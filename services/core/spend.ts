import type { CostUnit, UnitPrices, Usage } from "@model/credits";
import type { MeterParams, ToolId, ToolSurface } from "@model/tools";
import type { PlanBearer } from "@model/billing";
import type { WorkspaceRole } from "@model/workspace";
import { creditsForUsd, DEFAULT_UNIT_PRICES, taskForUsage, usdOfUsage } from "@model/credits";
import { gateCost, reserveCost, usageFor } from "@model/tools";
import { canTopUp, canUpgradeFrom, featuresFor, planFor } from "@model/billing";
import { capture } from "@services/utils/analytics";
import { unitPricesFor, type ModelOverrides } from "./models";
import type { WorkspaceCreditFields } from "./ledger";
import { chargeCredits, creditBalance, settleCredits, spendThisCycle } from "./ledger";
import type { Meter, TokenUse } from "./ai/meter";
import { usdOf, withMeter } from "./ai/meter";
import { noteCredits } from "./traces";

// AI spend policy: what a turn or a tool costs, and the reserve-then-settle protocol around it.
// The balance mechanics underneath are core/ledger.ts; the measurement it settles against is
// core/ai/meter.ts.

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
 * Report that a metered run started, then run it. Every priced action passes through here,
 * including the free ones, so a tool added later is measured the moment it runs. What the run did
 * is reported from its trace when it closes (core/traces.ts), where the settled cost and the real
 * tokens are known; this is the one place the estimate is.
 */
function measured<T>(
    r: Runner,
    estimate: number,
    usage: Usage,
    body: (meter: Meter) => Promise<T>,
    meter: Meter,
): Promise<T> {
    const task = taskForUsage(usage);
    capture(context(r), "ai_action_started", {
        tool_id: r.tool,
        tool_surface: r.surface,
        estimated_credits: estimate,
        ...(task ? { task } : {}),
    });
    return body(meter);
}

// A free tool never reaches the ledger: no row to write, no balance to lock, and nothing to settle
// against, so `owed` must not run either — it would bill the real tokens of a call we chose to give
// away. It is still measured, because a free action that fails is a reliability question.
const free = (r: Runner): Reservation => ({
    ok: true,
    settle: (run) => {
        const meter: Meter = { uses: [], extraUsd: 0, parts: new Map() };
        return measured(r, 0, {}, () => run(() => {}, meter), meter);
    },
});

/** Everything about the run other than who is making it, which is the part that keeps growing. */
export interface ReserveOptions {
    /** scales the estimate for metered tools */
    size?: MeterParams;
    /** prices the estimate against the models this caller pinned */
    prices?: UnitPrices;
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
        role = "member",
        surface = "direct",
    } = opts;
    const runner: Runner = { ws, userId, tool, surface };
    const usage = usageFor(tool, size);
    const cost = reserveCost(tool, size, prices);
    // What must be payable for the run to start: its own hold, or for a free doorway
    // (ToolMeta.gate) the priced step behind it, refused here before the doorway creates anything.
    const need = cost || gateCost(tool, prices);
    if (need === 0) return free(runner);
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
        if (spent + need > cap) {
            const remaining = Math.max(0, cap - spent);
            exhausted(runner, remaining, false);
            return { ok: false, remaining, capped: cap };
        }
    }
    if (cost === 0) {
        // gate only: answer the way a charge would, but hold nothing — the priced step
        // re-checks atomically when it runs, so a stale read here cannot overspend
        const balance = await creditBalance(ws);
        if (need > balance) {
            exhausted(runner, balance, true);
            return { ok: false, remaining: balance };
        }
        return free(runner);
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
            return withMeter((meter) =>
                measured(
                    runner,
                    cost,
                    usage,
                    async () => {
                        try {
                            return await run(produced, meter);
                        } finally {
                            // what the run really owed reaches the trace, so the event a reader sees
                            // and the ledger row cannot disagree
                            const delta = owed(meter.uses, made, meter.extraUsd, prices) - cost;
                            noteCredits(cost + delta);
                            await settleCredits(ws, entryId, delta, settledUsage(usage, made));
                        }
                    },
                    meter,
                ),
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
