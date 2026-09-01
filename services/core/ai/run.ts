import type {
    TurnEvent,
    TurnRequest,
    TurnKind,
    Beat as PlanBeat,
    BriefRead,
    BuildInput,
    GenerateInput,
    SectionInput,
    Surface,
} from "@model/ai";
import type { ArtifactContent, Section, ElementInstance } from "@model/artifact";
import { mapMediaRefs } from "@model/artifact";
import type { ModelTier } from "@model/billing";
import { modelNote, type AiTask, type ModelOverrides } from "@services/core/models";
import { insertSectionParts, sectionParts, sectionPlanParts, surfaceOf } from "./prompts/generate";
import { runChat } from "./chat";
import type { ImageOptions } from "./images";
import type { ToolPrincipal } from "./execute";
import { resolveImage, resolveImages } from "./images";
import "./tools/register"; // side-effect: register the whole tool catalog
import { generateArtifactTool } from "./tools/generate";
import { drain, makeContext } from "./tools";
import type { ToolContext } from "./tools";
import { planOutlineTool, planSectionTool, writeSectionTool } from "./tools/plan";
import { newSectionId } from "./tools/section";
import type { WorkspaceReader } from "./tools";
import type { Outline, Beat, SectionPlan } from "./schema";
import type { PromptParts } from "./prompts/system";

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export interface RunOpts {
    signal?: AbortSignal;
    // Who the turn is for. The agent's tool calls run through the same executor every other surface
    // uses, and it needs a principal to gate and meter against; `holds: "caller"` keeps the turn's
    // single reservation the thing that pays, so nothing is billed twice.
    principal?: ToolPrincipal;
    image?: ImageOptions;
    workspace?: WorkspaceReader;
    models?: ModelOverrides; // debug: per-task model choice (see models.ts)
    tier?: ModelTier; // picks flash- vs pro-class models
    maxSections?: number;
    // retrieval over the request's attached contexts; each call queries for its own subject
    pack?: (query: string) => Promise<string | null>;
    // chat only: relevant exchanges older than the client's verbatim history window
    recall?: (query: string) => Promise<string | null>;
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
    design: b.design,
    brief: b.brief,
    takeaway: b.takeaway,
    points: b.points,
    covers: b.covers,
});

// an overridden turn says so up front, so odd output reads as the model choice, not a regression
function* noteModels(opts: RunOpts, tasks: readonly AiTask[]): Generator<TurnEvent> {
    const note = modelNote(opts.models, tasks);
    if (note) yield { type: "narration", text: "Model override", mono: ` · ${note}` };
}

export async function* runTurn(req: TurnRequest, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    switch (req.kind) {
        case "generate":
            yield* generateArtifactTool.run(
                req.input,
                makeContext({
                    image: { ...(opts.image ?? {}), cache: new Map<string, string>() },
                    workspace: opts.workspace,
                    signal: opts.signal,
                    tier: opts.tier,
                    models: opts.models,
                    maxSections: opts.maxSections,
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
        case "plan":
            yield* runPlan(req.input, opts);
            return;
        case "build":
            yield* runBuild(req.input, opts);
            return;
    }
}

// nullish fields come back as null from Google's schema
function briefRead(outline: Outline): BriefRead {
    const text = (v: string | null | undefined): string | undefined => v?.trim() || undefined;
    const points = (outline.mustInclude ?? []).map((p) => p.trim()).filter(Boolean);
    return {
        goal: text(outline.goal),
        audience: text(outline.audience),
        tone: text(outline.tone),
        ...(points.length ? { mustInclude: points } : {}),
    };
}

const ctxOf = (opts: RunOpts): ToolContext =>
    makeContext({
        // one phrase memo per run: a motif the piece repeats resolves once
        image: { ...(opts.image ?? {}), cache: opts.image?.cache ?? new Map<string, string>() },
        workspace: opts.workspace,
        signal: opts.signal,
        tier: opts.tier,
        models: opts.models,
        maxSections: opts.maxSections,
        pack: opts.pack,
    });

// A 1x1 transparent pixel: keeps `paintsBand` true, so a band's geometry is identical before and
// after, while the real photograph is still being sourced.
const CLEAR_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * The section as it can be painted the moment its words exist: real copy, real layout, empty frames
 * where the photographs will land. The studio shows this while they are sourced, so a reader
 * watches a section fill in rather than a skeleton sit there.
 */
function withoutImages(section: Section): Section {
    const blanked = mapMediaRefs(section, (url) => (url.startsWith("http") ? url : "")) as Section;
    const bg = section.background;
    return bg?.kind === "image" && bg.image && !bg.image.startsWith("http")
        ? { ...blanked, background: { ...bg, image: CLEAR_PIXEL } }
        : blanked;
}

// what a section write asks the context library for: the beat's whole substance, not its label
const beatQuery = (beat: Beat): string =>
    [beat.label, beat.brief, beat.takeaway, ...(beat.points ?? [])].filter(Boolean).join(". ");

async function* planOutline(
    input: GenerateInput,
    ctx: ToolContext,
): AsyncGenerator<TurnEvent, Outline> {
    const gen = ctx.use(planOutlineTool, input);
    let step = await gen.next();
    while (!step.done) {
        const ev = step.value;
        // partials carry the schema's beats; the wire carries the trimmed shape, same as the plan
        yield ev.type === "plan.partial" ? { ...ev, beats: ev.beats.map(toPlanBeat) } : ev;
        step = await gen.next();
    }
    return step.value;
}

// forwards the tool's live preview events; the pipelined write-all path drains them instead,
// since its write runs as a background promise while the previous beat's images flush
async function* writeSectionFrom(
    parts: PromptParts,
    id: string,
    label: string,
    surface: Surface,
    ctx: ToolContext,
): AsyncGenerator<TurnEvent, Section> {
    return yield* ctx.use(writeSectionTool, { parts, id, label, surface });
}

export async function* runGenerate(
    input: GenerateInput,
    opts: RunOpts = {},
): AsyncGenerator<TurnEvent> {
    const ctx = ctxOf(opts);
    yield { type: "turn.start", kind: "generate" };
    yield { type: "phase", name: "intake" };
    yield* noteModels(opts, ["outline", "section"]);
    yield { type: "narration", text: "Reading the brief", sub: clip(input.prompt, 90) };

    yield { type: "phase", name: "outline" };
    yield { type: "narration", text: "Planning the story arc" };
    const outline = yield* planOutline(input, ctx);
    const beats = outline.beats;
    const planBeats = beats.map(toPlanBeat);
    yield {
        type: "narration",
        text: `Planned “${clip(outline.title, 48)}”`,
        mono: ` · ${beats.length} sections`,
        sub: beats.map((b) => b.role).join("  →  "),
    };
    yield { type: "plan", beats: planBeats, title: outline.title, backdrop: outline.backdrop };

    yield { type: "phase", name: "build" };
    const n = beats.length;
    // Each section is written with the ones before it already on the page (the coherence rule),
    // but only their TEXT: image resolution rides a one-slot pipeline, so beat i+1's model call
    // runs while beat i's stock lookups and adoption settle, and patches still land in order.
    const written: ArtifactContent = { format: input.surface, theme: input.theme, sections: [] };
    interface PendingImages {
        beat: Beat;
        i: number;
        at: number; // index in `written` to replace once resolved
        resolved: Promise<{ section: Section; ms: number }>;
        backdrop: Promise<string> | null; // section 0 carries the artifact backdrop along
    }
    let pending: PendingImages | null = null;

    async function* flushPending(): AsyncGenerator<TurnEvent> {
        if (!pending) return;
        const { beat, i, at, resolved, backdrop } = pending;
        pending = null;
        const { section, ms } = await resolved;
        written.sections[at] = section;
        yield { type: "patch", ops: [{ op: "addSection", section }] };
        yield { type: "section.timing", id: beat.id, imagesMs: ms };
        if (backdrop) {
            const url = await backdrop;
            yield {
                type: "patch",
                ops: [{ op: "setMeta", background: { kind: "image", image: url, scrim: 0.6 } }],
            };
        }
        yield { type: "section.status", id: beat.id, status: "done" };
        yield {
            type: "narration",
            text: `“${beat.label}” placed`,
            mono: ` ✓ ${i + 1}/${n}`,
        };
    }

    for (let i = 0; i < n; i++) {
        const beat = beats[i]!;
        yield { type: "section.status", id: beat.id, status: "active" };
        yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
        yield { type: "section.status", id: beat.id, status: "writing" };

        // start this beat's write, then flush the previous beat's images while it runs
        const writing = writeSection(input, beat, outline, ctx, written);
        yield* flushPending();
        let section = await writing;
        // force a full-bleed bg on cover + closing so those anchor moments never render flat
        if ((i === 0 || i === n - 1) && section.background?.kind !== "image") {
            section = {
                ...section,
                background: { kind: "image", image: input.prompt, scrim: 0.5 },
                // a site marks its bands, so the page still reads as one column as a document
                ...(input.surface === "web" ? { bleed: true } : {}),
            };
        }
        // the words exist: show them at once, with frames where the photographs will be
        yield { type: "section.partial", id: beat.id, section: withoutImages(section) };
        if (beat.image) {
            yield { type: "section.status", id: beat.id, status: "image" };
            yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
        }
        // the next write reads text only, so the unresolved section is already valid context
        written.sections.push(section);
        const started = Date.now();
        pending = {
            beat,
            i,
            at: written.sections.length - 1,
            resolved: resolveImages(section, ctx.image).then((resolvedSection) => ({
                section: resolvedSection,
                ms: Date.now() - started,
            })),
            backdrop:
                i === 0
                    ? resolveImage(
                          outline.backdrop ||
                              `${outline.title}, moody cinematic wide shot, soft focus`,
                          "landscape",
                          ctx.image,
                      )
                    : null,
        };
    }
    yield* flushPending();

    yield { type: "phase", name: "compose" };
    yield { type: "phase", name: "done" };
    yield { type: "turn.done", summary: `Composed ${n} sections — “${clip(outline.title, 48)}”` };
}

// outline only: beats stream to the client for editing, nothing is written
export async function* runPlan(
    input: GenerateInput,
    opts: RunOpts = {},
): AsyncGenerator<TurnEvent> {
    const ctx = ctxOf(opts);
    yield { type: "turn.start", kind: "plan" };
    yield { type: "phase", name: "intake" };
    yield* noteModels(opts, ["brief", "outline"]);
    yield { type: "narration", text: "Reading the brief", sub: clip(input.prompt, 90) };

    yield { type: "phase", name: "outline" };
    yield { type: "narration", text: "Planning the story arc" };
    const outline = yield* planOutline(input, ctx);
    yield {
        type: "narration",
        text: `Planned “${clip(outline.title, 48)}”`,
        mono: ` · ${outline.beats.length} sections`,
        sub: outline.beats.map((b) => b.role).join("  →  "),
    };
    yield {
        type: "plan",
        beats: outline.beats.map(toPlanBeat),
        title: outline.title,
        backdrop: outline.backdrop,
        brief: briefRead(outline),
    };
    // resolve the artifact backdrop now so the board wears it while the outline is being edited
    const backdrop = await resolveImage(
        outline.backdrop || `${outline.title}, moody cinematic wide shot, soft focus`,
        "landscape",
        ctx.image,
    );
    yield {
        type: "patch",
        ops: [{ op: "setMeta", background: { kind: "image", image: backdrop, scrim: 0.6 } }],
    };
    yield { type: "phase", name: "done" };
    yield {
        type: "turn.done",
        summary: `Planned ${outline.beats.length} sections — “${clip(outline.title, 48)}”`,
    };
}

export async function* runBuild(input: BuildInput, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    const ctx = ctxOf(opts);
    const beat: Beat = input.beat;
    // sectionParts wants the full Outline shape; the approved plan carries it minus a required backdrop
    const outline: Outline = {
        title: input.outline.title,
        backdrop: input.outline.backdrop ?? "",
        beats: input.outline.beats,
    };
    yield { type: "turn.start", kind: "build" };
    yield* noteModels(opts, ["section"]);
    yield { type: "phase", name: "build" };
    yield { type: "section.status", id: beat.id, status: "active" };
    yield {
        type: "narration",
        text: `${input.replace ? "Reworking" : "Writing"} “${beat.label}”`,
        mono: ` · ${beat.role}`,
    };
    yield { type: "section.status", id: beat.id, status: "writing" };

    const pack = (await ctx.pack?.(beatQuery(beat)).catch(() => null)) ?? undefined;
    let section = yield* writeSectionFrom(
        sectionParts(input.brief, beat, outline, {
            steer: input.steer,
            note: input.note,
            content: input.content,
            pack,
        }),
        beat.id,
        beat.label,
        input.brief.surface,
        ctx,
    );
    // the piece's bookends never render flat — same rule as the one-shot flow
    if (input.anchor && section.background?.kind !== "image") {
        section = {
            ...section,
            background: { kind: "image", image: input.brief.prompt, scrim: 0.5 },
        };
    }
    yield { type: "section.partial", id: beat.id, section: withoutImages(section) };
    if (beat.image || section.background?.kind === "image") {
        yield { type: "section.status", id: beat.id, status: "image" };
        yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
    }
    section = await resolveImages(section, ctx.image);

    yield { type: "phase", name: "compose" };
    yield {
        type: "patch",
        ops: [
            input.replace
                ? { op: "replaceSection", id: beat.id, section }
                : { op: "addSection", afterId: input.afterId, section },
        ],
    };
    yield { type: "section.status", id: beat.id, status: "done" };
    yield { type: "phase", name: "done" };
    yield {
        type: "turn.done",
        summary: `${input.replace ? "Reworked" : "Placed"} “${clip(beat.label, 48)}”`,
    };
}

async function* runSection(input: SectionInput, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    const ctx = ctxOf(opts);
    const surface = surfaceOf(input.content.format);
    const id = newSectionId(input.content);
    yield { type: "turn.start", kind: "section" };
    yield* noteModels(opts, ["outline", "section"]);
    yield { type: "phase", name: "intake" };
    yield {
        type: "narration",
        text: "Reading the surrounding sections",
        sub: clip(input.instruction, 90),
    };

    yield { type: "phase", name: "outline" };
    const plan = await drain(ctx.use(planSectionTool, sectionPlanParts(input)));
    const beat: Beat = { ...(plan as SectionPlan), id };
    yield { type: "plan", beats: [toPlanBeat(beat)] };
    yield { type: "narration", text: `Planned “${clip(beat.label, 48)}”`, mono: ` · ${beat.role}` };

    yield { type: "phase", name: "build" };
    yield { type: "section.status", id, status: "active" };
    yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
    yield { type: "section.status", id, status: "writing" };
    let section = yield* writeSectionFrom(
        insertSectionParts(input, beat),
        id,
        beat.label,
        surface,
        ctx,
    );
    yield { type: "section.partial", id, section: withoutImages(section) };
    if (beat.image || section.background?.kind === "image") {
        yield { type: "section.status", id, status: "image" };
        yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
    }
    section = await resolveImages(section, ctx.image);

    yield { type: "phase", name: "compose" };
    yield { type: "patch", ops: [{ op: "addSection", afterId: input.afterId, section }] };
    yield { type: "section.status", id, status: "done" };
    yield { type: "phase", name: "done" };
    yield { type: "turn.done", summary: `Added “${clip(beat.label, 48)}”` };
}

// free-form JSON, not structured output: Gemini's response schema can't populate open, arbitrary-keyed data (returns empty cells)

async function writeSection(
    input: GenerateInput,
    beat: Beat,
    outline: Outline,
    ctx: ToolContext,
    written: ArtifactContent,
): Promise<Section> {
    const pack = (await ctx.pack?.(beatQuery(beat)).catch(() => null)) ?? undefined;
    return drain(
        writeSectionFrom(
            sectionParts(input, beat, outline, { content: written, pack }),
            beat.id,
            beat.label,
            input.surface,
            ctx,
        ),
    );
}

async function* unimplemented(kind: TurnKind, what: string): AsyncGenerator<TurnEvent> {
    yield { type: "turn.start", kind };
    yield { type: "error", message: `${what} isn’t available yet.` };
}
