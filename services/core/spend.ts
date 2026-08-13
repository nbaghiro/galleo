import type { CostUnit, UnitRates, Usage } from "@model/credits";
import type { MeterParams, ToolId } from "@model/tools";
import { costOf, creditsForUsd } from "@model/credits";
import { reserveCost, usageFor } from "@model/tools";
import type { WorkspaceCreditFields } from "./credits";
import { chargeCredits, settleCredits } from "./credits";
import type { Meter, TokenUse } from "./ai/meter";
import { usdOf, withMeter } from "./ai/meter";

// One rule for every paid action: reserve the estimate up front, then owe what the work really did —
// the tokens it burned at provider list price, plus the assets it produced at their flat rate. A run
// that burned nothing and produced nothing owes nothing, so a failure refunds itself rather than
// needing a policy of its own.

/** Report flat-priced assets as they land; tokens are measured for you. */
export type Produced = (units: Usage) => void;

export type Reservation =
    | { ok: false; remaining: number }
    | {
          ok: true;
          // the meter is handed back so a caller that asked to trace can read the spans it collected
          settle: <T>(run: (produced: Produced, meter: Meter) => Promise<T>) => Promise<T>;
      };

// A free tool never reaches the ledger: no row to write, no balance to lock, and nothing to settle
// against, so `owed` must not run either — it would bill the real tokens of a call we chose to give
// away.
const FREE: Reservation = {
    ok: true,
    settle: (run) => run(() => {}, { uses: [], extraUsd: 0, trace: false }),
};

/**
 * Hold the estimated cost of `tool`, then settle it against real usage.
 *
 * `size` scales the estimate for metered tools, `rates` prices it against the models this caller
 * pinned. The returned `settle` opens the token meter, so every model call underneath is counted
 * without being threaded through, and reconciles in a `finally`: an error still bills the tokens
 * already spent, and an abort mid-stream settles what landed. The reconcile rewrites the charge's
 * own ledger row, so one action stays one line of history.
 *
 * Tools with no price reserve nothing and are handed a settle that only runs the work.
 */
export async function reserve(
    ws: WorkspaceCreditFields,
    userId: string,
    tool: ToolId,
    size: MeterParams = {},
    rates: UnitRates = {},
    trace = false,
): Promise<Reservation> {
    const cost = reserveCost(tool, size, rates);
    if (cost === 0) return FREE;
    const held = await chargeCredits(ws, cost, tool, userId, usageFor(tool, size));
    if (!held.ok || !held.entryId) return { ok: false, remaining: held.remaining };
    const entryId = held.entryId;
    return {
        ok: true,
        settle: (run) => {
            const made: Usage = {};
            const produced: Produced = (units) => {
                for (const [unit, n] of Object.entries(units) as [CostUnit, number][])
                    made[unit] = (made[unit] ?? 0) + n;
            };
            return withMeter(async (meter) => {
                try {
                    return await run(produced, meter);
                } finally {
                    const delta = owed(meter.uses, made, meter.extraUsd) - cost;
                    await settleCredits(ws, entryId, delta, held.fromBonus);
                }
            }, trace);
        },
    };
}

/**
 * What a finished run owes: its tokens at provider list price plus the assets it produced.
 *
 * `creditsForUsd` and `costOf` each floor at 1 so a real call is never free; nothing at all is a
 * different case and has to stay at zero, or a run that failed before its first token would bill
 * 2 credits for doing nothing.
 */
export function owed(uses: readonly TokenUse[], made: Usage, extraUsd = 0): number {
    const usd = usdOf(uses) + extraUsd;
    const assets = Object.values(made).some((n) => n > 0) ? costOf(made) : 0;
    return (usd > 0 ? creditsForUsd(usd) : 0) + assets;
}
