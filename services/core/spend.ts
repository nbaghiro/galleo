import type { TurnKind, TurnRequest } from "@model/ai";
import type { CostUnit, UnitRates, Usage } from "@model/credits";
import type { MeterParams, ToolId } from "@model/tools";
import type { PlanBearer } from "@model/billing";
import { costOf, creditsForUsd, unitMultipliers } from "@model/credits";
import { reserveCost, sectionsForLength, usageFor } from "@model/tools";
import { featuresFor } from "@model/billing";
import { COST_MULTIPLIERS, modelFor, type ModelOverrides } from "./models";
import type { WorkspaceCreditFields } from "./ledger";
import { chargeCredits, settleCredits } from "./ledger";
import type { Meter, TokenUse } from "./ai/meter";
import { usdOf, withMeter } from "./ai/meter";

// AI spend policy: what a turn or a tool costs, and the reserve-then-settle protocol around it.
// The balance mechanics underneath are core/ledger.ts; the measurement it settles against is
// core/ai/meter.ts.

// Which priced tool each turn kind bills as.
export const ACTION_FOR: Record<TurnKind, ToolId> = {
    generate: "generate-artifact",
    edit: "revise-artifact",
    section: "add-section",
    chat: "ask-assistant",
    plan: "plan-outline",
    build: "add-section",
};

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

// the unit prices for this caller's picks; every metered route reserves and settles through it
export const ratesFor = (ws: PlanBearer, overrides: ModelOverrides): UnitRates =>
    unitMultipliers(
        (task) => modelFor(task, featuresFor(ws).textModelTier, overrides),
        (id) => COST_MULTIPLIERS[id],
    );

// One rule for every paid action: reserve the estimate up front, then owe what the work really did —
// the tokens it burned at provider list price, plus the assets it produced at their flat rate. A run
// that burned nothing and produced nothing owes nothing, so a failure refunds itself rather than
// needing a policy of its own.

/** Report flat-priced assets as they land; tokens are measured for you. */
type Produced = (units: Usage) => void;

type Reservation =
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
