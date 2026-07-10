import { z } from "zod";

// The Zod schemas the AI module hands to `generateObject`/`streamObject` — the machine half of the contract
// whose human half is the prompt catalog. They keep the *shape* honest (a section is ONE recursive `root`
// element tree; an outline is titled beats) while leaving each element's `data` open, because the prompt
// (not a rigid schema) is what teaches the model the per-element fields — and `applyPatch` + the element
// specs already tolerate extra/missing keys. Tighten later into a discriminated element union if drift shows.

// One element instance — `{ type, data }`, matching @model/artifact ElementInstance. `data` is an open
// object (children nest as elements inside `data.children`); the catalog in the system prompt constrains the
// contents. `layout.width` on a child sets its column share.
export const zElement = z.object({
    type: z.string().describe("element type from the catalog (text, image, group, stat, chart, …)"),
    data: z.record(z.string(), z.unknown()).describe("element data per the catalog for this type"),
    layout: z.record(z.string(), z.unknown()).optional(),
});

export const zSection = z.object({
    id: z.string().describe("a stable, unique section id (e.g. 's1', 's2')"),
    root: zElement.describe(
        "the section's content as ONE element: a `group` with direction 'row' for side-by-side columns (each child carries layout.width, e.g. {pct:60}), 'col' to stack — nestable to any depth; or a single element for a full-width section",
    ),
    background: z.record(z.string(), z.unknown()).optional(),
    bleed: z.boolean().optional(),
});

// --- generate: outline (plan) then per-section ---

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
});

export const zOutline = z.object({
    title: z.string().describe("the artifact title"),
    backdrop: z
        .string()
        .describe(
            "a vivid, on-theme photo description for the artifact's full-bleed background — a moody, atmospheric scene evoking the subject (e.g. for a finance deck: 'a modern finance office at dusk, soft focus, warm light'), NOT a generic abstract texture. It sits behind every section under a heavy scrim, so keep it a wide, low-detail environment rather than a busy foreground subject.",
        ),
    beats: z.array(zBeat).min(1).describe("the ordered sections to build"),
});

// A plan for ONE new section to insert into an existing artifact — a beat minus the id (the runtime assigns
// a fresh, non-colliding one). Drives the live skeleton before the section writer fills it.
export const zSectionPlan = zBeat.omit({ id: true });
export type SectionPlan = z.infer<typeof zSectionPlan>;

// --- rewrite / translate (text-level, fast) ---

export const zRewrite = z.object({
    text: z.string().describe("the rewritten text, same language, ready to drop back in"),
});

export const zTranslate = z.object({
    text: z.string().describe("the translated text, preserving meaning, tone, and any formatting"),
});

// --- theme generation (→ @themes ThemeInput) ---

// The token set of a theme (matches @themes Tokens). Colors are #rrggbb; fonts must come from the
// bundled families the prompt lists; radius/border are px, headingWeight 300–800.
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

// --- image prompt expansion (art-director brief for the image model) ---

export const zImagePrompt = z.object({
    prompt: z.string().describe("a single vivid image-generation prompt, on-theme, no commentary"),
});

export type Outline = z.infer<typeof zOutline>;
export type Beat = z.infer<typeof zBeat>;
export type ThemeGen = z.infer<typeof zTheme>;
