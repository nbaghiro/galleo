import type { Rubric } from "@model/eval";

// The taste layer, and the only part of the visual eval that costs money or wobbles. Everything a
// rule can decide is decided by a rule (contrast, alignment, type scale, shape versus beat); what is
// left here is what a person notices in a still and no measurement captures.
//
// Same discipline as the text rubric: binary questions, YES is always good, and a version bump on
// every edit because a score only compares to another score from the same version.

export const VISUAL_RUBRIC: Rubric = {
    version: "v1",
    // pinned: the same judge scores differently across model releases
    judgeModel: "google:gemini-3.5-flash",
    questions: [
        // ---- the section as a still image ----
        {
            id: "one-focal-point",
            dimension: "craft",
            scope: "section",
            ask: "Does the eye land somewhere first, rather than on two or three things competing?",
        },
        {
            id: "nothing-collides",
            dimension: "craft",
            scope: "section",
            ask: "Is every element clear of the others, with nothing overlapping, cropped, or running off the edge?",
        },
        {
            id: "margins-deliberate",
            dimension: "craft",
            scope: "section",
            ask: "Do the margins and the spacing between elements look chosen rather than left over?",
        },
        {
            id: "text-sits-well",
            dimension: "craft",
            scope: "section",
            ask: "Is every line of text comfortably readable against whatever sits behind it?",
        },
        {
            id: "imagery-belongs",
            dimension: "specificity",
            scope: "section",
            ask: "Does the imagery relate to what the section is actually saying, rather than decorate it?",
        },
        {
            id: "weight-matches-importance",
            dimension: "craft",
            scope: "section",
            ask: "Do the biggest and boldest things on the section happen to be the most important ones?",
        },

        // ---- the artifact as a set, which no single section can answer ----
        {
            id: "looks-designed",
            dimension: "voice",
            scope: "outline",
            ask: "Do these sections look like one designed piece rather than a set of unrelated slides?",
        },
        {
            id: "opens-strong",
            dimension: "arc",
            scope: "outline",
            ask: "Does the first section carry enough visual weight to open the piece?",
        },
        {
            id: "varied-shapes",
            dimension: "variety",
            scope: "outline",
            ask: "Do the sections take genuinely different shapes, rather than repeating one layout?",
        },
        {
            id: "consistent-system",
            dimension: "voice",
            scope: "outline",
            ask: "Are type, colour, and spacing used consistently from one section to the next?",
        },
    ],
};

export const visualQuestionsFor = (scope: "outline" | "section"): Rubric["questions"] =>
    VISUAL_RUBRIC.questions.filter((q) => q.scope === scope);
