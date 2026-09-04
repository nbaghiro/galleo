// The verdicts: what a check or a judge concluded about a piece, and the rubric they answer. The
// run itself is the trace (@model/trace); this file only defines concepts that are genuinely its
// own, read by the offline harnesses (`pnpm ai:eval`, `pnpm eval:ci`) and the layout checks.

/**
 * What a check is about. Owned here because checks come from two places: the structural ones run in
 * services over the section tree, the layout ones run wherever the engine does.
 */
export type CheckDimension = "content" | "structure" | "variety" | "layout";

/** One deterministic check's verdict on one target. Cheap, and it never drifts. */
export interface EvalCheck {
    id: string;
    dimension: CheckDimension;
    target: string; // "artifact" | "section:<id>"
    pass: boolean;
    detail?: string;
}

// The judge's dimensions are editorial, distinct from the mechanical ones a check covers.
// "variety" is shared with CheckDimension by name only: a check counts repeated shapes, the visual
// judge decides whether the set actually looks varied.
export type JudgeDimension = "specificity" | "arc" | "voice" | "craft" | "variety";

/**
 * One binary question. Always phrased so that yes is good, which removes a whole class of
 * inversion bugs and makes a disagreement with a human arguable in plain language.
 */
export interface RubricQuestion {
    id: string;
    dimension: JudgeDimension;
    scope: "outline" | "section";
    ask: string;
    /**
     * Pass rate below which this question fails a CI run. Set ONLY on questions measured as stable:
     * a judge's aggregate score has an sd of about 0.18 between identical runs, so gating on a
     * mid-range question fires on noise and misses real regressions. A question near 1.0 across runs
     * has almost no variance and can only move one way, which is what a regression gate wants.
     * Absent means report the rate, never fail on it.
     */
    gate?: number;
}

export interface Rubric {
    version: string;
    judgeModel: string; // pinned: the same judge scores differently across model releases
    questions: RubricQuestion[];
}

/** One judge's answers for one target. */
export interface EvalJudgement {
    target: string; // "outline" | "section:<id>"
    rubricVersion: string;
    model: string;
    answers: { id: string; yes: boolean; why: string }[];
    at: string;
}

export const scoreOf = (j: EvalJudgement): number =>
    j.answers.length ? j.answers.filter((a) => a.yes).length / j.answers.length : 0;

/** Questions both judges answered but disagreed on: the queue a human should look at first. */
export function disagreements(a: EvalJudgement, b: EvalJudgement): string[] {
    const byId = new Map(b.answers.map((x) => [x.id, x.yes]));
    return a.answers.filter((x) => byId.has(x.id) && byId.get(x.id) !== x.yes).map((x) => x.id);
}

/**
 * The shape a rendered section takes, independent of what it says. Classified from geometry and
 * element mix (`@canvas/render/archetype`), because two sections can use different elements to make
 * the same shape and the same elements to make different ones.
 */
export type SectionArchetype =
    | "bleed" // full-bleed background carrying overlaid text
    | "statement" // one or two text blocks, little else
    | "split" // text beside media, two columns of comparable weight
    | "grid" // three or more sibling cards of similar size
    | "data" // a chart, table, or stat block dominates the area
    | "list" // an enumerated or bulleted run
    | "dense"; // a lot of body copy with no dominant element

export const ARCHETYPES: SectionArchetype[] = [
    "bleed",
    "statement",
    "split",
    "grid",
    "data",
    "list",
    "dense",
];

/**
 * What each narrative role wants to look like. The planner assigns a role per beat before anything
 * is written (`GenMeta.beats`), so a rendered section can be held to the job its position was given
 * rather than judged in the abstract: a wall of body copy is right mid-document and wrong as an
 * opener, and only the role says which this is.
 *
 * `wants` is the set that reads correctly. Anything outside it is a miss, not a crime: the check
 * reports rather than fails the artifact, because a good designer breaks these deliberately.
 */
export const ROLE_WANTS: Record<string, SectionArchetype[]> = {
    scene: ["bleed", "statement", "split"],
    tension: ["statement", "split", "data", "dense"],
    turn: ["statement", "bleed", "split"],
    proof: ["data", "split", "grid", "list"],
    objection: ["statement", "split", "list"],
    momentum: ["grid", "list", "split", "data"],
    close: ["statement", "bleed"],
};

/** Roles we do not recognise never fail; an unknown arc is not evidence of a bad render. */
export const roleWants = (role: string | undefined): SectionArchetype[] | null =>
    role && ROLE_WANTS[role] ? ROLE_WANTS[role] : null;

export const archetypeFitsRole = (role: string | undefined, a: SectionArchetype): boolean => {
    const wants = roleWants(role);
    return !wants || wants.includes(a);
};

/** An opener has to carry the piece; a grid or a wall of copy cannot. */
export const OPENING_ARCHETYPES: SectionArchetype[] = ["bleed", "statement", "split"];

/** A close commits. Data and cards leave the reader mid-thought. */
export const CLOSING_ARCHETYPES: SectionArchetype[] = ["statement", "bleed", "split"];

/**
 * The gated questions and how a run scored them. A question with no `gate` is reported, never
 * failed, so adding one to a rubric is a deliberate act backed by measurement.
 */
export interface GateResult {
    id: string;
    rate: number;
    /** null = reported only; this question never fails a build. */
    floor: number | null;
    pass: boolean;
    answered: number;
}

/** Pass rate per question across every judgement in a run. Reported for all, gated for a few. */
export function questionRates(rubric: Rubric, judgements: EvalJudgement[]): GateResult[] {
    const seen = new Map<string, { yes: number; n: number }>();
    for (const j of judgements)
        for (const a of j.answers) {
            const acc = seen.get(a.id) ?? { yes: 0, n: 0 };
            acc.yes += a.yes ? 1 : 0;
            acc.n += 1;
            seen.set(a.id, acc);
        }
    return rubric.questions.map((q) => {
        const acc = seen.get(q.id) ?? { yes: 0, n: 0 };
        const rate = acc.n ? acc.yes / acc.n : 1; // unasked is not evidence of a regression
        return {
            id: q.id,
            rate,
            floor: q.gate ?? null,
            pass: typeof q.gate === "number" ? rate >= q.gate : true,
            answered: acc.n,
        };
    });
}
