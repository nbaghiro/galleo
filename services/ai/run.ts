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
import type { Usage } from "@model/credits";
import { generateObject, generateText } from "ai";
import { resolveModel, thinklessOpts } from "./provider";
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

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

const slug = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "img";

// tried in order; openverse (keyless) is the fallback
const PROVIDER_ORDER: MediaProvider[] = ["unsplash", "pexels", "pixabay", "openverse"];

// stopwords dropped from image phrases — stock search matches keywords, not sentences
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

export type ImageSource = "stock" | "ai";
export interface ImageOptions {
    source?: ImageSource; // default "stock"
    generate?: (prompt: string, orientation: string) => Promise<string | null>;
}

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

// returns a new element only when something changed (else the same ref)
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

async function resolveImages(section: Section, opts: ImageOptions): Promise<Section> {
    const root = await resolveElement(section.root, opts);
    let background = section.background;
    const bg = section.background;
    if (bg?.kind === "image" && typeof bg.image === "string") {
        background = { ...bg, image: await resolveImage(bg.image, "landscape", opts) };
    }
    return { ...section, root, background };
}

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
    image?: ImageOptions;
    workspace?: WorkspaceReader;
    model?: string; // override the task's default model (registry id)
    onUsage?: (usage: Usage) => void;
}

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

export async function* runGenerate(
    input: GenerateInput,
    opts: RunOpts = {},
): AsyncGenerator<TurnEvent> {
    const { signal } = opts;
    yield { type: "turn.start", kind: "generate" };
    yield { type: "phase", name: "intake" };
    yield { type: "narration", text: "Reading the brief", sub: clip(input.prompt, 90) };

    yield { type: "phase", name: "outline" };
    yield { type: "narration", text: "Planning the story arc" };
    const op = outlineParts(input);
    const { object: outlineObj } = await generateObject({
        model: resolveModel(opts.model ?? defaultModelFor("outline")),
        schema: zOutline,
        system: op.system,
        prompt: op.prompt,
        abortSignal: signal,
        providerOptions: thinklessOpts(opts.model ?? defaultModelFor("outline")),
        // warm so section count + arc vary brief-to-brief; section writing stays cooler
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

    yield { type: "phase", name: "build" };
    const n = beats.length;
    for (let i = 0; i < n; i++) {
        const beat = beats[i]!;
        yield { type: "section.status", id: beat.id, status: "active" };
        yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
        yield { type: "section.status", id: beat.id, status: "writing" };

        let section = await writeSection(input, beat, outline, signal, opts.model);
        // force a full-bleed bg on cover + closing so those anchor moments never render flat
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
        // artifact-level backdrop (editor paints it behind every section; library cover reads it); heavy scrim
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

    yield { type: "phase", name: "compose" };
    yield { type: "phase", name: "done" };
    yield { type: "turn.done", summary: `Composed ${n} sections — “${clip(outline.title, 48)}”` };
}

// fresh non-colliding section id — mirror the editor's "s-xxxx" scheme
function newSectionId(content: ArtifactContent): string {
    const taken = new Set(content.sections.map((s) => s.id));
    for (let n = content.sections.length + 1; ; n++) {
        const id = `s-${n}`;
        if (!taken.has(id)) return id;
    }
}

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

    yield { type: "phase", name: "outline" };
    const pp = sectionPlanParts(input);
    const { object: plan } = await generateObject({
        model: resolveModel(defaultModelFor("outline")),
        schema: zSectionPlan,
        system: pp.system,
        prompt: pp.prompt,
        abortSignal: signal,
        providerOptions: thinklessOpts(defaultModelFor("outline")),
        temperature: 0.9,
    });
    const beat: Beat = { ...(plan as SectionPlan), id };
    yield { type: "plan", beats: [toPlanBeat(beat)] };
    yield { type: "narration", text: `Planned “${clip(beat.label, 48)}”`, mono: ` · ${beat.role}` };

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

// free-form JSON, not structured output: Gemini's response schema can't populate open, arbitrary-keyed data (returns empty cells)
async function writeSectionFrom(
    parts: PromptParts,
    id: string,
    label: string,
    surface: Surface,
    signal?: AbortSignal,
    modelId: string = defaultModelFor("section"),
): Promise<Section> {
    const model = resolveModel(modelId);
    let note = ""; // feedback appended to the prompt on retry
    for (let attempt = 0; attempt < 2; attempt++) {
        const { text } = await generateText({
            model,
            system: parts.system,
            prompt: parts.prompt + note,
            abortSignal: signal,
            providerOptions: thinklessOpts(modelId),
        });
        const parsed = zSection.safeParse(extractJson(text));
        if (!parsed.success) {
            note =
                "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object, nothing else.";
            continue;
        }
        const section = { ...(parsed.data as unknown as Section), id };
        // auto-repair: one regenerate with issues fed back; accept whatever's valid on the final attempt
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
    modelId?: string,
): Promise<Section> {
    return writeSectionFrom(
        sectionParts(input, beat, outline),
        beat.id,
        beat.label,
        input.surface,
        signal,
        modelId,
    );
}

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

async function* unimplemented(kind: TurnKind, what: string): AsyncGenerator<TurnEvent> {
    yield { type: "turn.start", kind };
    yield { type: "error", message: `${what} isn’t available yet.` };
}

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
        providerOptions: thinklessOpts(defaultModelFor("outline")),
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
            providerOptions: thinklessOpts(defaultModelFor("section")),
        });
        const parsed = zElement.safeParse(extractJson(text));
        if (!parsed.success) {
            note =
                "\n\nYour previous reply was not valid JSON. Return ONLY the single element JSON object, nothing else.";
            continue;
        }
        // keep original type + hand-set layout; regenerate content only
        const revised: ElementInstance = {
            type: element.type,
            data: parsed.data.data,
            ...(element.layout ? { layout: element.layout } : {}),
        };
        return resolveElement(revised, opts.image ?? {});
    }
    throw new Error("the model returned an unreadable element");
}

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
