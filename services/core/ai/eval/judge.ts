import { z } from "zod";
import { generateText, Output } from "ai";
import type { ArtifactContent, Section } from "@model/artifact";
import type { EvalJudgement, Rubric, RubricQuestion } from "@model/eval";
import { modelCall } from "@services/core/ai/provider";
import { contentOf } from "@services/core/ai/quality";
import { RUBRIC, questionsFor } from "./rubric";

// The judge answers a checklist rather than assigning a score, so every verdict points at a
// specific question a human can agree or disagree with. Yes always means good (see rubric.ts), so
// the score is simply the share of yeses.

const ANSWERS = z.object({
    answers: z.array(
        z.object({
            id: z.string(),
            yes: z.boolean(),
            why: z.string(),
        }),
    ),
});

const SYSTEM = [
    "You are a demanding editor and creative director reviewing generated content.",
    "You answer a checklist. Each question is phrased so that YES is good.",
    "Answer every question with a strict yes or no and one short sentence of evidence quoting the work.",
    "Be hard to please: when a question is only partly satisfied, the answer is no.",
    "Judge craft, never subject matter. A piece about a topic you find dull can still be excellent.",
].join(" ");

const ask = (qs: RubricQuestion[]): string => qs.map((q) => `${q.id}: ${q.ask}`).join("\n");

/** Flattened for the judge: element types carry craft signal that raw text alone loses. */
function renderSection(s: Section, index: number): string {
    const { texts, types } = contentOf(s);
    const kinds = [...new Set(types.filter((t) => t !== "group"))].join(", ") || "—";
    return `Section ${index + 1} (id ${s.id}) [elements: ${kinds}]\n${texts.join("\n")}`;
}

const CLIP = 6000;

async function run(
    qs: RubricQuestion[],
    target: string,
    body: string,
    rubric: Rubric,
    signal?: AbortSignal,
): Promise<EvalJudgement> {
    const { output } = await generateText({
        // deterministic: a checklist should not wobble between runs of the same input
        ...modelCall(rubric.judgeModel, 0),
        output: Output.object({ schema: ANSWERS }),
        system: SYSTEM,
        prompt: `CHECKLIST\n${ask(qs)}\n\nWORK UNDER REVIEW\n${body.slice(0, CLIP)}`,
        abortSignal: signal,
    });
    const asked = new Set(qs.map((q) => q.id));
    return {
        target,
        rubricVersion: rubric.version,
        model: rubric.judgeModel,
        // drop anything the model invented, and never silently pass a question it skipped
        answers: qs.map((q) => {
            const hit = output.answers.find((a) => a.id === q.id && asked.has(a.id));
            return hit
                ? { id: q.id, yes: hit.yes, why: hit.why }
                : { id: q.id, yes: false, why: "the judge did not answer this question" };
        }),
        at: new Date().toISOString(),
    };
}

export interface JudgeOpts {
    rubric?: Rubric;
    signal?: AbortSignal;
    /** Hand-built reference used as a quality bar, never as a topic to match. */
    reference?: ArtifactContent;
}

/** Judges the plan as a whole, then each section on its own, so a verdict names its step. */
export async function judgeRun(
    content: ArtifactContent,
    opts: JudgeOpts = {},
): Promise<EvalJudgement[]> {
    const rubric = opts.rubric ?? RUBRIC;
    const spine = content.sections.map(renderSection).join("\n\n");
    const bar = opts.reference
        ? `\n\nFOR CALIBRATION ONLY — an excellent hand-built piece. Judge craft against this bar, not subject.\n${opts.reference.sections
              .map(renderSection)
              .join("\n\n")
              .slice(0, CLIP)}`
        : "";

    const outline = await run(
        questionsFor("outline"),
        "outline",
        `A ${content.format} of ${content.sections.length} sections.\n\n${spine}${bar}`,
        rubric,
        opts.signal,
    );

    // sections in sequence rather than in parallel: a judge that has seen the whole spine can
    // answer "reads like the same writer" at all
    const sections: EvalJudgement[] = [];
    for (const [i, s] of content.sections.entries()) {
        sections.push(
            await run(
                questionsFor("section"),
                `section:${s.id}`,
                `THE PIECE SO FAR (for voice and repetition only)\n${spine.slice(0, 2500)}\n\nTHE SECTION UNDER REVIEW\n${renderSection(s, i)}`,
                rubric,
                opts.signal,
            ),
        );
    }
    return [outline, ...sections];
}
