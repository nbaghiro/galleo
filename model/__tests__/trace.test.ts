import { describe, expect, it } from "vitest";
import type { ModelCall, ModelSpan, TraceSpan } from "@model/trace";
import { modelCalls, spansForStep, stepsOf, stripBodies, tokensOf, toolSpans } from "@model/trace";

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

describe("the span tree", () => {
    const tree: TraceSpan[] = [
        {
            kind: "tool",
            id: "r",
            parent: null,
            at: 0,
            tool: "add-section",
            surface: "direct",
            ms: 9,
            status: "ok",
        },
        { kind: "model", id: "m1", parent: "r", at: 1, ...span("outline") },
        {
            kind: "tool",
            id: "c",
            parent: "r",
            at: 2,
            tool: "write-section",
            surface: "internal",
            ms: 5,
            status: "ok",
        },
        { kind: "model", id: "m2", parent: "c", at: 3, ...span("section:b1") },
    ];

    it("separates the tool spans from the model calls", () => {
        expect(toolSpans(tree).map((s) => s.id)).toEqual(["r", "c"]);
        expect(modelCalls(tree).map((s) => s.id)).toEqual(["m1", "m2"]);
    });

    it("strips only the words from a model call, keeping every measurement", () => {
        const full: ModelCall = {
            kind: "model",
            id: "m",
            parent: "r",
            at: 0,
            ...span("outline"),
            system: "s",
            prompt: "p",
            response: "r",
            parts: [{ name: "a", text: "b" }],
            temperature: 0.9,
            finishReason: "stop",
        };
        expect(stripBodies(full)).toEqual({
            kind: "model",
            id: "m",
            parent: "r",
            at: 0,
            ...span("outline"),
            temperature: 0.9,
            finishReason: "stop",
        });
    });
});
