// The evaluation record: what a traced generation did, and what anyone (a check, a judge, a human)
// concluded about it. Eval references the types the runtime already owns — a span is @model/ai's
// ModelSpan, and what a run was asked to do is @model/artifact's GenMeta — so this file only
// defines concepts that are genuinely its own.

import type { ModelSpan } from "./ai";
import type { GenMeta } from "./artifact";

export type EvalStatus = "ok" | "error" | "aborted";

/** One deterministic check's verdict on one target. Cheap, and it never drifts. */
export interface EvalCheck {
    id: string;
    dimension: string;
    target: string; // "artifact" | "section:<id>"
    pass: boolean;
    detail?: string;
}

/** What the run was asked to do, kept beside the result so a run can be reproduced. */
export interface EvalConfig {
    kind: string; // turn kind: generate | plan | build
    meta: GenMeta; // the same record an artifact stores in ai_meta
}

export interface EvalRun {
    id: string;
    artifactId: string | null;
    config: EvalConfig;
    spans: ModelSpan[];
    checks: EvalCheck[];
    status: EvalStatus;
    error?: string | null;
    tokensIn: number;
    tokensOut: number;
    credits: number;
    ms: number;
    at: string; // ISO
    user: { name: string | null; email: string } | null;
}

/** A list row: everything but the spans, which dominate the payload. */
export type EvalRunSummary = Omit<EvalRun, "spans" | "checks"> & {
    spanCount: number;
    checksPassed: number;
    checksRun: number;
};

export const stepsOf = (spans: readonly ModelSpan[]): string[] => [
    ...new Set(spans.map((s) => s.step).filter(Boolean)),
];

export const spansForStep = (spans: readonly ModelSpan[], step: string): ModelSpan[] =>
    spans.filter((s) => s.step === step);

export const tokensOf = (spans: readonly ModelSpan[]): { input: number; output: number } =>
    spans.reduce((t, s) => ({ input: t.input + s.input, output: t.output + s.output }), {
        input: 0,
        output: 0,
    });
