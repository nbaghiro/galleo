import { describe, expect, it } from "vitest";
import { RUBRIC } from "@services/core/ai/eval/rubric";
import { VISUAL_RUBRIC, visualQuestionsFor } from "@services/core/ai/eval/visual-rubric";
import { VISUAL_PREFIX } from "@services/core/ai/eval/visual-judge";
import { scoreOf } from "@model/eval";

describe("the visual rubric", () => {
    it("gives every question a unique id, since answers are matched by it", () => {
        const ids = VISUAL_RUBRIC.questions.map((q) => q.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("asks a question, so a yes/no answer is meaningful", () => {
        for (const q of VISUAL_RUBRIC.questions) expect(q.ask.trim()).toMatch(/\?$/);
    });

    it("covers both scopes: a section alone cannot answer whether the set coheres", () => {
        expect(visualQuestionsFor("section").length).toBeGreaterThan(0);
        expect(visualQuestionsFor("outline").length).toBeGreaterThan(0);
    });

    it("pins its judge model and carries a version", () => {
        expect(VISUAL_RUBRIC.judgeModel).toMatch(/^[a-z]+:/);
        expect(VISUAL_RUBRIC.version).toBeTruthy();
    });

    // the two rubrics are stored side by side against one run, so their ids must not collide
    it("shares no question id with the text rubric", () => {
        const text = new Set(RUBRIC.questions.map((q) => q.id));
        for (const q of VISUAL_RUBRIC.questions) expect(text.has(q.id)).toBe(false);
    });

    it("asks only about what is visible, never about the writing", () => {
        for (const q of VISUAL_RUBRIC.questions)
            expect(q.ask.toLowerCase()).not.toMatch(/headline claims|filler|delve|sentence/);
    });

    it("files verdicts under a prefix so a visual score never overwrites the text one", () => {
        expect(`${VISUAL_PREFIX}section:s1`).not.toBe("section:s1");
        expect(`${VISUAL_PREFIX}outline`.startsWith(VISUAL_PREFIX)).toBe(true);
    });

    it("scores as the share of yeses, the same way the text rubric does", () => {
        const j = {
            target: `${VISUAL_PREFIX}outline`,
            rubricVersion: VISUAL_RUBRIC.version,
            model: VISUAL_RUBRIC.judgeModel,
            answers: [
                { id: "a", yes: true, why: "" },
                { id: "b", yes: false, why: "" },
            ],
            at: "",
        };
        expect(scoreOf(j)).toBe(0.5);
    });
});
