import type { ArtifactContent, Section } from "@model/artifact";
import type { ToolContext } from "@services/core/ai/tools";
import { sectionForms } from "@model/artifact";
import { generateObject, generateText, streamObject } from "ai";
import { implement, report } from "@services/core/ai/tools";
import { withStep } from "@services/core/ai/meter";
import { flag } from "@services/core/traces";
import { modelCall } from "@services/core/ai/provider";
import { warn } from "@services/utils/env";
import { defaultModelFor, modelFor } from "@services/core/models";
import { outlineParts, repairParts } from "@services/core/ai/prompts/generate";
import type { PromptParts } from "@services/core/ai/prompts/system";
import { checkSection } from "@services/core/ai/quality";
import { template } from "@services/core/templates";
import { zBeat, zOutline, zSection, zSectionPlan } from "@services/core/ai/schema";
import type { Outline, SectionPlan } from "@services/core/ai/schema";
import type { Beat, GenerateInput, Surface, TurnEvent } from "@model/ai";
import { writtenBeats } from "@model/ai";
import { extractJson } from "@services/core/ai/schema";
import { resolveImage } from "@services/core/ai/images";

/** The beats of a partial outline that have fully formed, in order; growth stops at the first
 *  incomplete one, and every emission replaces the last, so a still-growing beat is never frozen. */
function completeBeats(partial: unknown): Beat[] {
    const beats = (partial as { beats?: unknown[] })?.beats;
    if (!Array.isArray(beats)) return [];
    const out: Beat[] = [];
    for (const b of beats) {
        const parsed = zBeat.safeParse(b);
        if (!parsed.success) break;
        out.push(toBeat(parsed.data));
    }
    return out;
}

// the wire carries the trimmed shape: the schema's beat plus nothing the client does not read
const toBeat = (b: Outline["beats"][number]): Beat => ({
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

const has = (s: string | undefined): boolean => !!s?.trim();
const saysSomething = (b: Beat): boolean =>
    has(b.takeaway) || (b.points ?? []).some(has) || has(b.brief);

/**
 * Whether an outline is worth painting, which the schema cannot say on its own: `takeaway`, `points`
 * and `brief` are each optional (a spare cover or close is normal), so only the whole outline shows
 * whether the model planned anything. A majority carrying none of them is a blank board, not a
 * terse one. Returns the reason, or null when the outline is usable.
 */
export function outlineProblem(outline: Outline): string | null {
    const beats = outline.beats;
    if (!beats.length) return "no sections came back";
    const thin = beats.filter((b) => !saysSomething(b)).length;
    return thin * 2 > beats.length
        ? `${thin} of ${beats.length} sections came back with nothing to say`
        : null;
}

const clipReason = (e: unknown): string =>
    (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim().slice(0, 160);

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

// Streamed outline: partial beats reach the studio as they form, and the full-completion wait a
// generateObject would impose disappears from the reader's clock. One schema retry, same as before.
// The backdrop phrase comes before the beats in the object the planner writes, so once the beats
// have started arriving and the phrase has stopped changing between two partials, it is complete
// and the picture can be looked up while the rest of the outline streams.
function backdropSettled(part: { backdrop?: unknown }, previous: unknown, beats: number): boolean {
    return (
        beats > 0 &&
        typeof part.backdrop === "string" &&
        part.backdrop.length > 0 &&
        part.backdrop === previous
    );
}

async function* streamOutline(
    op: PromptParts,
    model: string,
    signal?: AbortSignal,
    onBackdrop?: (phrase: string) => void,
): AsyncGenerator<TurnEvent, Outline> {
    for (let attempt = 0; ; attempt++) {
        const res = await withStep("outline", async () =>
            streamObject({
                // warm so section count + arc vary brief-to-brief; section writing stays cooler
                ...modelCall(model, 0.9),
                schema: zOutline,
                system: op.system,
                prompt: op.prompt,
                abortSignal: signal,
            }),
        );
        // `object` and `partialObjectStream` reject independently, so a stream that throws leaves
        // `object` rejecting with nobody awaiting it, and an unhandled rejection takes the whole
        // server process down. Claimed before iterating, keeping the reason so the catch below
        // still names the real cause rather than "it stopped".
        const settled: Promise<{ ok: Outline } | { err: unknown }> = res.object.then(
            (ok) => ({ ok: ok as Outline }),
            (err: unknown) => ({ err }),
        );
        let sent = 0;
        let titleSent = false;
        let lastBackdrop: unknown;
        let told = false;
        try {
            for await (const part of res.partialObjectStream) {
                const beats = completeBeats(part);
                if (onBackdrop && !told && backdropSettled(part, lastBackdrop, beats.length)) {
                    told = true;
                    onBackdrop(part.backdrop as string);
                }
                lastBackdrop = part.backdrop;
                const title = typeof part.title === "string" ? part.title : undefined;
                if (beats.length > sent || (title !== undefined && !titleSent)) {
                    sent = beats.length;
                    titleSent = titleSent || title !== undefined;
                    yield { type: "plan.partial", beats, ...(title ? { title } : {}) };
                }
            }
            const done = await settled;
            if ("err" in done) throw done.err;
            const outline = done.ok;
            // the stream closing is not the same as the model having planned anything
            const problem = outlineProblem(outline);
            if (problem) throw new Error(problem);
            return outline;
        } catch (e) {
            // The signal is the authority on whether to retry, not the error's name: a timeout
            // rejects with a TimeoutError rather than an AbortError, so name-sniffing retried on a
            // signal that was already dead, and the second call's failure had nobody left to catch it.
            if (signal?.aborted) throw e;
            // the cause carries into the message rather than the log alone: after two tries the
            // reader has to choose what to do next, and a different model is usually the answer
            if (attempt >= 1)
                throw new Error(
                    `The outline could not be planned: ${clipReason(e)}. Try again, or pick a different model for this step.`,
                );
            warn(`[ai:outline] ${clipReason(e)}, retrying once`);
        }
    }
}

/**
 * The starter a run follows: one of ours, or a deck of the reader's own, which is how an uploaded
 * PowerPoint template lends its shapes. Only the form travels either way, never a word of copy.
 */
async function shapeSource(
    id: string | undefined,
    ctx: ToolContext,
): Promise<{ name: string; content: ArtifactContent } | null> {
    if (!id) return null;
    const builtIn = template(id);
    if (builtIn) return { name: builtIn.name, content: builtIn.content };
    const own = await ctx.workspace?.read(id).catch(() => null);
    return own ? { name: own.ref.title, content: own.content } : null;
}

/** The plan itself, for a brief: what the tool wraps and what an eval can run with no generation. */
export async function* planOutlineFor(
    input: GenerateInput,
    ctx: ToolContext,
    opts: { onBackdrop?: (phrase: string) => void } = {},
): AsyncGenerator<TurnEvent, Outline> {
    // ground the arc in the attached contexts; retrieval failure degrades to no pack
    const packQuery = [input.prompt, ...(input.mustInclude ?? [])].join(". ");
    const pack = (await ctx.pack?.(packQuery).catch(() => null)) ?? undefined;
    // the starter whose shapes this run borrows, if the reader picked one; an id we do not
    // recognise resolves to nothing and the run plans as it would have anyway
    const shape = await shapeSource(input.shapeTemplateId, ctx);
    const forms = shape ? sectionForms(shape.content) : undefined;
    const op = outlineParts(input, {
        maxSections: ctx.maxSections,
        pack,
        forms,
        shapeName: shape?.name,
    });
    const model = modelFor("outline", ctx.tier, ctx.models);
    const outline = yield* streamOutline(op, model, ctx.signal, opts.onBackdrop);
    // the prompt asks for the cap; the slice guarantees it
    if (ctx.maxSections) outline.beats = outline.beats.slice(0, ctx.maxSections);
    // and the same rule for the designs: `zBeat.design` is a free string, so asking is not
    // enough. A beat takes the design it named and one that named none is left alone; only the
    // three shape fields travel, so the story and its length stay the planner's.
    if (forms?.length) {
        const byId = new Map(forms.map((f) => [f.id, f]));
        outline.beats = outline.beats.map((b) => {
            const form = b.design ? byId.get(b.design) : undefined;
            return form ? { ...b, layout: form.layout, blocks: form.blocks, image: form.image } : b;
        });
    }
    return outline;
}

// nullish fields come back as null from Google's schema
function briefRead(outline: Outline): Partial<GenerateInput> {
    const text = (v: string | null | undefined): string | undefined => v?.trim() || undefined;
    const points = (outline.mustInclude ?? []).map((p) => p.trim()).filter(Boolean);
    return {
        goal: text(outline.goal),
        audience: text(outline.audience),
        tone: text(outline.tone),
        ...(points.length ? { mustInclude: points } : {}),
    };
}

const backdropPhrase = (outline: { title: string; backdrop?: string }): string =>
    outline.backdrop || `${outline.title}, moody cinematic wide shot, soft focus`;

// plans onto the generation in the context: the planner's reading of the brief fills what the user
// left blank, and the outline replaces whatever plan there was, which is why it refuses once
// anything is written
export const planOutlineTool = implement(
    "plan-outline",
    async function* (_input, ctx): AsyncGenerator<TurnEvent, Outline> {
        const gen = ctx.generation;
        if (!gen) throw new Error("There is no generation to plan.");
        if (writtenBeats(gen).length)
            throw new Error(
                "Sections are already written, so a replan would orphan them. Revise the outline instead.",
            );
        yield { type: "phase", name: "intake" };
        yield { type: "narration", text: "Reading the brief", sub: clip(gen.brief.prompt, 90) };
        yield { type: "patch", patch: { generation: [{ op: "setStage", stage: "planning" }] } };
        yield { type: "phase", name: "outline" };
        yield { type: "narration", text: "Planning the story arc" };
        const startedAt = Date.now();
        // the artifact's backdrop is looked up as soon as its phrase has streamed, alongside the
        // beats still coming, rather than after the whole outline has landed
        const early: { phrase: string; url: Promise<string> }[] = [];
        const outline = yield* planOutlineFor(gen.brief, ctx, {
            onBackdrop: (phrase) =>
                void early.push({ phrase, url: resolveImage(phrase, "landscape", ctx.image) }),
        });
        const beats = outline.beats.map(toBeat);
        report(ctx, "generation_planned", {
            format: gen.brief.surface,
            length: gen.brief.length ?? "Standard",
            beat_count: beats.length,
            ms: Date.now() - startedAt,
            model_id: modelFor("outline", ctx.tier, ctx.models),
            ...(gen.brief.shapeTemplateId ? { shape_template_id: gen.brief.shapeTemplateId } : {}),
        });
        yield {
            type: "narration",
            text: `Planned “${clip(outline.title, 48)}”`,
            mono: ` · ${beats.length} sections`,
            sub: beats.map((b) => b.role).join("  →  "),
        };
        yield { type: "plan", beats, title: outline.title, backdrop: outline.backdrop };
        // the board wears the backdrop while the outline is being edited; the lookup started early
        // when the phrase the planner settled on is the one it ended with
        const phrase = backdropPhrase(outline);
        const backdrop =
            early[0]?.phrase === phrase
                ? await early[0].url
                : await resolveImage(phrase, "landscape", ctx.image);
        yield {
            type: "patch",
            patch: {
                generation: [
                    { op: "setBrief", patch: briefRead(outline), by: "planner" },
                    {
                        op: "setOutline",
                        title: outline.title,
                        backdrop: outline.backdrop,
                        beats,
                        clarify: outline.clarify?.trim() || null,
                    },
                ],
                artifact: [
                    {
                        op: "setMeta",
                        background: { kind: "image", image: backdrop, scrim: 0.6 },
                    },
                ],
            },
        };
        yield { type: "phase", name: "done" };
        return outline;
    },
    {
        note: (o) =>
            `Planned ${o.beats.length} sections: ${o.beats.map((b) => `[${b.id}] ${b.label}`).join(", ")}. Nothing is written yet.`,
    },
);

export const planSectionTool = implement(
    "plan-section",
    async function* (input: PromptParts, ctx): AsyncGenerator<never, SectionPlan> {
        const model = modelFor("outline", ctx.tier, ctx.models);
        const { object } = await withStep("plan-section", () =>
            generateObject({
                ...modelCall(model, 0.9),
                schema: zSectionPlan,
                system: input.system,
                prompt: input.prompt,
                abortSignal: ctx.signal,
            }),
        );
        return object as SectionPlan;
    },
);

interface WriteSectionInput {
    parts: PromptParts;
    id: string;
    label: string;
    surface: Surface;
}

// Attempts at one section before the build is told it did not come back. Each one is a whole
// model call, so this is a ceiling on a stubborn beat rather than a budget to spend.
export const SECTION_ATTEMPTS = 3;

export const writeSectionTool = implement(
    "write-section",
    async function* (input: WriteSectionInput, ctx): AsyncGenerator<never, Section> {
        const modelId = modelFor("section", ctx.tier, ctx.models) || defaultModelFor("section");
        const call = modelCall(modelId);
        let note = ""; // feedback appended to the prompt when the reply was not JSON
        let repair: PromptParts | null = null; // the previous object and its problems, on a failed check
        let usable: Section | null = null; // parsed but short of the checks; better than nothing
        let threw: unknown = null;
        for (let attempt = 0; attempt < SECTION_ATTEMPTS; attempt++) {
            let text: string;
            try {
                ({ text } = await withStep(`section:${input.id}`, () =>
                    generateText({
                        ...call,
                        system: repair ? repair.system : input.parts.system,
                        prompt: repair ? repair.prompt : input.parts.prompt + note,
                        abortSignal: ctx.signal,
                    }),
                ));
            } catch (e) {
                // A provider that hiccups past the sdk's own retries (an overloaded model, a
                // dropped socket, a 429 on the last try) costs this attempt rather than the whole
                // section. Letting it out here is what ended a build over one bad call.
                if (ctx.signal?.aborted) throw e;
                threw = e;
                continue;
            }
            const parsed = zSection.safeParse(extractJson(text));
            if (!parsed.success) {
                repair = null;
                note =
                    "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object, nothing else.";
                continue;
            }
            const section = { ...parsed.data, id: input.id };
            // auto-repair: the object and its issues go back for a correction; the last go keeps
            // whatever parsed
            const { ok, issues } = checkSection(section, input.surface);
            if (ok) return section;
            usable = section;
            repair = repairParts(
                input.surface,
                input.parts.prompt,
                JSON.stringify(section),
                issues,
            );
        }
        // A section that parsed but never passed still renders, and shipping it beats losing the
        // beat: the checks describe a good section, not a valid one. The trace says it happened.
        if (usable) {
            flag("unchecked");
            return usable;
        }
        throw new Error(
            threw instanceof Error
                ? `the model could not write “${input.label}”: ${threw.message}`
                : `the model returned an unreadable section for “${input.label}”`,
        );
    },
);
