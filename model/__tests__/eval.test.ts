import { describe, expect, it } from "vitest";
import type { ModelSpan } from "@model/ai";
import type { EvalRunSummary } from "@model/eval";
import { median, rollup, spansForStep, stepsOf, tokensOf } from "@model/eval";

const span = (step: string, input = 10, output = 5): ModelSpan => ({
    modelId: "google:gemini-3.5-flash",
    input,
    output,
    step,
    ms: 100,
});

const RUN: ModelSpan[] = [
    span("brief"),
    span("outline", 1861, 715),
    span("section:b1"),
    span("section:b1", 20, 9), // a retry: same step, second call
    span("section:b2"),
    span(""), // unattributed
];

describe("stepsOf", () => {
    it("lists each step once, in the order it first ran", () => {
        expect(stepsOf(RUN)).toEqual(["brief", "outline", "section:b1", "section:b2"]);
    });

    it("drops unattributed calls rather than showing an empty step", () => {
        expect(stepsOf(RUN)).not.toContain("");
    });
});

describe("spansForStep", () => {
    it("keeps every call a step made, so a retry is visible", () => {
        expect(spansForStep(RUN, "section:b1")).toHaveLength(2);
    });

    it("returns nothing for a step that never ran", () => {
        expect(spansForStep(RUN, "section:b9")).toEqual([]);
    });
});

describe("tokensOf", () => {
    it("totals a run across every step", () => {
        expect(tokensOf(RUN)).toEqual({ input: 1921, output: 744 });
    });

    it("totals an empty run at zero rather than throwing", () => {
        expect(tokensOf([])).toEqual({ input: 0, output: 0 });
    });

    it("can be scoped to one step, which is how a step's cost is shown", () => {
        expect(tokensOf(spansForStep(RUN, "outline"))).toEqual({ input: 1861, output: 715 });
    });
});

const row = (over: Partial<EvalRunSummary> = {}): EvalRunSummary => ({
    id: "r1",
    artifactId: null,
    config: {
        kind: "generate",
        meta: { at: "2026-01-01T00:00:00Z", models: {}, prompt: "p", surface: "deck" },
    },
    status: "ok",
    tokensIn: 100,
    tokensOut: 10,
    credits: 0,
    ms: 1000,
    at: "2026-01-01T00:00:00Z",
    user: null,
    spanCount: 3,
    checksPassed: 4,
    checksRun: 4,
    failedChecks: [],
    judgedTargets: 0,
    sections: [],
    lead: [],
    judgeScore: null,
    ...over,
});

describe("median", () => {
    it("is zero for nothing rather than NaN", () => {
        expect(median([])).toBe(0);
    });

    it("takes the middle of an odd count, whatever the input order", () => {
        expect(median([9, 1, 5])).toBe(5);
    });

    it("averages the two middles of an even count", () => {
        expect(median([1, 2, 3, 10])).toBe(2.5);
    });
});

describe("rollup", () => {
    it("counts a run as failing when any check failed, not when any check ran", () => {
        const runs = [
            row({ id: "a", checksRun: 4, checksPassed: 4 }),
            row({ id: "b", checksRun: 6, checksPassed: 4, failedChecks: ["stacked-text"] }),
        ];
        expect(rollup(runs).failing).toBe(1);
        expect(rollup(runs).checksRun).toBe(10);
        expect(rollup(runs).checksPassed).toBe(8);
    });

    it("averages the judge over judged runs only, so an unjudged run is not a zero", () => {
        const r = rollup([row({ judgeScore: 1 }), row({ judgeScore: 0.5 }), row()]);
        expect(r.judged).toBe(2);
        expect(r.judgeScore).toBe(0.75);
    });

    it("reports no judge score at all when nothing was judged", () => {
        expect(rollup([row(), row()]).judgeScore).toBeNull();
    });

    it("reports the median run time, which one slow retry must not drag", () => {
        expect(rollup([row({ ms: 1000 }), row({ ms: 2000 }), row({ ms: 90_000 })]).medianMs).toBe(
            2000,
        );
    });

    it("totals tokens across the page", () => {
        const r = rollup([row(), row({ tokensIn: 400, tokensOut: 40 })]);
        expect(r.tokensIn).toBe(500);
        expect(r.tokensOut).toBe(50);
    });

    it("returns an empty rollup rather than throwing on no runs", () => {
        expect(rollup([])).toEqual({
            runs: 0,
            failing: 0,
            checksRun: 0,
            checksPassed: 0,
            judged: 0,
            judgeScore: null,
            medianMs: 0,
            tokensIn: 0,
            tokensOut: 0,
        });
    });
});
