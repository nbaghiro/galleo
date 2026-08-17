import { z } from "zod";
import { generateText, Output } from "ai";
import type { EvalJudgement, Rubric, RubricQuestion } from "@model/eval";
import { modelCall } from "@services/core/ai/provider";
import { VISUAL_RUBRIC, visualQuestionsFor } from "./visual-rubric";

// The judge that looks. Everything a rule can settle is settled before this runs (contrast,
// alignment, type scale, shape against the beat), so these calls only spend tokens on what a person
// notices in a still and no measurement captures.
//
// Sections are judged one at a time so a verdict names its section, then the whole set is judged once
// from a contact sheet, because "do these look like one designed piece" is not a question any single
// image can answer.

const ANSWERS = z.object({
    answers: z.array(z.object({ id: z.string(), yes: z.boolean(), why: z.string() })),
});

const SYSTEM = [
    "You are an art director reviewing rendered slides.",
    "You answer a checklist about what you can SEE. Each question is phrased so that YES is good.",
    "Answer every question with a strict yes or no and one short sentence naming what you saw.",
    "Judge the design, never the subject matter: a piece about a dull topic can still look superb.",
    "Do not comment on wording quality; another reviewer handles the copy.",
].join(" ");

/** A rendered section: PNG bytes plus the id the verdict is filed against. */
export interface SectionImage {
    id: string;
    /** Raw PNG bytes. The route decodes the data URL so the model never sees base64 text. */
    png: Uint8Array;
}

const ask = (qs: RubricQuestion[]): string => qs.map((q) => `${q.id}: ${q.ask}`).join("\n");

async function run(
    qs: RubricQuestion[],
    target: string,
    images: SectionImage[],
    lead: string,
    rubric: Rubric,
    signal?: AbortSignal,
): Promise<EvalJudgement> {
    const { output } = await generateText({
        // deterministic: a checklist should not wobble between runs of the same image
        ...modelCall(rubric.judgeModel, 0),
        output: Output.object({ schema: ANSWERS }),
        system: SYSTEM,
        messages: [
            {
                role: "user",
                content: [
                    ...images.map((i) => ({
                        type: "file" as const,
                        data: i.png,
                        mediaType: "image/png",
                    })),
                    { type: "text" as const, text: `${lead}\n\nCHECKLIST\n${ask(qs)}` },
                ],
            },
        ],
        abortSignal: signal,
    });
    const asked = new Set(qs.map((q) => q.id));
    return {
        target,
        rubricVersion: rubric.version,
        model: rubric.judgeModel,
        // drop anything invented, and never silently pass a question the model skipped
        answers: qs.map((q) => {
            const hit = output.answers.find((a) => a.id === q.id && asked.has(a.id));
            return hit
                ? { id: q.id, yes: hit.yes, why: hit.why }
                : { id: q.id, yes: false, why: "the judge did not answer this question" };
        }),
        at: new Date().toISOString(),
    };
}

export interface VisualJudgeOpts {
    rubric?: Rubric;
    signal?: AbortSignal;
    /** Cap the section calls; the contact sheet still sees everything passed in. */
    maxSections?: number;
}

/** Prefixed on the stored target so a visual verdict never overwrites the text one for a section. */
export const VISUAL_PREFIX = "visual:";

export async function judgeVisuals(
    images: SectionImage[],
    opts: VisualJudgeOpts = {},
): Promise<EvalJudgement[]> {
    if (!images.length) return [];
    const rubric = opts.rubric ?? VISUAL_RUBRIC;
    const cap = opts.maxSections ?? images.length;
    const out: EvalJudgement[] = [];

    // the whole set first, so "one designed piece" is answered against every section we have
    out.push(
        await run(
            visualQuestionsFor("outline"),
            `${VISUAL_PREFIX}outline`,
            images,
            `${images.length} sections of one artifact, in order.`,
            rubric,
            opts.signal,
        ),
    );

    for (const [i, image] of images.slice(0, cap).entries())
        out.push(
            await run(
                visualQuestionsFor("section"),
                `${VISUAL_PREFIX}section:${image.id}`,
                [image],
                `Section ${i + 1} of ${images.length}.`,
                rubric,
                opts.signal,
            ),
        );

    return out;
}
