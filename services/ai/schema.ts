import { z } from "zod";

// These mirror @model's ElementLayout + SectionBackground so a parsed element/section IS an
// ElementInstance/Section, with no assertion at the call site. The outer .catch(undefined) keeps the
// tolerance the previous open records had: a malformed layout/background drops that one field
// instead of failing the whole parse and burning a generation retry.
const zElementLayout = z
    .object({
        width: z.union([z.literal("fit"), z.literal("fill"), z.object({ pct: z.number() })]),
        height: z.union([z.literal("fit"), z.literal("fill")]),
        align: z.union([z.literal("start"), z.literal("center"), z.literal("end")]),
        radius: z.number(),
    })
    .partial();

const zSectionBackground = z
    .object({
        kind: z.union([
            z.literal("none"),
            z.literal("color"),
            z.literal("gradient"),
            z.literal("image"),
        ]),
        color: z.string().optional(),
        gradient: z.object({ from: z.string(), to: z.string(), angle: z.number().optional() }),
        image: z.string(),
        scrim: z.number(),
        dark: z.boolean(),
    })
    .partial({ color: true, gradient: true, image: true, scrim: true, dark: true });

export const zElement = z.object({
    type: z.string().describe("element type from the catalog (text, image, group, stat, chart, …)"),
    data: z.record(z.string(), z.unknown()).describe("element data per the catalog for this type"),
    layout: zElementLayout.optional().catch(undefined),
});

export const zSection = z.object({
    id: z.string().describe("a stable, unique section id (e.g. 's1', 's2')"),
    root: zElement.describe(
        "the section's content as ONE element: a `group` with direction 'row' for side-by-side columns (each child carries layout.width, e.g. {pct:60}), 'col' to stack — nestable to any depth; or a single element for a full-width section",
    ),
    background: zSectionBackground.optional().catch(undefined),
    bleed: z.boolean().optional(),
});

export const zBeat = z.object({
    id: z.string().describe("the section id this beat becomes (s1, s2, …)"),
    label: z.string().describe("a 2–5 word working title for the section"),
    role: z.string().describe("narrative role: scene | tension | turn | proof | momentum | close"),
    layout: z
        .string()
        .optional()
        .describe(
            "a named layout preset (full · split-6040 · split-4060 · two-col · three-up) whose column count + widths pre-shape the skeleton",
        ),
    image: z.boolean().optional().describe("true if this section leads with a prominent image"),
    blocks: z
        .array(z.string())
        .optional()
        .describe(
            "the block leading each column, in order — each one of: text, bullets, image, stat, chart, diagram, table, quote, cards. Length = the layout's column count.",
        ),
    brief: z
        .string()
        .optional()
        .describe("one line telling the section writer what this section must say"),
    takeaway: z
        .string()
        .optional()
        .describe(
            "the single thing the reader should leave this section with, as a full sentence — the point the section exists to land",
        ),
    points: z
        .array(z.string())
        .optional()
        .describe(
            "the 2–4 concrete moves this section makes, in the order it makes them — the actual claims, numbers, comparisons, or steps, not topic labels",
        ),
    covers: z
        .array(z.string())
        .optional()
        .describe(
            "which of the brief's must-cover points this beat covers — copy each covered point VERBATIM; omit when none",
        ),
});

export const zOutline = z.object({
    title: z.string().describe("the artifact title"),
    goal: z
        .string()
        .nullish()
        .describe("what this piece has to achieve, in a few words — the job it does for its maker"),
    audience: z.string().nullish().describe("who it is aimed at, in a few words"),
    tone: z.string().nullish().describe("how it should sound, in a word or two"),
    mustInclude: z
        .array(z.string())
        .nullish()
        .describe(
            "the 2–5 points this piece has to cover for the brief to be satisfied, each a short noun phrase; tag the beats that cover them via `covers`",
        ),
    backdrop: z
        .string()
        .describe(
            "a vivid, on-theme photo description for the artifact's full-bleed background — a moody, atmospheric scene evoking the subject (e.g. for a finance deck: 'a modern finance office at dusk, soft focus, warm light'), NOT a generic abstract texture. It sits behind every section under a heavy scrim, so keep it a wide, low-detail environment rather than a busy foreground subject.",
        ),
    beats: z.array(zBeat).min(1).describe("the ordered sections to build"),
});

export const zSectionPlan = zBeat.omit({ id: true });
export type SectionPlan = z.infer<typeof zSectionPlan>;

export const zRewrite = z.object({
    text: z.string().describe("the rewritten text, same language, ready to drop back in"),
});

export const zTranslate = z.object({
    text: z.string().describe("the translated text, preserving meaning, tone, and any formatting"),
});

// matches @themes Tokens
export const zTokens = z.object({
    bg: z.string().describe("page background hex"),
    surface: z.string().describe("section/card background hex (a subtle lift from bg)"),
    ink: z.string().describe("primary text hex"),
    soft: z.string().describe("secondary text hex"),
    muted: z.string().describe("caption/label text hex"),
    accent: z.string().describe("brand accent hex (eyebrows, buttons, markers)"),
    onAccent: z.string().describe("text/icon color on the accent hex"),
    line: z.string().describe("border/divider hex"),
    radius: z.number().describe("section corner radius px (0 = sharp/brutalist, 18+ = soft)"),
    fontDisplay: z.string().describe("heading family — from the allowed display list"),
    fontBody: z.string().describe("body/UI family — from the allowed body list"),
    fontMono: z.string().describe("label/mono family — from the allowed mono list"),
    headingWeight: z.number().describe("weight for headings, 300–800"),
    border: z.number().optional().describe("card/section border width px (heavier = blockier)"),
    shadow: z.string().optional().describe("box-shadow CSS, or 'none'"),
    scrim: z.number().optional().describe("0..1 default darkening over background images"),
});

export const zTheme = z.object({
    name: z.string().describe("a short, evocative theme name"),
    mood: z.string().describe("a one-word mood/tag, e.g. 'editorial', 'brutalist', 'luxe'"),
    isDark: z.boolean().describe("true if this is a dark theme (dark bg, light ink)"),
    tokens: zTokens,
});

export const zImagePrompt = z.object({
    prompt: z.string().describe("a single vivid image-generation prompt, on-theme, no commentary"),
});

// the structured expansion of a raw prompt (the studio's Brief stage)
export const zBriefDraft = z.object({
    goal: z.string().describe("what the piece must achieve, one short line"),
    audience: z.string().describe("who it's for, one short line"),
    tone: z.string().describe("the register to write in, 2–4 words"),
    // Deliberately unconstrained: min/max here turn an otherwise-fine read into a hard failure,
    // and the count is guidance, not correctness. normalizeBrief trims the list instead.
    mustInclude: z
        .array(z.string())
        .describe(
            "2–6 points the piece must cover — short noun phrases pulled from (or clearly implied by) the prompt, each one checkable",
        ),
    // nullish, not optional: models emit `null` for an optional field they chose not to fill
    clarify: z
        .string()
        .nullish()
        .describe(
            "AT MOST one question, only when its answer would genuinely change the outline; omit otherwise",
        ),
});

export type Outline = z.infer<typeof zOutline>;
export type Beat = z.infer<typeof zBeat>;
export type ThemeGen = z.infer<typeof zTheme>;
export type BriefDraftGen = z.infer<typeof zBriefDraft>;
