import { z } from "zod";

// mirrors @model's ElementLayout + SectionBackground, so a parsed element/section IS an
// ElementInstance/Section; .catch(undefined) drops a malformed field instead of failing the parse
const zElementLayout = z
    .object({
        width: z.union([z.literal("fit"), z.literal("fill"), z.object({ pct: z.number() })]),
        height: z.union([z.literal("fit"), z.literal("fill")]),
        align: z.union([z.literal("start"), z.literal("center"), z.literal("end")]),
        radius: z.number(),
        dock: z
            .literal("top")
            .describe(
                "section chrome: lifts this element out of the section's content flow and anchors it to the top edge of the section's own band, so a site's topbar hugs the hero while the hero copy stays centred below it. Only ever on a DIRECT child of the first section's root container, and only once in a piece",
            ),
    })
    .partial();

const zSectionBackground = z
    .object({
        kind: z.union([
            z.literal("none"),
            z.literal("tone"),
            z.literal("color"),
            z.literal("gradient"),
            z.literal("image"),
        ]),
        tone: z
            .union([z.literal("tint"), z.literal("contrast"), z.literal("accent")])
            .describe(
                "with kind 'tone', which theme-relative band this is: 'tint' a quiet wash off the page for an alternating rhythm, 'contrast' the inverted band for a closing ask, 'accent' the brand colour. The ground and the text colours on it are both derived from the theme, so prefer a tone over picking a hex",
            ),
        color: z.string().optional(),
        gradient: z.object({ from: z.string(), to: z.string(), angle: z.number().optional() }),
        image: z.string(),
        scrim: z.number(),
        dark: z.boolean(),
    })
    .partial({ tone: true, color: true, gradient: true, image: true, scrim: true, dark: true });

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
    frame: z
        .object({ aspect: z.number() })
        .describe(
            "the section's shape as width divided by height, written as a decimal. A paged format (deck) reads it as that slide's own page shape. A continuous one (doc, web) has no page, so the same number reads as a MINIMUM band height the content centres inside: a hero band opens at 2.3 (16:7) to 1.78 (16:9), a slim image interlude runs about 3.2 (16:5). Content taller than the band still grows past it. Omit the field and the section is exactly as tall as its content",
        )
        .optional()
        .catch(undefined),
});

export const zBeat = z.object({
    id: z
        .string()
        .describe(
            "the section id this beat becomes: short, unique, and url-safe (lowercase letters, digits and dashes, no spaces or colons). `s1`, `s2`, … is fine; on a website name it after what it holds (`hero`, `features`, `pricing`, `faq`), since that id is what a nav link points at",
        ),
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

export const zBriefDraft = z.object({
    goal: z.string().describe("what the piece must achieve, one short line"),
    audience: z.string().describe("who it's for, one short line"),
    tone: z.string().describe("the register to write in, 2–4 words"),
    // no min/max: the count is guidance, not correctness, and normalizeBrief trims the list
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

export function extractJson(text: string): unknown {
    const t = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    const slice = start >= 0 && end > start ? t.slice(start, end + 1) : t;
    try {
        return JSON.parse(slice);
    } catch {
        return null;
    }
}
