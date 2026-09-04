import type { Beat, Brief, GenerateInput, Generation, GenerationOp, TurnEvent } from "@model/ai";
import { makeBeat, newBeatId, unwrittenBeats, withDerivedBlocks, writtenBeats } from "@model/ai";
import type { ArtifactContent, Section } from "@model/artifact";
import { mapMediaRefs } from "@model/artifact";
import type { ToolContext } from "@services/core/ai/tools";
import { getTool, implement, makeContext } from "@services/core/ai/tools";
import type { ToolId } from "@model/tools";
import { sectionParts } from "@services/core/ai/prompts/generate";
import { extractArtifactText, generationDigest } from "@services/core/ai/prompts/system";
import { resolveImages } from "@services/core/ai/images";
import type { ImageOptions } from "@services/core/ai/images";
import type { Outline } from "@services/core/ai/schema";
import { writeSectionTool } from "./plan";
import { modelMap } from "@services/core/models";
import { asBeatRole } from "@model/analytics";
import { report } from "@services/core/ai/tools";
import { SECTION_ATTEMPTS } from "./plan";

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

const need = (ctx: ToolContext): Generation => {
    if (!ctx.generation) throw new Error("There is no generation in this context.");
    return ctx.generation;
};

// every field the caller supplied is theirs; the planner fills the rest later
function briefFrom(
    input: Omit<GenerateInput, "surface" | "theme"> & Partial<GenerateInput>,
): Brief {
    const brief: Brief = {
        prompt: input.prompt,
        surface: input.surface ?? "deck",
        theme: input.theme ?? "studio",
        set: {},
    };
    for (const key of Object.keys(input) as (keyof GenerateInput)[]) {
        const value = input[key];
        if (value === undefined || (Array.isArray(value) && !value.length)) continue;
        Object.assign(brief, { [key]: value });
        brief.set[key] = "user";
    }
    return brief;
}

export const startGenerationTool = implement(
    "start-generation",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Generation> {
        if (!ctx.generations) throw new Error("Generations are not available in this context.");
        const { artifactId, ...fields } = input;
        // repurpose: fold the source artifact's text in server-side
        let source = fields.source;
        if (fields.sourceArtifactId && ctx.workspace) {
            const found = await ctx.workspace.read(fields.sourceArtifactId);
            if (found)
                source = [source, extractArtifactText(found.content)]
                    .filter((s): s is string => !!s?.trim())
                    .join("\n\n");
        }
        // an existing artifact keeps its own format and theme; the brief follows them
        const target = artifactId && ctx.workspace ? await ctx.workspace.read(artifactId) : null;
        if (artifactId && !target) throw new Error("That artifact was not found.");
        const brief = briefFrom({
            ...fields,
            source,
            ...(target
                ? {
                      surface: target.content.format as Brief["surface"],
                      theme: target.content.theme,
                  }
                : {}),
        });
        const got = await ctx.generations.create({ brief, artifactId });
        // the tools that follow in this same turn read the generation off the context
        ctx.generation = got.generation;
        ctx.artifact = got.content;
        ctx.artifactId = got.generation.artifactId;
        yield { type: "narration", text: "Opened the draft", sub: clip(brief.prompt, 90) };
        return got.generation;
    },
    {
        present: (g) => ({ type: "generation", generationId: g.id, artifactId: g.artifactId }),
        note: (g) =>
            `Started generation ${g.id} for “${g.brief.prompt}” (${g.brief.surface}). Nothing is planned yet; plan-outline is the next step.`,
    },
);

implement(
    "revise-brief",
    async function* (input, ctx): AsyncGenerator<TurnEvent, { fields: string[] }> {
        const gen = need(ctx);
        const { generationId: _id, ...fields } = input;
        const patch: Partial<GenerateInput> = {};
        for (const [k, v] of Object.entries(fields))
            if (v !== undefined) Object.assign(patch, { [k]: v });
        if (!Object.keys(patch).length)
            throw new Error("Nothing to change: pass at least one field.");
        // a question answered is a question closed
        const ops: GenerationOp[] = [{ op: "setBrief", patch, by: "user" }];
        if (patch.clarifications && gen.clarify) ops.push({ op: "setClarify", question: null });
        yield { type: "patch", patch: { generation: ops } };
        return { fields: Object.keys(patch) };
    },
    {
        present: () => null,
        note: (r, input) =>
            `Updated the brief (${r.fields.join(", ")}). ${input.generationId ? "The outline was planned against the older brief; plan-outline again when the user wants it to match." : ""}`,
    },
);

implement(
    "revise-outline",
    async function* (
        input,
        ctx,
    ): AsyncGenerator<TurnEvent, { summary: string; ops: GenerationOp[] }> {
        const gen = need(ctx);
        const beats = gen.outline?.beats ?? [];
        const byId = new Map(beats.map((b) => [b.id, b]));
        const written = (id: string): boolean => gen.beats[id]?.status === "done";
        const ops: GenerationOp[] = [];
        const minted: string[] = [];
        const skipped: string[] = [];
        for (const o of input.ops) {
            const fields: Partial<Beat> = {};
            for (const key of [
                "label",
                "role",
                "brief",
                "takeaway",
                "points",
                "layout",
                "blocks",
                "image",
            ] as const)
                if (o[key] !== undefined) Object.assign(fields, { [key]: o[key] });
            if (o.op === "add") {
                const id = newBeatId(beats, minted);
                minted.push(id);
                const beat: Beat = { ...makeBeat(id), ...withDerivedBlocks(fields, undefined), id };
                ops.push({ op: "addBeat", afterId: o.afterId ?? null, beat });
            } else if (!o.id || !byId.has(o.id)) {
                skipped.push(o.id ?? "(no id)");
            } else if (o.op === "update") {
                ops.push({
                    op: "updateBeat",
                    id: o.id,
                    patch: withDerivedBlocks(fields, byId.get(o.id)?.blocks),
                });
            } else if (o.op === "remove") {
                // written work is only removed deliberately, by hand
                if (written(o.id)) skipped.push(`${o.id} (already written)`);
                else ops.push({ op: "removeBeat", id: o.id });
            } else ops.push({ op: "moveBeat", id: o.id, afterId: o.afterId ?? null });
        }
        if (!ops.length)
            throw new Error(
                `No usable outline change: ${skipped.length ? `${skipped.join(", ")} did not match the plan` : "the ops were empty"}. The plan's ids are: ${beats.map((b) => b.id).join(", ") || "none yet"}.`,
            );
        yield { type: "patch", patch: { generation: ops } };
        const beatCount =
            beats.length +
            ops.filter((o) => o.op === "addBeat").length -
            ops.filter((o) => o.op === "removeBeat").length;
        for (const o of ops)
            report(ctx, "generation_outline_edited", {
                edit:
                    o.op === "addBeat"
                        ? "add"
                        : o.op === "removeBeat"
                          ? "remove"
                          : o.op === "moveBeat"
                            ? "reorder"
                            : "rename",
                beat_count: beatCount,
            });
        return { summary: input.summary, ops };
    },
    {
        note: (r, input) =>
            `Outline change proposed: ${input.summary}. The user applies or discards it.`,
    },
);

implement(
    "steer-generation",
    async function* (input, ctx): AsyncGenerator<TurnEvent, { note: string }> {
        const gen = need(ctx);
        const note = input.note.trim();
        if (!note && !gen.steer.trim()) throw new Error("There was no steering note to clear.");
        yield { type: "patch", patch: { generation: [{ op: "setSteer", note }] } };
        if (note && note !== gen.steer.trim())
            report(ctx, "generation_steered", {
                at_index: writtenBeats(gen).length,
                beat_count: gen.outline?.beats.length ?? 0,
            });
        return { note };
    },
    {
        present: () => null,
        note: (r) =>
            r.note
                ? `Steering every section still to come: “${r.note}”. It is in force now; sections already written are untouched.`
                : "Cleared the steering note. Sections still to come go back to following the brief alone.",
    },
);

implement(
    "pick-version",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Section> {
        const gen = need(ctx);
        const state = gen.beats[input.beatId];
        const section = state?.versions[input.index];
        if (!section) throw new Error(`“${input.beatId}” has no take ${input.index + 1}.`);
        yield {
            type: "patch",
            patch: {
                artifact: [{ op: "replaceSection", id: input.beatId, section }],
                generation: [{ op: "pickVersion", id: input.beatId, index: input.index }],
            },
        };
        return section;
    },
    {
        present: () => null,
        note: (_s, input) =>
            `Take ${input.index + 1} of ${input.beatId} is now the one the piece carries.`,
    },
);

implement(
    "read-generation",
    async function* (
        _input,
        ctx,
    ): AsyncGenerator<
        TurnEvent,
        { generation: Generation; content: ArtifactContent; writing: boolean }
    > {
        const gen = need(ctx);
        return {
            generation: gen,
            content: ctx.artifact ?? {
                format: gen.brief.surface,
                theme: gen.brief.theme,
                sections: [],
            },
            // a writer still holds the run: the client polls this after a pause until it lets go
            writing: (await ctx.generations?.held(gen.id)) ?? false,
        };
    },
    { present: () => null, note: (r) => generationDigest(r.generation) },
);

export const finishGenerationTool = implement(
    "finish-generation",
    async function* (_input, ctx): AsyncGenerator<TurnEvent, { skipped: string[] }> {
        const gen = need(ctx);
        const skipped = unwrittenBeats(gen).map((b) => b.id);
        yield {
            type: "patch",
            patch: {
                generation: [
                    ...skipped.map(
                        (id): GenerationOp => ({ op: "setBeat", id, status: "skipped" }),
                    ),
                    { op: "setStage", stage: "done" },
                ],
            },
        };
        await ctx.generations?.finish(gen.id, ctx.tier ? modelMap(ctx.tier, ctx.models) : {});
        report(ctx, "generation_completed", {
            format: gen.brief.surface,
            section_count: writtenBeats(gen).length,
            total_credits: (await ctx.generations?.spent(gen.id)) ?? 0,
            total_ms: Date.now() - Date.parse(gen.createdAt),
        });
        return { skipped };
    },
    {
        present: () => null,
        note: (r) =>
            r.skipped.length
                ? `Finished; ${r.skipped.length} planned section${r.skipped.length === 1 ? " was" : "s were"} skipped (${r.skipped.join(", ")}).`
                : "Finished; every planned section is written.",
    },
);

// The one door for an approved card. A `call` proposal runs its tool now; a `patch` proposal lands
// the change it already made. Either way the executor around this call is what applies.
implement(
    "apply-patch",
    async function* (input, ctx): AsyncGenerator<TurnEvent, unknown> {
        if (input.patch) {
            yield { type: "patch", patch: input.patch };
            return null;
        }
        const pending = ctx.pending?.find((p) => p.id === input.proposal);
        if (!pending)
            throw new Error(
                `There is no pending proposal “${input.proposal ?? ""}”. Propose the change again.`,
            );
        if (pending.patch) {
            yield { type: "patch", patch: pending.patch };
            return null;
        }
        if (pending.call) {
            const tool = getTool(pending.tool as ToolId);
            if (!tool) throw new Error(`“${pending.tool}” is not available.`);
            return yield* ctx.use(tool, pending.call.input as never);
        }
        throw new Error("That proposal carries nothing to apply.");
    },
    {
        // the card the person approved is retired, and a run it started gets its own card
        present: (result, input) => [
            ...(input.proposal ? [{ type: "applied" as const, proposal: input.proposal }] : []),
            ...(isGeneration(result)
                ? [
                      {
                          type: "generation" as const,
                          generationId: result.id,
                          artifactId: result.artifactId,
                      },
                  ]
                : []),
        ],
        note: (_r, input) => `Applied ${input.proposal ?? "the change"}.`,
    },
);

const isGeneration = (v: unknown): v is Generation =>
    !!v && typeof v === "object" && "brief" in v && "beats" in v && "artifactId" in v;

// A 1x1 transparent pixel: keeps `paintsBand` true, so a band's geometry is identical before and
// after, while the real photograph is still being sourced.
const CLEAR_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// the section as it can be painted the moment its words exist: real copy, real layout, empty
// frames where the photographs will land
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

const outlineOf = (gen: Generation): Outline => ({
    title: gen.outline?.title ?? "",
    backdrop: gen.outline?.backdrop ?? "",
    beats: gen.outline?.beats ?? [],
});

// the previous beat that actually has a section: skipped and unwritten beats do not anchor
function afterIdFor(
    content: ArtifactContent,
    beats: readonly Beat[],
    index: number,
): string | null {
    for (let i = index - 1; i >= 0; i--) {
        const id = beats[i]!.id;
        if (content.sections.some((s) => s.id === id)) return id;
    }
    return null;
}

interface Drafted {
    beat: Beat;
    section: Section; // words only; the photographs are still phrases
    replace: boolean;
    startedAt: number;
}

// the brief moved past the outline: writing would put the new brief's words into the old plan
const stale = (gen: Generation): boolean =>
    gen.plannedAgainst !== null && gen.plannedAgainst < gen.briefVersion;
const STALE =
    "The brief changed after this outline was planned. Run plan-outline again so the outline matches, or pass force to write against the current outline anyway.";

const countElements = (el: Section["root"]): number => {
    const kids = (el.data as { children?: Section["root"][] }).children;
    return 1 + (Array.isArray(kids) ? kids.reduce((n, k) => n + countElements(k), 0) : 0);
};

// The moment a beat's card turns from outline to "being written": its status and the narration
// line. Yielded live, ahead of the model call, so the board dims the card while the words are
// coming rather than after.
function* openBeat(beat: Beat, replace: boolean): Generator<TurnEvent> {
    yield { type: "section.status", id: beat.id, status: "active" };
    yield {
        type: "narration",
        text: `${replace ? "Reworking" : "Writing"} “${beat.label}”`,
        mono: ` · ${beat.role}`,
    };
    yield { type: "section.status", id: beat.id, status: "writing" };
}

const isReplace = (content: ArtifactContent, beat: Beat, replace?: boolean): boolean =>
    !!replace || content.sections.some((s) => s.id === beat.id);

// The write half: the beat's words, with the bookend rule and the words-first preview. Images are
// resolved by `land`, so a caller may start the next draft while these are sourced. `opened` says
// the caller already yielded the opening events itself.
async function* draftBeat(
    gen: Generation,
    content: ArtifactContent,
    beat: Beat,
    ctx: ToolContext,
    opts: { note?: string; replace?: boolean; opened?: boolean },
): AsyncGenerator<TurnEvent, Drafted> {
    const startedAt = Date.now();
    const beats = gen.outline?.beats ?? [];
    const index = beats.findIndex((b) => b.id === beat.id);
    const replace = isReplace(content, beat, opts.replace);
    if (!opts.opened) yield* openBeat(beat, replace);
    const pack = (await ctx.pack?.(beatQuery(beat)).catch(() => null)) ?? undefined;
    let section = yield* ctx.use(writeSectionTool, {
        parts: sectionParts(gen.brief, beat, outlineOf(gen), {
            steer: gen.steer.trim() || undefined,
            note: opts.note?.trim() || undefined,
            content,
            pack,
        }),
        id: beat.id,
        label: beat.label,
        surface: gen.brief.surface,
    });
    // the piece's bookends never render flat
    const anchor = index === 0 || index === beats.length - 1;
    if (anchor && section.background?.kind !== "image")
        section = {
            ...section,
            background: { kind: "image", image: gen.brief.prompt, scrim: 0.5 },
            // a site marks its bands, so the page still reads as one column as a document
            ...(gen.brief.surface === "web" ? { bleed: true } : {}),
        };
    yield { type: "section.partial", id: beat.id, section: withoutImages(section) };
    if (beat.image || section.background?.kind === "image") {
        yield { type: "section.status", id: beat.id, status: "image" };
        yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
    }
    return { beat, section, replace, startedAt };
}

// The land half: photographs resolved, then the one patch that adds the section and marks the beat.
// State is read off `state` now rather than at draft time, since the previous beat may only just
// have landed; `images` may belong to a context without the stream's signal.
async function* landBeat(
    d: Drafted,
    state: ToolContext,
    images: ImageOptions,
): AsyncGenerator<TurnEvent, Section> {
    const started = Date.now();
    const section = await resolveImages(d.section, images);
    const beats = state.generation?.outline?.beats ?? [];
    const index = beats.findIndex((b) => b.id === d.beat.id);
    const content = state.artifact ?? { format: "deck", theme: "studio", sections: [] };
    const afterId = afterIdFor(content, beats, index);
    const ops: GenerationOp[] = [{ op: "pushVersion", id: d.beat.id, section }];
    // the first section written is what moves the generation into writing
    if (
        state.generation &&
        state.generation.stage !== "writing" &&
        state.generation.stage !== "done"
    )
        ops.unshift({ op: "setStage", stage: "writing" });
    yield {
        type: "patch",
        patch: {
            artifact: [
                d.replace
                    ? { op: "replaceSection", id: d.beat.id, section }
                    : { op: "addSection", afterId, section },
            ],
            generation: ops,
        },
    };
    yield { type: "section.timing", id: d.beat.id, imagesMs: Date.now() - started };
    yield { type: "section.status", id: d.beat.id, status: "done" };
    report(state, "generation_section_built", {
        index,
        ...(asBeatRole(d.beat.role) ? { beat_role: asBeatRole(d.beat.role) } : {}),
        ms: Date.now() - d.startedAt,
        images_ms: Date.now() - started,
        element_count: countElements(section.root),
    });
    return section;
}

const beatOf = (gen: Generation, id: string): Beat => {
    const beat = gen.outline?.beats.find((b) => b.id === id);
    if (!beat)
        throw new Error(
            `There is no beat “${id}” in the outline. The plan's ids are: ${(gen.outline?.beats ?? []).map((b) => b.id).join(", ") || "none yet"}.`,
        );
    return beat;
};

implement(
    "write-beat",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Section> {
        const gen = need(ctx);
        const beat = beatOf(gen, input.beatId);
        const written = gen.beats[beat.id]?.status === "done";
        if (written && !input.replace)
            throw new Error(`“${beat.label}” is already written; pass replace to rework it.`);
        if (stale(gen) && !input.force) throw new Error(STALE);
        const content = ctx.artifact ?? {
            format: gen.brief.surface,
            theme: gen.brief.theme,
            sections: [],
        };
        yield { type: "phase", name: "build" };
        const drafted = yield* draftBeat(gen, content, beat, ctx, {
            note: input.note,
            replace: input.replace,
        });
        yield { type: "phase", name: "compose" };
        const section = yield* landBeat(drafted, ctx, ctx.image);
        yield { type: "phase", name: "done" };
        return section;
    },
    {
        present: () => null,
        note: (_s, input) =>
            `${input.replace ? "Reworked" : "Wrote"} ${input.beatId}; it is on the page now.`,
    },
);

export const writeBeatsTool = implement(
    "write-beats",
    async function* (
        input,
        ctx,
    ): AsyncGenerator<TurnEvent, { written: string[]; failed: string[] }> {
        let gen = need(ctx);
        if (stale(gen) && !input.force) throw new Error(STALE);
        const ids = input.beatIds?.length ? input.beatIds : unwrittenBeats(gen).map((b) => b.id);
        const written: string[] = [];
        const failed: string[] = [];
        const n = ids.length;
        yield { type: "phase", name: "build" };
        yield { type: "patch", patch: { generation: [{ op: "setStage", stage: "writing" }] } };
        // Each section is written with the ones before it already on the page, but only their
        // TEXT: image resolution rides a one-slot pipeline, so beat i+1's model call runs while
        // beat i's stock lookups settle, and patches still land in order.
        let pending: Drafted | null = null;
        // The beat in flight writes on a context without the stream's signal: a pause is the stream
        // closing, and the section being written should land rather than die with the connection.
        // The loop reads the signal between beats, which is where a pause takes effect.
        const quiet = makeContext({ ...ctx, signal: undefined });
        for (let i = 0; i < n; i++) {
            if (ctx.signal?.aborted) break;
            // fresh state per beat, so an outline or steer edit made since the last one is honoured
            const read = ctx.generations ? await ctx.generations.read(gen.id) : null;
            if (read) {
                gen = read.generation;
                ctx.generation = read.generation;
                ctx.artifact = read.content;
            }
            const content = ctx.artifact ?? {
                format: gen.brief.surface,
                theme: gen.brief.theme,
                sections: [],
            };
            const id = ids[i]!;
            const beat = gen.outline?.beats.find((b) => b.id === id);
            if (!beat || gen.beats[id]?.status === "done") continue;
            try {
                // The card turns "writing" now, while the model writes: the draft's own events are
                // drained until it returns, so its opening would otherwise arrive with its result.
                yield* openBeat(beat, isReplace(content, beat));
                // start this beat's write, then flush the previous beat's images while it runs
                const drafting = drainAll(draftBeat(gen, content, beat, quiet, { opened: true }));
                if (pending) {
                    yield* landBeat(pending, ctx, quiet.image);
                    written.push(pending.beat.id);
                    pending = null;
                }
                const { value, events } = await drafting;
                for (const ev of events) yield ev;
                pending = value;
                yield {
                    type: "narration",
                    text: `“${beat.label}” written`,
                    mono: ` · ${i + 1}/${n}`,
                };
            } catch (e) {
                if (ctx.signal?.aborted) throw e;
                // one beat that will not come back is not a reason to abandon the rest: it keeps
                // its outline card and its Write button, which is the retry that works
                failed.push(id);
                yield {
                    type: "patch",
                    patch: { generation: [{ op: "setBeat", id, status: "failed" }] },
                };
                report(ctx, "generation_section_failed", {
                    index: i,
                    ...(asBeatRole(beat.role) ? { beat_role: asBeatRole(beat.role) } : {}),
                    attempts: SECTION_ATTEMPTS,
                });
                yield {
                    type: "narration",
                    text: `“${beat.label}” didn’t come back`,
                    sub: e instanceof Error ? clip(e.message, 90) : undefined,
                };
            }
        }
        if (pending) {
            yield* landBeat(pending, ctx, quiet.image);
            written.push(pending.beat.id);
        }
        const after = ctx.generations ? await ctx.generations.read(gen.id) : null;
        // nothing left to write means the piece is made; a pause or a failed beat leaves it open,
        // since both have a Write button still to press
        const left = unwrittenBeats(after?.generation ?? ctx.generation ?? gen);
        if (!left.length && !ctx.signal?.aborted)
            yield* ctx.use(finishGenerationTool, { generationId: gen.id });
        yield { type: "phase", name: "done" };
        return { written, failed };
    },
    {
        present: () => null,
        note: (r) =>
            `Wrote ${r.written.length} section${r.written.length === 1 ? "" : "s"}${r.failed.length ? `; ${r.failed.join(", ")} did not come back` : ""}.`,
    },
);

// runs a generator to its value, keeping its events for the caller to replay
async function drainAll<T>(
    gen: AsyncGenerator<TurnEvent, T>,
): Promise<{ value: T; events: TurnEvent[] }> {
    const events: TurnEvent[] = [];
    let step = await gen.next();
    while (!step.done) {
        events.push(step.value);
        step = await gen.next();
    }
    return { value: step.value, events };
}

// what a generation's tools cost: the beats they will write, and whether the run makes AI pictures
export function generationSize(
    id: ToolId,
    input: unknown,
    gen: Generation | undefined,
): { sections: number; images: number; imageSource?: "stock" | "ai" } | null {
    if (!gen) return null;
    const source = gen.brief.imageSource;
    const beats = gen.outline?.beats ?? [];
    if (id === "write-beat") {
        const beatId = (input as { beatId?: string }).beatId;
        const beat = beats.find((b) => b.id === beatId);
        return { sections: 1, images: beat?.image ? 1 : 0, imageSource: source };
    }
    if (id === "write-beats") {
        const ids = (input as { beatIds?: string[] }).beatIds;
        const todo = ids?.length ? beats.filter((b) => ids.includes(b.id)) : unwrittenBeats(gen);
        return {
            sections: Math.max(1, todo.length),
            images: todo.filter((b) => b.image).length,
            imageSource: source,
        };
    }
    return null;
}
