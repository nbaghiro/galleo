import type { AgentEvent, Beat, GenerateInput } from "@model/agent";
import type { ArtifactContent, Cell, ElementInstance, Section } from "@model/artifact";
import { z } from "zod";
import {
    badge,
    bgImage,
    bullets,
    button,
    cell,
    group,
    img,
    quote,
    section,
    stat,
    t,
} from "@model/authoring";
import { resolveProfile } from "@engine/profile";
import { structured } from "./llm";
import type { Quality } from "./llm";
import { resolveImage, resolveImages } from "./images";

// The generate pipeline: a brief → a real ArtifactContent, produced in stages (plan → per-section write)
// and streamed as AgentEvents. The LLM returns a compact, schema-validated IR; this maps it onto real
// elements via @model/authoring, so the model never emits raw engine/element JSON.

export type Emit = (event: AgentEvent) => void;

// --- schemas (the IR the model returns) ---

const CellKey = z.enum(["a", "b", "c"]);
type CellKeyT = z.infer<typeof CellKey>;

const GRID_CELLS: Record<string, CellKeyT[]> = {
    full: ["a"],
    "split-6040": ["a", "b"],
    "split-4060": ["a", "b"],
    "two-col": ["a", "b"],
    "three-up": ["a", "b", "c"],
};

const Grid = z.enum(["full", "split-6040", "split-4060", "two-col", "three-up"]);
const NarrRole = z.enum(["scene", "tension", "turn", "proof", "momentum", "close"]);

// One content element. Flat (all fields optional) rather than a discriminated union — every provider's
// structured-output mode handles it reliably. `kind` selects which fields are read.
const ElementIR = z.object({
    kind: z.enum([
        "eyebrow",
        "heading",
        "paragraph",
        "bullets",
        "stat",
        "quote",
        "image",
        "button",
        "badge",
    ]),
    text: z.string().optional(), // eyebrow / heading / paragraph / quote / button label / badge
    level: z.enum(["h1", "h2", "h3"]).optional(), // heading
    lead: z.boolean().optional(), // paragraph: true → large intro (subtitle), false → body
    items: z.array(z.string()).optional(), // bullets
    value: z.string().optional(), // stat
    label: z.string().optional(), // stat caption
    by: z.string().optional(), // quote attribution
    query: z.string().optional(), // image search phrase
    aspect: z.number().optional(), // image width/height
});
export type ElementIRT = z.infer<typeof ElementIR>;

// One flat list of elements, each tagged with its cell — so ElementIR (9 optionals) is inlined ONCE, not
// per cell (Anthropic's constrained-output caps a schema at 24 optional params).
const SectionElement = ElementIR.extend({ cell: CellKey });
export type SectionElementT = z.infer<typeof SectionElement>;
const SectionContent = z.object({ elements: z.array(SectionElement) });
export type SectionContentT = z.infer<typeof SectionContent>;

const PlanBeat = z.object({
    id: z.string(), // stable section id (s1, s2, …)
    role: NarrRole,
    headline: z.string(), // the section's main line
    intent: z.string(), // one-line purpose (narrated)
    grid: Grid,
    image: z.boolean(), // carries a prominent image
});
export type PlanBeatT = z.infer<typeof PlanBeat>;

const Outline = z.object({
    title: z.string(),
    beats: z.array(PlanBeat).min(3).max(9),
});
export type OutlineT = z.infer<typeof Outline>;

// Stage 0 — the creative direction a design lead commits to before any writing. Grounding every later
// stage in these specifics is what makes the piece feel real instead of generic.
const Direction = z.object({
    subject: z.string(), // the ONE concrete subject, specifically named
    world: z.string(), // invented specifics writers draw from: names · dates · numbers · places
    audience: z.string(),
    tone: z.string(),
    artDirection: z.string(), // the shared photographic vocabulary for every image
});
export type DirectionT = z.infer<typeof Direction>;

// --- prompts ---

const SURFACE_WORD: Record<string, string> = { deck: "deck", doc: "document", web: "web page" };
const ROLE_TITLE: Record<string, string> = {
    scene: "Setting the scene",
    tension: "Naming the tension",
    turn: "The turn",
    proof: "The proof",
    momentum: "Building momentum",
    close: "The ask",
};

const DIRECTION_SYSTEM = `You are the creative director at a top design studio, handed an ambiguous brief. Before any writing, commit to a concrete creative direction so the piece feels real and specific — never generic.
Decide:
- subject: the ONE concrete subject, named specifically. If the brief is generic, INVENT a real-sounding name / brand / person — never "Your Company" or "the product".
- world: the specific invented facts every section will use — proper nouns, dates, numbers, places, product names. Be concrete, e.g. "Founded in Lisbon, 2019 · 80M streams · three albums · sold out the Roundhouse". This is the source of truth writers draw from.
- audience: who it's for, in a phrase.
- tone: the voice, in a few words (e.g. "late-night, intimate, confident").
- artDirection: the photographic vocabulary shared by EVERY image — subject matter, mood, palette (e.g. "wet asphalt at night, neon reflections, fog, cool blues"). One coherent visual world.
Invent boldly and specifically. A great direction makes the rest write itself.`;

const PLANNER_SYSTEM = `You are the design lead. Given the brief and the creative direction, architect the piece as a story: a short title and 5–8 beats forming an arc (scene → tension → turn → proof → momentum → close).
Each beat: a stable id (s1, s2, …), a narrative role, a punchy headline drawn from the direction's WORLD (use its specifics), a one-line intent, a layout grid, and whether it carries a prominent image.
Grids: "full" (full-bleed cover/statement), "split-6040" / "split-4060" (text beside an image), "two-col" (two parallel text ideas), "three-up" (three stats/features).
The FIRST beat is ALWAYS the cover: grid "full", image true. Vary grids across the rest. Use "three-up" ONLY where there are three real stats/features, and "two-col" ONLY for two genuinely parallel ideas — otherwise prefer a split (text + image) or full. Every headline must be specific to the direction — no generic filler.`;

const WRITER_SYSTEM = `You are the writer. Given the brief, the creative direction, the outline, and ONE beat, write that section as a flat "elements" list — each element carries a "cell" (a/b/c, per the beat's grid) plus its kind + fields. Draw every specific (names, numbers, places) from the direction's WORLD.
Element kinds: eyebrow (tiny label), heading (level h1 hero / h2 section title / h3 sub), paragraph (lead=true for one large intro line), bullets (3–5 crisp items), stat (value + label), quote (text + by), image (query + aspect ~1.4), button (CTA label), badge.

Every element MUST carry its content, or omit it: a heading's "text" is the visible title (never empty, never dumped into a paragraph); a stat has BOTH value + label; bullets / paragraph / eyebrow / quote / button / badge are non-empty. Image "query" MUST match the direction's art direction, so every photo shares one visual world.

Placement per grid:
- full cover: cell a = eyebrow, an h1 heading (the title), a lead paragraph (a SUPPORTING subtitle, not the title again), optional badge. NO image element (the section already has a background image).
- split-6040 / split-4060: one cell = eyebrow + h2/h3 heading + a paragraph or bullets; the OTHER cell = exactly one image element (ALWAYS include it — a split is text beside a picture).
- two-col: two parallel text ideas — each cell = a short h3 heading + a paragraph (no image).
- three-up: each cell = one stat (value + label), or a small h3 heading + short paragraph.

Example — a split-6040 whose direction world says "Ember Lane · Huila, Colombia · the Ruiz family · roasting since 2016":
{ "elements": [
  { "cell": "a", "kind": "eyebrow", "text": "SINGLE ORIGIN" },
  { "cell": "a", "kind": "heading", "level": "h2", "text": "Grown at 1,900m in Huila, Colombia" },
  { "cell": "a", "kind": "paragraph", "text": "Ember Lane buys the Ruiz family's whole February harvest and roasts it light enough to taste the plum and cane sugar underneath." },
  { "cell": "b", "kind": "image", "query": "colombian coffee farm mountainside morning fog", "aspect": 1.4 }
] }

Write real, specific, confident copy — punchy headlines, 1–3 sentence paragraphs, concrete numbers. No lorem, no placeholders.`;

const directionText = (d: DirectionT): string =>
    [
        `Creative direction:`,
        `- Subject: ${d.subject}`,
        `- World (use these specifics): ${d.world}`,
        `- Audience: ${d.audience}`,
        `- Tone: ${d.tone}`,
        `- Art direction (all images): ${d.artDirection}`,
    ].join("\n");

const briefPrompt = (b: GenerateInput): string =>
    [
        `Make a ${SURFACE_WORD[b.surface] ?? b.surface}.`,
        `Brief: ${b.prompt}`,
        b.goal && `Goal: ${b.goal}`,
        b.audience && `Audience: ${b.audience}`,
        b.tone && `Tone: ${b.tone}`,
        b.length && `Length: ${b.length}`,
    ]
        .filter(Boolean)
        .join("\n");

const sectionPrompt = (
    b: GenerateInput,
    d: DirectionT,
    outline: OutlineT,
    beat: PlanBeatT,
): string =>
    [
        briefPrompt(b),
        ``,
        directionText(d),
        ``,
        `Outline: ${outline.beats.map((x) => `${x.id}(${x.role})`).join(" → ")}`,
        `Write beat ${beat.id} — role "${beat.role}", grid "${beat.grid}", ${beat.image ? "with" : "no"} image.`,
        `Headline direction: ${beat.headline}. Intent: ${beat.intent}.`,
        `Fill cells: ${(GRID_CELLS[beat.grid] ?? ["a"]).join(", ")}.`,
    ].join("\n");

// --- IR → real elements ---

const slug = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "galleo";

const has = (s?: string): boolean => !!s && s.trim().length > 0;

function toElement(e: ElementIRT): ElementInstance | null {
    switch (e.kind) {
        case "eyebrow":
            return has(e.text) ? t(e.text!.trim(), "label") : null;
        case "heading":
            return has(e.text) ? t(e.text!.trim(), e.level ?? "h2") : null;
        case "paragraph":
            return has(e.text) ? t(e.text!.trim(), e.lead ? "subtitle" : "body") : null;
        case "bullets": {
            const items = (e.items ?? []).map((s) => s.trim()).filter(Boolean);
            return items.length ? bullets(...items) : null;
        }
        case "stat":
            // Drop a stat the model left blank rather than painting an empty tile.
            return has(e.value) || has(e.label)
                ? stat((e.value ?? "").trim(), (e.label ?? "").trim())
                : null;
        case "quote":
            return has(e.text) ? quote(e.text!.trim(), e.by ?? "") : null;
        case "button":
            return button(has(e.text) ? e.text!.trim() : "Learn more");
        case "badge":
            return has(e.text) ? badge(e.text!.trim()) : null;
        default:
            return null; // image is resolved in buildSection (needs an async photo lookup)
    }
}

async function buildSection(
    beat: PlanBeatT,
    content: SectionContentT,
    surface: string,
    direction: DirectionT,
): Promise<Section> {
    // Titles come from the plan: the writer reliably places the heading (right cell + level) but often
    // leaves its text empty, so fill the first empty heading from the beat headline. The planner owns the
    // title; the writer owns the body. (Not a per-case patch — a fixed division of labor.)
    let titled = false;
    for (const e of content.elements) {
        if (e.kind === "heading" && !has(e.text) && !titled) {
            e.text = beat.headline;
            titled = true;
        }
    }
    const keys = GRID_CELLS[beat.grid] ?? ["a"];
    // A full + image beat is a hero — the image becomes the section background, text sits over it. Only
    // BLEED it (edge-to-edge, no card frame) in continuous formats (doc/web); in a deck it stays a
    // contained slide with a background image like the other slides — a bled deck cover reads as a web band.
    const hero = beat.grid === "full" && beat.image;
    const bleed = hero && resolveProfile(surface).kind === "continuous";

    // A hero's image IS the section background, so drop any inline image the writer added on the cover — it
    // duplicates the background and fights the text over it. Heroes = background image + text, nothing else.
    if (hero) content.elements = content.elements.filter((e) => e.kind !== "image");

    // Resolve every image to a real photo — inline elements + the hero background, all in parallel. The
    // hero query uses the shared art direction so the cover matches the rest of the piece's visual world.
    const norm = (e: ElementIRT): string =>
        (e.query ?? direction.artDirection).trim() || "abstract texture";
    const heroQuery = `${direction.artDirection} ${beat.headline}`.trim() || direction.subject;
    const [imgUrls, bgUrl] = await Promise.all([
        resolveImages(content.elements.filter((e) => e.kind === "image").map(norm), {
            orientation: "landscape",
        }),
        hero ? resolveImage(heroQuery, { width: 1700, height: 1100 }) : Promise.resolve(undefined),
    ]);
    const imgSrc = (e: ElementIRT): string => imgUrls.get(norm(e)) ?? slug(`${beat.id}-${norm(e)}`);

    const cells: Record<string, Cell> = {};
    for (const key of keys) {
        const els = content.elements
            .filter((e) => e.cell === key)
            .map((e): ElementInstance | null =>
                e.kind === "image" ? img(imgSrc(e), e.aspect ?? 1.4) : toElement(e),
            )
            .filter((x): x is ElementInstance => !!x);
        if (!els.length) continue;
        cells[key] = cell(els.length === 1 ? els[0]! : group(...els));
    }
    return section(
        beat.id,
        beat.grid,
        cells,
        hero ? { background: bgImage(bgUrl ?? slug(beat.headline), 0.55), bleed } : undefined,
    );
}

// --- the pipeline ---

// Run `fn` over items with at most `limit` in flight (a small pool, so we stream sections fast without
// tripping provider concurrency limits). Each worker pulls the next index; preserves nothing about order.
const WRITER_CONCURRENCY = 5;
async function mapPool<T>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
        for (let i = next++; i < items.length; i = next++) await fn(items[i]!, i);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export interface GenerateResult {
    content: ArtifactContent;
    title: string;
}

// Optional taps for the debug harness — see the raw LLM IR (before it's mapped to elements), which is
// what you tune the prompts against. The app flow ignores these.
export interface GenerateDebug {
    direction?: (direction: DirectionT) => void;
    outline?: (outline: OutlineT) => void;
    section?: (beat: PlanBeatT, content: SectionContentT) => void;
}

export async function runGenerate(
    input: GenerateInput,
    emit: Emit,
    opts?: { quality?: Quality; debug?: GenerateDebug },
): Promise<GenerateResult> {
    const quality = opts?.quality;
    emit({ type: "turn.start", kind: "generate" });
    try {
        // 0) direction — the design lead reads the ambiguous brief and commits to a concrete world.
        emit({ type: "phase", name: "outline" });
        emit({ type: "narration", text: "Reading the brief", sub: input.prompt.slice(0, 80) });
        const direction = await structured<DirectionT>({
            role: "planner",
            quality,
            schema: Direction,
            system: DIRECTION_SYSTEM,
            user: briefPrompt(input),
            maxTokens: 1200,
        });
        opts?.debug?.direction?.(direction);
        emit({ type: "narration", text: "Creative direction", sub: direction.subject });

        // 1) plan — architect the story, grounded in the direction.
        const outline = await structured<OutlineT>({
            role: "planner",
            quality,
            schema: Outline,
            system: PLANNER_SYSTEM,
            user: `${briefPrompt(input)}\n\n${directionText(direction)}`,
            maxTokens: 2000,
        });
        opts?.debug?.outline?.(outline);
        const n = outline.beats.length;
        const beats: Beat[] = outline.beats.map((b) => ({
            id: b.id,
            label: b.headline.slice(0, 40),
            role: b.role,
            grid: b.grid,
            image: b.image,
        }));
        emit({ type: "plan", beats });
        emit({
            type: "narration",
            text: "Planning the story arc",
            mono: ` ${n} beats`,
            sub: outline.beats.map((b) => b.role).join("  →  "),
        });

        // 2) write every section CONCURRENTLY — each streams to the canvas the moment it lands, so total
        // time is ~one section (plus the plan) instead of the sum of all. Slot order is preserved by index
        // (not arrival), and the returned `sections` array is what gets saved — so ordering is never at risk.
        emit({ type: "phase", name: "build" });
        emit({
            type: "narration",
            text: `Writing ${n} sections`,
            mono: " in parallel",
            sub: outline.beats.map((b) => ROLE_TITLE[b.role] ?? b.role).join("  ·  "),
        });
        const sections: Section[] = new Array<Section>(n);
        let placed = 0;
        await mapPool(outline.beats, WRITER_CONCURRENCY, async (beat, i) => {
            emit({ type: "section.status", id: beat.id, status: "writing" });
            const content = await structured<SectionContentT>({
                role: "writer",
                quality,
                schema: SectionContent,
                system: WRITER_SYSTEM,
                user: sectionPrompt(input, direction, outline, beat),
                maxTokens: 1800,
            });
            opts?.debug?.section?.(beat, content);
            if (beat.image) emit({ type: "section.status", id: beat.id, status: "image" });
            const sec = await buildSection(beat, content, input.surface, direction);
            sections[i] = sec;
            emit({
                type: "patch",
                ops: [
                    { op: "addSection", afterId: outline.beats[i - 1]?.id ?? null, section: sec },
                ],
            });
            emit({ type: "section.status", id: beat.id, status: "done" });
            placed += 1;
            emit({ type: "narration", text: `${beat.headline} placed`, mono: ` ✓ ${placed}/${n}` });
        });

        // 3) done
        emit({ type: "phase", name: "done" });
        emit({ type: "turn.done", summary: `Composed ${n} sections` });
        return {
            content: { format: input.surface, theme: input.theme, sections },
            title: outline.title,
        };
    } catch (e) {
        emit({ type: "error", message: (e as Error).message });
        throw e;
    }
}
