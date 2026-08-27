import type { Rubric } from "@model/eval";

// The rubric is versioned data, not prose in a prompt. Binary questions rather than a 1-5 scale:
// decomposed checklists agree with human raters substantially better and vary less between runs,
// and a yes/no question is arguable with a person in a way "3 versus 4 on voice" never is.
//
// Every question is phrased so that YES is good. Editing this file is a rubric change, so bump the
// version: a score is only comparable to another score from the same version.
//
// A few carry a `gate`: a floor below which CI fails. Only questions measured as saturated get one,
// because the aggregate score wobbles by about 18 points between identical runs and would gate on
// noise. The mid-range questions (0.49-0.73) are reported as a trend and never fail a build.

export const RUBRIC: Rubric = {
    version: "r1",
    // pinned on purpose: the same judge scores differently across model releases
    judgeModel: "google:gemini-3.5-flash",
    questions: [
        // the outline: does the plan hold together as an argument
        {
            id: "opens-specific",
            dimension: "specificity",
            scope: "outline",
            ask: "Does the opening beat name a specific situation or problem, rather than introduce a general category?",
        },
        {
            id: "beats-advance",
            dimension: "arc",
            scope: "outline",
            ask: "Does each beat move the argument forward, rather than restate or rephrase the one before it?",
        },
        {
            id: "has-turn",
            dimension: "arc",
            scope: "outline",
            ask: "Is there a clear turn somewhere in the middle, where the piece shifts from setup to consequence?",
        },
        {
            id: "closes-committed",
            dimension: "arc",
            scope: "outline",
            ask: "Does the final beat commit to something (an ask, a claim, a next step), rather than summarise what came before?",
        },
        {
            id: "beats-load-bearing",
            dimension: "arc",
            scope: "outline",
            ask: "Would removing any single beat leave a noticeable gap in the argument?",
        },
        {
            id: "labels-specific",
            dimension: "specificity",
            scope: "outline",
            ask: "Are the beat labels specific to this brief, rather than generic section names that would suit any piece?",
        },

        // a section: does the copy earn its place
        {
            id: "headline-claims",
            dimension: "specificity",
            scope: "section",
            ask: "Does the headline make a claim, rather than name a topic?",
        },
        {
            id: "has-concrete-detail",
            dimension: "specificity",
            scope: "section",
            ask: "Does the section contain at least one concrete detail: a number, a name, a date, or a specific example?",
        },
        {
            id: "not-portable",
            dimension: "specificity",
            scope: "section",
            ask: "Is this copy specific enough that it could not be dropped into a piece on a different subject unchanged?",
        },
        {
            id: "body-supports",
            dimension: "craft",
            scope: "section",
            ask: "Does the body develop the headline, rather than repeat it in more words?",
        },
        {
            id: "no-filler",
            gate: 0.85, // measured at 0.96 across runs; near-zero variance, so it can only fall
            dimension: "voice",
            scope: "section",
            ask: "Is the copy free of filler openings such as 'in today's world', 'it is important to note', or 'as we all know'?",
        },
        {
            id: "no-ai-tells",
            gate: 0.8, // measured at 0.91 across runs; near-zero variance, so it can only fall
            dimension: "voice",
            scope: "section",
            ask: "Is the copy free of the words delve, leverage, robust, seamless, tapestry, and landscape used figuratively?",
        },
        {
            id: "consistent-voice",
            gate: 0.9, // measured at 1.00 across runs; near-zero variance, so it can only fall
            dimension: "voice",
            scope: "section",
            ask: "Does this section read as though written by the same person as the rest of the piece?",
        },
        {
            id: "element-suits-content",
            dimension: "craft",
            scope: "section",
            ask: "Do the element types suit the content: a stat for a figure, a diagram for a process, a table for a comparison?",
        },
        {
            id: "earns-its-length",
            dimension: "craft",
            scope: "section",
            ask: "Is every sentence load-bearing, with nothing that could be cut without loss?",
        },
    ],
};

export const questionsFor = (scope: "outline" | "section"): Rubric["questions"] =>
    RUBRIC.questions.filter((q) => q.scope === scope);
