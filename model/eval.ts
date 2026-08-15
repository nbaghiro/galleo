// The evaluation record: what a traced generation did, and what anyone (a check, a judge, a human)
// concluded about it. Eval references the types the runtime already owns — a span is @model/ai's
// ModelSpan, and what a run was asked to do is @model/artifact's GenMeta — so this file only
// defines concepts that are genuinely its own.

import type { ModelSpan } from "./ai";
import type { ArtifactContent, GenMeta, Section } from "./artifact";

export type EvalStatus = "ok" | "error" | "aborted";

/**
 * What a check is about. Owned here because checks come from two places: the structural ones run in
 * services over the section tree, the layout ones run wherever the engine does.
 */
export type CheckDimension = "content" | "structure" | "variety" | "layout";

/** One deterministic check's verdict on one target. Cheap, and it never drifts. */
export interface EvalCheck {
    id: string;
    dimension: CheckDimension;
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
    judgements: EvalJudgement[];
    // what the run produced, so a later rubric or render costs no regeneration
    content: ArtifactContent | null;
    status: EvalStatus;
    error?: string | null;
    tokensIn: number;
    tokensOut: number;
    credits: number;
    ms: number;
    at: string; // ISO
    user: { name: string | null; email: string } | null;
}

// The judge's dimensions are editorial, distinct from the mechanical ones a check covers.
export type JudgeDimension = "specificity" | "arc" | "voice" | "craft";

/**
 * One binary question. Always phrased so that yes is good, which removes a whole class of
 * inversion bugs and makes a disagreement with a human arguable in plain language.
 */
export interface RubricQuestion {
    id: string;
    dimension: JudgeDimension;
    scope: "outline" | "section";
    ask: string;
}

export interface Rubric {
    version: string;
    judgeModel: string; // pinned: the same judge scores differently across model releases
    questions: RubricQuestion[];
}

/** One judge's answers for one target. */
export interface EvalJudgement {
    target: string; // "outline" | "section:<id>"
    rubricVersion: string;
    model: string;
    answers: { id: string; yes: boolean; why: string }[];
    at: string;
}

export const scoreOf = (j: EvalJudgement): number =>
    j.answers.length ? j.answers.filter((a) => a.yes).length / j.answers.length : 0;

/** Questions both judges answered but disagreed on: the queue a human should look at first. */
export function disagreements(a: EvalJudgement, b: EvalJudgement): string[] {
    const byId = new Map(b.answers.map((x) => [x.id, x.yes]));
    return a.answers.filter((x) => byId.has(x.id) && byId.get(x.id) !== x.yes).map((x) => x.id);
}

/** A list row: everything but the spans, which dominate the payload. */
export type EvalRunSummary = Omit<EvalRun, "spans" | "checks" | "content" | "judgements"> & {
    spanCount: number;
    checksPassed: number;
    checksRun: number;
    // the ids that failed, not the checks themselves: a row can name the failure without the bodies
    failedChecks: string[];
    judgedTargets: number;
    judgeScore: number | null; // mean over judged targets; null when nothing was judged
    // the shape of what was produced: one entry per section, enough to mark a strip and no more
    sections: SectionMark[];
    // the opening sections themselves, so a row can show what was made rather than describe it
    lead: Section[];
};

/**
 * How many real sections a list row carries. The row paints all of them in a strip that scrolls, so
 * this bounds the list payload (each is a full section tree), not the layout.
 */
export const LEAD_SECTIONS = 12;

/** A section reduced to what a list row can show: how it scored and whether anything failed on it. */
export interface SectionMark {
    id: string;
    score: number | null; // the judge's yes-share for this section; null when unjudged
    failed: string[]; // ids of the checks that failed on it, so a tooltip can name them
}

/** What a page of rows says as a whole. Pure, so the strip above the list is not a second truth. */
export interface EvalRollup {
    runs: number;
    failing: number; // runs with at least one failed check
    checksRun: number;
    checksPassed: number;
    judged: number;
    judgeScore: number | null;
    medianMs: number;
    tokensIn: number;
    tokensOut: number;
}

export function rollup(runs: readonly EvalRunSummary[]): EvalRollup {
    const judged = runs.filter((r) => r.judgeScore !== null);
    return {
        runs: runs.length,
        failing: runs.filter((r) => r.checksRun > r.checksPassed).length,
        checksRun: runs.reduce((n, r) => n + r.checksRun, 0),
        checksPassed: runs.reduce((n, r) => n + r.checksPassed, 0),
        judged: judged.length,
        judgeScore: judged.length
            ? judged.reduce((n, r) => n + (r.judgeScore ?? 0), 0) / judged.length
            : null,
        medianMs: median(runs.map((r) => r.ms)),
        tokensIn: runs.reduce((n, r) => n + r.tokensIn, 0),
        tokensOut: runs.reduce((n, r) => n + r.tokensOut, 0),
    };
}

/** Latency is long-tailed, so the strip reports the middle rather than a mean a single retry skews. */
export function median(ns: readonly number[]): number {
    if (!ns.length) return 0;
    const sorted = [...ns].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

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

/** Rough token count for a prompt fragment: ~4 chars per token. Labelled approximate in the UI. */
export const approxTokens = (text: string): number => Math.round(text.length / 4);
