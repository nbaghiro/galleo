// The evaluation record: what a traced generation did, and what anyone (a check, a judge, a human)
// concluded about it. Shared because the playground reads exactly what the backend writes.

/** One model call inside a run. `step` attributes it to a stage of the pipeline. */
export interface EvalSpan {
    modelId: string;
    input: number; // tokens
    output: number;
    step: string; // "brief" | "outline" | "plan-section" | "section:<beatId>" | "" when unlabelled
    ms: number;
    // present only on traced runs; prompt bodies are clipped at capture
    system?: string;
    prompt?: string;
    response?: string;
    temperature?: number;
    finishReason?: string;
}

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
    prompt: string;
    surface?: string;
    length?: string;
    imageSource?: string;
    theme?: string;
    models: Record<string, string>; // AiTask → resolved "provider:model"
}

export interface EvalRun {
    id: string;
    artifactId: string | null;
    config: EvalConfig;
    spans: EvalSpan[];
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

export const stepsOf = (spans: readonly EvalSpan[]): string[] => [
    ...new Set(spans.map((s) => s.step).filter(Boolean)),
];

export const spansForStep = (spans: readonly EvalSpan[], step: string): EvalSpan[] =>
    spans.filter((s) => s.step === step);

export const tokensOf = (spans: readonly EvalSpan[]): { input: number; output: number } =>
    spans.reduce((t, s) => ({ input: t.input + s.input, output: t.output + s.output }), {
        input: 0,
        output: 0,
    });
