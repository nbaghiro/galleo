import type { TurnKind, TurnRequest } from "@model/ai";
import type { MeterParams, ToolId, UnitRates } from "@model/credits";
import { sectionsForLength, unitMultipliers } from "@model/credits";
import type { PlanBearer } from "@model/billing";
import { featuresFor } from "@model/billing";
import { COST_MULTIPLIERS, modelFor, type ModelOverrides } from "../models";
import { AsyncLocalStorage } from "node:async_hooks";
import { getModel } from "../models";

// What a turn actually cost us. Every model call reports here through the provider middleware
// (`resolveModel`), so nothing has to be threaded down through RunOpts or remembered at a call site:
// a new call site is metered by construction.

export interface TokenUse {
    modelId: string;
    input: number;
    output: number;
}

export interface Meter {
    uses: TokenUse[];
}

const scope = new AsyncLocalStorage<Meter>();

/** Runs `fn` with a fresh meter in scope and hands it back alongside the result. */
export async function withMeter<T>(fn: (meter: Meter) => Promise<T>): Promise<T> {
    const meter: Meter = { uses: [] };
    return await scope.run(meter, () => fn(meter));
}

export function recordTokens(modelId: string, input: number, output: number): void {
    const meter = scope.getStore();
    if (!meter || (!input && !output)) return;
    meter.uses.push({ modelId, input, output });
}

/** Provider list price for what was used, in USD. Unknown models price at zero rather than guess. */
export function usdOf(uses: readonly TokenUse[]): number {
    let usd = 0;
    for (const u of uses) {
        const m = getModel(u.modelId);
        if (!m) continue;
        usd += (u.input / 1e6) * m.usd[0] + (u.output / 1e6) * m.usd[1];
    }
    return usd;
}

export const totalTokens = (uses: readonly TokenUse[]): { input: number; output: number } =>
    uses.reduce((t, u) => ({ input: t.input + u.input, output: t.output + u.output }), {
        input: 0,
        output: 0,
    });

// Which priced tool each turn kind bills as.
export const ACTION_FOR: Record<TurnKind, ToolId> = {
    generate: "generate-artifact",
    edit: "revise-artifact",
    section: "add-section",
    chat: "ask-assistant",
    plan: "plan-outline",
    build: "add-section",
};

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

// Others 501 before any charge (blocking here avoids reserving credits for an unbuildable kind).
export const IMPLEMENTED: readonly TurnKind[] = ["generate", "section", "chat", "plan", "build"];

// the unit prices for this caller's picks; every metered route reserves and settles through it
export const ratesFor = (ws: PlanBearer, overrides: ModelOverrides): UnitRates =>
    unitMultipliers(
        (task) => modelFor(task, featuresFor(ws).textModelTier, overrides),
        (id) => COST_MULTIPLIERS[id],
    );
