import type { ModelSpan, PromptPart } from "@model/ai";
import { AsyncLocalStorage } from "node:async_hooks";
import { getModel } from "../models";

// What a turn actually did. Every model call reports here through the provider middleware, so
// nothing has to be threaded down through RunOpts or remembered at a call site: a new call site is
// measured by construction. Measurement only — what it costs in credits is core/spend.ts.

export interface TokenUse {
    modelId: string;
    input: number;
    output: number;
}

// A ModelSpan IS a TokenUse structurally, so billing keeps reading `uses` unchanged; the trace-only
// fields are filled when tracing is on, since prompt bodies dwarf everything else in the record.
export type Span = ModelSpan;

export interface Meter {
    uses: Span[];
    // Prompt fragments keyed by the text they assembled into. Keyed by text rather than by step
    // because a prompt is usually built before its step opens, and two steps may build in parallel.
    parts: Map<string, PromptPart[]>;
    // model spend that has no per-token registry price (embeddings); folded into the settle as-is
    extraUsd: number;
    trace: boolean;
}

const scope = new AsyncLocalStorage<Meter>();
// separate scope so concurrent steps cannot overwrite each other's label
const stepScope = new AsyncLocalStorage<string>();

/** Runs `fn` with a fresh meter in scope and hands it back alongside the result. */
export async function withMeter<T>(fn: (meter: Meter) => Promise<T>, trace = false): Promise<T> {
    const meter: Meter = { uses: [], extraUsd: 0, parts: new Map(), trace };
    return await scope.run(meter, () => fn(meter));
}

/** Labels every model call made inside `fn`, so a span can be attributed to a pipeline step. */
export function withStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
    return stepScope.run(step, fn);
}

export const tracing = (): boolean => scope.getStore()?.trace ?? false;

/** Called by the prompt builders when tracing; the assembled text is the key. */
export function recordParts(assembled: string, parts: PromptPart[]): void {
    const meter = scope.getStore();
    if (meter?.trace && assembled) meter.parts.set(assembled, parts);
}

/** The fragments a given system prompt was assembled from, if its builder labelled them. */
export const partsOf = (assembled: string | undefined): PromptPart[] | undefined =>
    assembled ? scope.getStore()?.parts.get(assembled) : undefined;

export function recordTokens(modelId: string, input: number, output: number): void {
    record({ modelId, input, output, step: stepScope.getStore() ?? "", ms: 0 });
}

/** The full record for one call; `recordTokens` is the billing-only shorthand. */
export function record(span: Span): void {
    const meter = scope.getStore();
    if (!meter || (!span.input && !span.output)) return;
    meter.uses.push({ ...span, step: span.step || (stepScope.getStore() ?? "") });
}

/** Spend priced at the call site (embeddings — no registry entry to price their tokens). */
export function recordUsd(usd: number): void {
    const meter = scope.getStore();
    if (meter && usd > 0) meter.extraUsd += usd;
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
