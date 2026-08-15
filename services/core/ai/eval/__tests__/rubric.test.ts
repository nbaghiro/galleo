import { describe, expect, it } from "vitest";
import type { EvalJudgement } from "@model/eval";
import { disagreements, scoreOf } from "@model/eval";
import { RUBRIC, questionsFor } from "../rubric";

const judgement = (answers: [string, boolean][]): EvalJudgement => ({
    target: "outline",
    rubricVersion: RUBRIC.version,
    model: RUBRIC.judgeModel,
    answers: answers.map(([id, yes]) => ({ id, yes, why: "" })),
    at: "2026-08-13T00:00:00.000Z",
});

describe("the rubric", () => {
    it("gives every question a unique id, since answers are matched by it", () => {
        const ids = RUBRIC.questions.map((q) => q.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("covers both scopes, so a verdict can name its step", () => {
        expect(questionsFor("outline").length).toBeGreaterThan(0);
        expect(questionsFor("section").length).toBeGreaterThan(0);
    });

    it("splits questions between scopes without overlap", () => {
        const o = new Set(questionsFor("outline").map((q) => q.id));
        expect(questionsFor("section").some((q) => o.has(q.id))).toBe(false);
    });

    it("asks a question, so a yes/no answer is meaningful", () => {
        for (const q of RUBRIC.questions) expect(q.ask.trim()).toMatch(/\?$/);
    });

    it("pins the judge model, since the same judge drifts across releases", () => {
        expect(RUBRIC.judgeModel).toMatch(/^[a-z]+:/);
    });

    it("carries a version, without which scores are not comparable over time", () => {
        expect(RUBRIC.version).toBeTruthy();
    });
});

describe("scoreOf", () => {
    it("is the share of yeses, because yes always means good", () => {
        expect(
            scoreOf(
                judgement([
                    ["a", true],
                    ["b", true],
                    ["c", false],
                    ["d", false],
                ]),
            ),
        ).toBe(0.5);
    });

    it("scores an unanswered checklist at zero rather than dividing by zero", () => {
        expect(scoreOf(judgement([]))).toBe(0);
    });
});

describe("disagreements", () => {
    it("names the questions two judges answered differently", () => {
        const a = judgement([
            ["x", true],
            ["y", true],
            ["z", false],
        ]);
        const b = judgement([
            ["x", true],
            ["y", false],
            ["z", true],
        ]);
        expect(disagreements(a, b)).toEqual(["y", "z"]);
    });

    it("ignores questions only one of them answered", () => {
        const a = judgement([
            ["x", true],
            ["only-a", true],
        ]);
        const b = judgement([["x", true]]);
        expect(disagreements(a, b)).toEqual([]);
    });

    it("is empty when they agree, which is the common case", () => {
        const a = judgement([
            ["x", true],
            ["y", false],
        ]);
        expect(disagreements(a, a)).toEqual([]);
    });
});
