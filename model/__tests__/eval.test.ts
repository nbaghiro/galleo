import { describe, expect, it } from "vitest";
import type { EvalSpan } from "@model/eval";
import { spansForStep, stepsOf, tokensOf } from "@model/eval";

const span = (step: string, input = 10, output = 5): EvalSpan => ({
    modelId: "google:gemini-3.5-flash",
    input,
    output,
    step,
    ms: 100,
});

const RUN: EvalSpan[] = [
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
