import { describe, expect, it } from "vitest";
import { RUBRIC } from "../../services/core/ai/eval/rubric";
import { EVAL_CAPTURE, EVAL_RUNS } from "../../services/db/seed-eval-data";
import type { EvalJudgement } from "@model/eval";
import type { SeedEvalRun } from "../../services/db/seed-evals";
import { promptFingerprint } from "../eval-fixture-spec";

describe("eval seed fixtures", () => {
    it("was captured against the prompts the builders produce today", () => {
        expect(promptFingerprint()).toBe(EVAL_CAPTURE.promptFingerprint);
    });

    it("was captured against the current rubric", () => {
        expect(EVAL_CAPTURE.rubricVersion).toBe(RUBRIC.version);
    });

    // Verdict renders each answer's question text by id, so a dropped question shows a blank line
    it("only answers questions the rubric still asks", () => {
        const asked = new Set(RUBRIC.questions.map((q) => q.id));
        const unknown = EVAL_RUNS.flatMap((r: SeedEvalRun) =>
            r.judgements.flatMap((j: EvalJudgement) =>
                j.answers.map((a) => a.id).filter((id: string) => !asked.has(id)),
            ),
        );
        expect([...new Set(unknown)]).toEqual([]);
    });
});
