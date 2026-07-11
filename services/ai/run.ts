import type {
    TurnEvent,
    TurnRequest,
    TurnKind,
    Beat as PlanBeat,
    GenerateInput,
    SectionInput,
    Surface,
} from "@model/ai";
import type { ArtifactContent, Section, ElementInstance } from "@model/artifact";
import type { MediaProvider } from "@model/media";
import { generateObject, generateText } from "ai";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import {
    editSectionParts,
    insertSectionParts,
    outlineParts,
    reviseElementParts,
    sectionParts,
    sectionPlanParts,
    surfaceOf,
} from "./prompts/generate";
import { checkSection } from "./quality";
import { runChat } from "./chat";
import "./tools/register"; // side-effect: register the whole tool catalog
import { generateArtifactTool } from "./tools/generate";
import { makeContext } from "./tools/registry";
import type { WorkspaceReader } from "./tools/registry";
import { searchStock, stockReady } from "../media/providers";
import { zElement, zOutline, zSection, zSectionPlan } from "./schema";
import type { Outline, Beat, SectionPlan } from "./schema";
import type { PromptParts } from "./prompts/system";

// The turn runtime — the real AI backend. `runTurn` dispatches a TurnRequest to its capability, each an
// async generator that yields the honest TurnEvent stream the client renders (turn.start → phase → plan →
// per-section status/narration/patch → turn.done). Pure of IO except the model calls; the route
// (services/api/ai) handles auth, credit metering, and SSE framing by consuming the generator. `generate`
// is live — a two-phase outline→section flow (prompts in services/ai/prompts); edit/section/chat are the
// next capabilities to fill in behind the same seam. Same protocol as the simulator, so the client is one
// path whether the events come from a fixture or the model.

// Gemini 2.5 runs extended "thinking" by default, which dominates latency for these creative-writing calls
// with little quality gain. Disable it (thinkingBudget 0) so generation is snappy — especially the outline,
// the first thing the user waits on. Ignored by non-Google providers, so this stays provider-agnostic.
const GEN_PROVIDER_OPTS = { google: { thinkingConfig: { thinkingBudget: 0 } } };

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

const slug = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "img";

// --- image resolution: the model writes an art-director phrase for each image; we turn it into a real
// stock photo by distilling a search query and querying the best configured provider (openverse is keyless,
// so there's always a fallback). Stock stays a provider CDN url — no storage, no credits. A deterministic
// placeholder covers a miss. AI image generation with style/theme controls plugs in here later. ---

// Stock providers tried in order — a keyed provider first, then keyless openverse as a reliable fallback
// when a keyed one misses or rate-limits.
const PROVIDER_ORDER: MediaProvider[] = ["unsplash", "pexels", "pixabay", "openverse"];

// Filler to drop when turning an art-director phrase ("aerial view of a wind farm at dusk") into a lean
// stock query ("aerial wind farm dusk") — stock search matches keywords far better than full sentences.
const STOP = new Set([
    "a",
    "an",
    "the",
    "of",
    "in",
    "on",
    "at",
    "with",
    "and",
    "for",
    "to",
    "from",
    "that",
    "this",
    "is",
    "are",
    "view",
    "photo",
    "image",
    "shot",
    "showing",
    "featuring",
    "close",
    "up",
    "over",
]);
function toQuery(phrase: string, max: number): string {
    return phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP.has(w))
        .slice(0, max)
        .join(" ");
}

const orientOf = (aspect: unknown): string => {
    const a = typeof aspect === "number" ? aspect : 1.4;
    return a >= 1.2 ? "landscape" : a <= 0.85 ? "portrait" : "square";
};
const picsum = (phrase: string): string => `https://picsum.photos/seed/${slug(phrase)}/1100/760`;

// Search stock → the top hit's url, or null. Retries across providers AND with a broadened query: a keyed
// provider that errors (rate limit / network) is skipped for keyless openverse; a query that finds nothing
// is retried with fewer keywords. So a real photo turns up unless every provider genuinely has none.
export async function findStock(phrase: string, orientation: string): Promise<string | null> {
    const ready = stockReady();
    const queries = [toQuery(phrase, 6), toQuery(phrase, 3)].filter(
        (q, i, a) => !!q && a.indexOf(q) === i,
    );
    if (!queries.length) return null;
    for (const provider of PROVIDER_ORDER) {
        if (!ready[provider]) continue;
        for (const q of queries) {
            try {
                const { items } = await searchStock(provider, q, 1, orientation, "photo");
                if (items[0]?.url) return items[0].url;
            } catch {
                break; // provider errored — move to the next provider
            }
        }
    }
    return null;
}

// How an art-director phrase becomes a real image. `stock` searches photo libraries (free, fast, a CDN url);
// `ai` generates a bespoke image via the supplied generator (richer + on-brief, but costs credits + latency
// and needs the route's DB to store the asset). This is the ONE knob — resolveImages dispatches on it, so a
// caller flips strategy (or wires AI later, with style/theme controls) without touching the section walk.
export type ImageSource = "stock" | "ai";
export interface ImageOptions {
    source?: ImageSource; // default "stock"
    // Supplied by the route for the "ai" source (it holds the DB to store the asset + charge credits).
    generate?: (prompt: string, orientation: string) => Promise<string | null>;
}

// The façade: one phrase → one real url, honoring the chosen source. AI when asked and wired; otherwise (or
// on any miss/error) stock; and a deterministic placeholder as the final backstop. Already-a-url passes.
export async function resolveImage(
    phrase: string,
    orientation: string,
    opts: ImageOptions,
): Promise<string> {
    if (phrase.startsWith("http")) return phrase;
    if (opts.source === "ai" && opts.generate) {
        const made = await opts.generate(phrase, orientation).catch(() => null);
        if (made) return made;
    }
    const stock = await findStock(phrase, orientation);
    if (stock) return stock;
    process.stderr.write(`[ai:image] no image for "${clip(phrase, 60)}" — using placeholder\n`);
    return picsum(phrase);
}

// Recursively resolve every image in an element tree — an image nested inside a card / group / feature is
// resolved too (missing that was leaving those blank). Returns a new element only when something changed.
async function resolveElement(el: ElementInstance, opts: ImageOptions): Promise<ElementInstance> {
    let data = el.data as Record<string, unknown>;
    if (el.type === "image" && typeof data.src === "string") {
        data = { ...data, src: await resolveImage(data.src, orientOf(data.aspect), opts) };
    }
    if (Array.isArray(data.children)) {
        data = {
            ...data,
            children: await Promise.all(
                (data.children as ElementInstance[]).map((k) => resolveElement(k, opts)),
            ),
        };
    }
    return data === el.data ? el : { ...el, data };
}

// Resolve every image in a section — inline images at ANY depth in the root tree (via resolveElement) plus
// a full-bleed background — in parallel. The stock-vs-AI decision lives entirely in `opts`.
async function resolveImages(section: Section, opts: ImageOptions): Promise<Section> {
    const root = await resolveElement(section.root, opts);
    let background = section.background;
    const bg = section.background;
    if (bg?.kind === "image" && typeof bg.image === "string") {
        background = { ...bg, image: await resolveImage(bg.image, "landscape", opts) };
    }
    return { ...section, root, background };
}

// Flatten an artifact's readable text — every text/label run across its section trees — into one string,
// for source-grounded generation (repurpose: "turn my report into a deck" reads the report's text as source).
export function extractArtifactText(content: ArtifactContent): string {
    const parts: string[] = [];
    const visit = (el: ElementInstance | undefined): void => {
        if (!el) return;
        const d = el.data as { text?: string; label?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) parts.push(d.text.trim());
        if (typeof d.label === "string" && d.label.trim()) parts.push(d.label.trim());
        for (const k of d.children ?? []) visit(k);
    };
    for (const s of content.sections) visit(s.root);
    return parts.join("\n");
}

const toPlanBeat = (b: Beat): PlanBeat => ({
    id: b.id,
    label: b.label,
    role: b.role,
    layout: b.layout,
    image: b.image,
    blocks: b.blocks,
});

export interface RunOpts {
    signal?: AbortSignal;
    image?: ImageOptions; // how images resolve — stock (default) vs ai + its generator; set by the route
    workspace?: WorkspaceReader; // read access to the user's library (find / read artifacts); set by the route
}

// Dispatch a turn to its capability — the DIRECT surface over the tool registry. `generate` runs through
// its registry tool (services/ai/tools); section + chat still route to their runtimes directly until they're
// wrapped too; edit reports "not yet". Same TurnEvent stream out, whichever path.
export async function* runTurn(req: TurnRequest, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    switch (req.kind) {
        case "generate":
            yield* generateArtifactTool.run(
                req.input,
                makeContext({
                    image: opts.image ?? {},
                    workspace: opts.workspace,
                    signal: opts.signal,
                }),
            );
            return;
        case "edit":
            yield* unimplemented("edit", "Editing the whole artifact");
            return;
        case "section":
            yield* runSection(req.input, opts);
            return;
        case "chat":
            yield* runChat(req.input, opts);
            return;
    }
}

// generate — a full artifact from a brief: outline (the plan), then one section written per beat, in order.
export async function* runGenerate(
    input: GenerateInput,
    opts: RunOpts = {},
): AsyncGenerator<TurnEvent> {
    const { signal } = opts;
    yield { type: "turn.start", kind: "generate" };
    yield { type: "phase", name: "intake" };
    yield { type: "narration", text: "Reading the brief", sub: clip(input.prompt, 90) };

    // --- 1. outline (the plan) ---
    yield { type: "phase", name: "outline" };
    yield { type: "narration", text: "Planning the story arc" };
    const op = outlineParts(input);
    const { object: outlineObj } = await generateObject({
        model: resolveModel(defaultModelFor("outline")),
        schema: zOutline,
        system: op.system,
        prompt: op.prompt,
        abortSignal: signal,
        providerOptions: GEN_PROVIDER_OPTS,
        // The outline is where structure is decided; run it warm so section count + arc genuinely vary
        // brief-to-brief (the schema + rubric keep it valid). Section writing stays cooler for accuracy.
        temperature: 0.9,
    });
    const outline: Outline = outlineObj;
    const beats = outline.beats;
    const planBeats = beats.map(toPlanBeat);
    yield {
        type: "narration",
        text: `Planned “${clip(outline.title, 48)}”`,
        mono: ` · ${beats.length} sections`,
        sub: beats.map((b) => b.role).join("  →  "),
    };
    yield { type: "plan", beats: planBeats };

    // --- 2. build: one section per beat, in order ---
    yield { type: "phase", name: "build" };
    const n = beats.length;
    for (let i = 0; i < n; i++) {
        const beat = beats[i]!;
        yield { type: "section.status", id: beat.id, status: "active" };
        yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
        yield { type: "section.status", id: beat.id, status: "writing" };

        // bind the returned section to its planned slot id, then resolve its images
        let section = await writeSection(input, beat, outline, signal);
        // Guarantee the cover + closing sections carry a full-bleed background — inject one from the brief
        // if the model didn't, so those anchor moments never render flat. resolveImages then sources it.
        if ((i === 0 || i === n - 1) && section.background?.kind !== "image") {
            section = {
                ...section,
                background: { kind: "image", image: input.prompt, scrim: 0.5 },
            };
        }
        if (beat.image) {
            yield { type: "section.status", id: beat.id, status: "image" };
            yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
        }
        section = await resolveImages(section, opts.image ?? {});

        yield { type: "patch", ops: [{ op: "addSection", section }] };
        // Give the artifact its own atmospheric backdrop (the editor paints it behind every section, and the
        // library cover reads from it) — without one an AI artifact looks flat in the editor even though its
        // sections have backgrounds. The outline authors an on-theme scene for this (`backdrop`) so it evokes
        // the subject rather than a generic wash; heavy scrim since content sections sit over it.
        if (i === 0) {
            const backdrop = await resolveImage(
                outline.backdrop || `${outline.title}, moody cinematic wide shot, soft focus`,
                "landscape",
                opts.image ?? {},
            );
            yield {
                type: "patch",
                ops: [
                    { op: "setMeta", background: { kind: "image", image: backdrop, scrim: 0.6 } },
                ],
            };
        }
        yield { type: "section.status", id: beat.id, status: "done" };
        yield {
            type: "narration",
            text: `“${beat.label}” placed`,
            mono: ` ✓ ${i + 1}/${n}`,
        };
    }

    // --- 3. done ---
    yield { type: "phase", name: "compose" };
    yield { type: "phase", name: "done" };
    yield { type: "turn.done", summary: `Composed ${n} sections — “${clip(outline.title, 48)}”` };
}

// A fresh section id that doesn't collide with the existing ones (the editor uses "s-xxxx"; we mirror that).
function newSectionId(content: ArtifactContent): string {
    const taken = new Set(content.sections.map((s) => s.id));
    for (let n = content.sections.length + 1; ; n++) {
        const id = `s-${n}`;
        if (!taken.has(id)) return id;
    }
}

// section — insert ONE new section into an existing artifact, aware of the sections around it. Two calls that
// mirror generate scoped to a single beat: (1) plan the section (role + grid + per-cell blocks) so the client
// shows the live skeleton, then (2) write it to fill that exact layout in the artifact's voice. Emits the same
// plan → status → patch → done stream, so the editor renders it through the same path as a full generation.
async function* runSection(input: SectionInput, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    const { signal } = opts;
    const surface = surfaceOf(input.content.format);
    const id = newSectionId(input.content);
    yield { type: "turn.start", kind: "section" };
    yield { type: "phase", name: "intake" };
    yield {
        type: "narration",
        text: "Reading the surrounding sections",
        sub: clip(input.instruction, 90),
    };

    // --- 1. plan the one section (so the skeleton can render before content lands) ---
    yield { type: "phase", name: "outline" };
    const pp = sectionPlanParts(input);
    const { object: plan } = await generateObject({
        model: resolveModel(defaultModelFor("outline")),
        schema: zSectionPlan,
        system: pp.system,
        prompt: pp.prompt,
        abortSignal: signal,
        providerOptions: GEN_PROVIDER_OPTS,
        temperature: 0.9,
    });
    const beat: Beat = { ...(plan as SectionPlan), id };
    yield { type: "plan", beats: [toPlanBeat(beat)] };
    yield { type: "narration", text: `Planned “${clip(beat.label, 48)}”`, mono: ` · ${beat.role}` };

    // --- 2. write it to fill the planned layout, then source its images ---
    yield { type: "phase", name: "build" };
    yield { type: "section.status", id, status: "active" };
    yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
    yield { type: "section.status", id, status: "writing" };
    let section = await writeSectionFrom(
        insertSectionParts(input, beat),
        id,
        beat.label,
        surface,
        signal,
    );
    if (beat.image || section.background?.kind === "image") {
        yield { type: "section.status", id, status: "image" };
        yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
    }
    section = await resolveImages(section, opts.image ?? {});

    yield { type: "phase", name: "compose" };
    yield { type: "patch", ops: [{ op: "addSection", afterId: input.afterId, section }] };
    yield { type: "section.status", id, status: "done" };
    yield { type: "phase", name: "done" };
    yield { type: "turn.done", summary: `Added “${clip(beat.label, 48)}”` };
}

// Write one section as free-form JSON, not structured output. A section's `cells` and each element's
// `data` are open, type-dependent maps; Gemini's response schema can't populate arbitrary-keyed objects
// and returns empty cells, so we let the model emit real JSON (the prompt teaches the exact shape) and
// validate the parse with zSection. Retries once on a malformed parse before failing the turn. Shared by
// generate (write each planned beat) and insert (write one new section), so both get the same auto-repair.
async function writeSectionFrom(
    parts: PromptParts,
    id: string,
    label: string,
    surface: Surface,
    signal?: AbortSignal,
): Promise<Section> {
    const model = resolveModel(defaultModelFor("section"));
    let note = ""; // feedback appended to the prompt on a retry (bad JSON, or a quality check that tripped)
    for (let attempt = 0; attempt < 2; attempt++) {
        const { text } = await generateText({
            model,
            system: parts.system,
            prompt: parts.prompt + note,
            abortSignal: signal,
            providerOptions: GEN_PROVIDER_OPTS,
        });
        const parsed = zSection.safeParse(extractJson(text));
        if (!parsed.success) {
            note =
                "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object, nothing else.";
            continue;
        }
        const section = { ...(parsed.data as unknown as Section), id };
        // Inline auto-repair: a section that trips a deterministic check gets one regenerate with the
        // issues fed back. Accept whatever's valid on the final attempt so one weak section can't stall
        // the whole generation.
        const { ok, issues } = checkSection(section, surface);
        if (ok || attempt === 1) return section;
        note = `\n\nYour previous section had problems: ${issues.join("; ")}. Rewrite it — fill every cell with a real element, lead with a clear headline, and use varied, purposeful elements (a stat/chart/card/bullets where they fit) so the frame reads full, not sparse.`;
    }
    throw new Error(`the model returned an unreadable section for “${label}”`);
}

function writeSection(
    input: GenerateInput,
    beat: Beat,
    outline: Outline,
    signal?: AbortSignal,
): Promise<Section> {
    return writeSectionFrom(
        sectionParts(input, beat, outline),
        beat.id,
        beat.label,
        input.surface,
        signal,
    );
}

// Pull the JSON object out of a model response (tolerate stray prose or ```json fences).
function extractJson(text: string): unknown {
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

// Placeholder for capabilities whose runtime isn’t built yet — emits a turn that immediately reports the
// gap, so the client’s error path handles it uniformly. Replace each with a real generator as it ships.
async function* unimplemented(kind: TurnKind, what: string): AsyncGenerator<TurnEvent> {
    yield { type: "turn.start", kind };
    yield { type: "error", message: `${what} isn’t available yet.` };
}

// --- capability helpers the chat agent calls as tools (produce a section to PROPOSE, not stream) ---

// Build ONE new section (plan → write → images) and return it, for a chat proposal the user applies.
export async function chatAddSection(
    content: ArtifactContent,
    afterId: string | null,
    instruction: string,
    opts: RunOpts = {},
): Promise<Section> {
    const input: SectionInput = { instruction, afterId, content };
    const id = newSectionId(content);
    const pp = sectionPlanParts(input);
    const { object } = await generateObject({
        model: resolveModel(defaultModelFor("outline")),
        schema: zSectionPlan,
        system: pp.system,
        prompt: pp.prompt,
        abortSignal: opts.signal,
        providerOptions: GEN_PROVIDER_OPTS,
        temperature: 0.9,
    });
    const beat: Beat = { ...(object as SectionPlan), id };
    const section = await writeSectionFrom(
        insertSectionParts(input, beat),
        id,
        beat.label,
        surfaceOf(content.format),
        opts.signal,
    );
    return resolveImages(section, opts.image ?? {});
}

// Regenerate ONE element in place and return the fresh version — the ContextBar's Regenerate action (via
// the /ai/element route) and the revise-element tool both land here. The element is passed in by value (the
// runtime can't traverse the canvas element tree — that lives in @elements), and its `section` gives the
// model the surrounding context. Keeps the original type (so the section's layout contract holds) and the
// user's own layout (radius / width / align they set by hand), rewriting only the content; then resolves any
// images the fresh element introduces. Retries once on unreadable JSON before failing.
export async function reviseElement(
    content: ArtifactContent,
    sectionId: string,
    element: ElementInstance,
    instruction?: string,
    opts: RunOpts = {},
): Promise<ElementInstance> {
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new Error("that section is not in the artifact");
    const parts = reviseElementParts(content, section, element, instruction);
    const model = resolveModel(defaultModelFor("section"));
    let note = "";
    for (let attempt = 0; attempt < 2; attempt++) {
        const { text } = await generateText({
            model,
            system: parts.system,
            prompt: parts.prompt + note,
            abortSignal: opts.signal,
            providerOptions: GEN_PROVIDER_OPTS,
        });
        const parsed = zElement.safeParse(extractJson(text));
        if (!parsed.success) {
            note =
                "\n\nYour previous reply was not valid JSON. Return ONLY the single element JSON object, nothing else.";
            continue;
        }
        // Keep the original type + hand-set layout; regenerate content only. Then source any new images.
        const revised: ElementInstance = {
            type: element.type,
            data: parsed.data.data,
            ...(element.layout ? { layout: element.layout } : {}),
        };
        return resolveElement(revised, opts.image ?? {});
    }
    throw new Error("the model returned an unreadable element");
}

// Rewrite an existing section per an instruction and return it, for a chat proposal (→ replaceSection).
export async function chatEditSection(
    content: ArtifactContent,
    sectionId: string,
    instruction: string,
    opts: RunOpts = {},
): Promise<Section | null> {
    const current = content.sections.find((s) => s.id === sectionId);
    if (!current) return null;
    const section = await writeSectionFrom(
        editSectionParts(content, current, instruction),
        sectionId,
        sectionId,
        surfaceOf(content.format),
        opts.signal,
    );
    return resolveImages(section, opts.image ?? {});
}
