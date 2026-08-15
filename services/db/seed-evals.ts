import type { ModelSpan } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { EvalConfig, EvalJudgement, EvalStatus } from "@model/eval";
import { EVAL_PROMPT_PARTS, EVAL_PROMPT_TEXTS } from "./seed-eval-data";

/** A captured span with the bulky bodies lifted into the shared tables in seed-eval-data.ts. */
export interface SeedSpan {
    modelId: string;
    input: number;
    output: number;
    step: string;
    ms: number;
    systemRef?: string;
    partsRef?: string;
    prompt?: string;
    response?: string;
    temperature?: number;
    finishReason?: string;
}

export interface SeedEvalRun {
    id: string;
    role: string; // why this run is in the set, for whoever reads the fixture next
    minutesAgo: number; // createdAt offset, so the list reads as a week of work rather than one instant
    config: EvalConfig;
    spans: SeedSpan[];
    content: ArtifactContent | null;
    judgements: EvalJudgement[];
    status: EvalStatus;
    error: string | null;
    credits: number;
    ms: number;
}

/**
 * Rebuilds the spans the playground reads. `stack()` joins fragments with a blank line and nothing
 * else, so a span that carries parts needs no stored system prompt.
 */
export function spansOf(run: SeedEvalRun): ModelSpan[] {
    return run.spans.map((s) => {
        const parts = s.partsRef ? EVAL_PROMPT_PARTS[s.partsRef] : undefined;
        const system = parts
            ? parts.map((p) => p.text).join("\n\n")
            : s.systemRef
              ? EVAL_PROMPT_TEXTS[s.systemRef]
              : undefined;
        return {
            modelId: s.modelId,
            input: s.input,
            output: s.output,
            step: s.step,
            ms: s.ms,
            ...(system ? { system } : {}),
            ...(parts ? { parts } : {}),
            ...(s.prompt ? { prompt: s.prompt } : {}),
            ...(s.response ? { response: s.response } : {}),
            ...(s.temperature === undefined ? {} : { temperature: s.temperature }),
            ...(s.finishReason ? { finishReason: s.finishReason } : {}),
        };
    });
}

export interface EvalTarget {
    workspaceId: string;
    userId: string;
    plan: string;
}

export interface EvalDeal {
    target: EvalTarget;
    run: SeedEvalRun;
}

// A free workspace has not burned credits on traced generation, so it gets none; premium carries
// the most because that is where the demo account (the only one the eval routes admit) lives.
const SHARE: Record<string, number> = { premium: 3, pro: 2, free: 0 };
const shareOf = (plan: string): number => SHARE[plan] ?? 0;

/**
 * Assigns each run to exactly one workspace. Partition rather than broadcast: two workspaces never
 * show the same prompt, and the payload is written once per run however many workspaces exist.
 *
 * Callers must pass only workspaces demo@galleo.app belongs to — every eval route reads the current
 * workspace and admits that account alone, so a run anywhere else is unreachable.
 */
export function dealEvalRuns(
    targets: readonly EvalTarget[],
    runs: readonly SeedEvalRun[],
): EvalDeal[] {
    const eligible = [...targets]
        .filter((t) => shareOf(t.plan) > 0)
        .sort(
            (a, b) =>
                shareOf(b.plan) - shareOf(a.plan) || a.workspaceId.localeCompare(b.workspaceId),
        );
    if (!eligible.length) return [];
    // Interleaved, not blocked: a blocked wheel (aaa bbb cc) hands every run to the heaviest
    // workspace when there are fewer runs than slots, so the lightest never gets one at all.
    const wheel: EvalTarget[] = [];
    const widest = Math.max(...eligible.map((t) => shareOf(t.plan)));
    for (let pass = 0; pass < widest; pass++)
        for (const t of eligible) if (shareOf(t.plan) > pass) wheel.push(t);
    return runs.flatMap((run, i) => {
        const target = wheel[i % wheel.length];
        return target ? [{ target, run }] : [];
    });
}
