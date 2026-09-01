import type { ArtifactContent, Section } from "@model/artifact";
import type { ToolContext } from "@services/core/ai/tools";
import { sectionForms } from "@model/artifact";
import { generateObject, generateText, streamObject } from "ai";
import { implement } from "@services/core/ai/tools";
import { withStep } from "@services/core/ai/meter";
import { modelCall } from "@services/core/ai/provider";
import { warn } from "@services/utils/env";
import { defaultModelFor, modelFor } from "@services/core/models";
import { outlineParts } from "@services/core/ai/prompts/generate";
import type { PromptParts } from "@services/core/ai/prompts/system";
import { checkSection } from "@services/core/ai/quality";
import { template } from "@services/core/templates";
import { zBeat, zOutline, zSection, zSectionPlan } from "@services/core/ai/schema";
import type { Outline, SectionPlan } from "@services/core/ai/schema";
import type { Beat, TurnEvent } from "@model/ai";
import type { BriefDraft, GenerateInput, Surface } from "@model/ai";
import { zBriefDraft, type BriefDraftGen } from "@services/core/ai/schema";
import { briefParts, type BriefRead } from "@services/core/ai/prompts/brief";
import type { ModelTier } from "@model/billing";
import type { ModelOverrides } from "@services/core/models";
import { extractJson } from "@services/core/ai/schema";

/** The beats of a partial outline that have fully formed, in order; growth stops at the first
 *  incomplete one, and every emission replaces the last, so a still-growing beat is never frozen. */
export function completeBeats(partial: unknown): Beat[] {
    const beats = (partial as { beats?: unknown[] })?.beats;
    if (!Array.isArray(beats)) return [];
    const out: Beat[] = [];
    for (const b of beats) {
        const parsed = zBeat.safeParse(b);
        if (!parsed.success) break;
        out.push(parsed.data as Beat);
    }
    return out;
}

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

// Streamed outline: partial beats reach the studio as they form, and the full-completion wait a
// generateObject would impose disappears from the reader's clock. One schema retry, same as before.
async function* streamOutline(
    op: PromptParts,
    model: string,
    signal?: AbortSignal,
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
        try {
            for await (const part of res.partialObjectStream) {
                const beats = completeBeats(part);
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

export const planOutlineTool = implement(
    "plan-outline",
    async function* (input: GenerateInput, ctx): AsyncGenerator<TurnEvent, Outline> {
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
        const outline = yield* streamOutline(op, model, ctx.signal);
        // the prompt asks for the cap; the slice guarantees it
        if (ctx.maxSections) outline.beats = outline.beats.slice(0, ctx.maxSections);
        // and the same rule for the designs: `zBeat.design` is a free string, so asking is not
        // enough. A beat takes the design it named and one that named none is left alone; only the
        // three shape fields travel, so the story and its length stay the planner's.
        if (forms?.length) {
            const byId = new Map(forms.map((f) => [f.id, f]));
            outline.beats = outline.beats.map((b) => {
                const form = b.design ? byId.get(b.design) : undefined;
                return form
                    ? { ...b, layout: form.layout, blocks: form.blocks, image: form.image }
                    : b;
            });
        }
        return outline;
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
const SECTION_ATTEMPTS = 3;

export const writeSectionTool = implement(
    "write-section",
    async function* (input: WriteSectionInput, ctx): AsyncGenerator<never, Section> {
        const modelId = modelFor("section", ctx.tier, ctx.models) || defaultModelFor("section");
        const call = modelCall(modelId);
        let note = ""; // feedback appended to the prompt on retry
        let usable: Section | null = null; // parsed but short of the checks; better than nothing
        let threw: unknown = null;
        for (let attempt = 0; attempt < SECTION_ATTEMPTS; attempt++) {
            let text: string;
            try {
                ({ text } = await withStep(`section:${input.id}`, () =>
                    generateText({
                        ...call,
                        system: input.parts.system,
                        prompt: input.parts.prompt + note,
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
                note =
                    "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object, nothing else.";
                continue;
            }
            const section = { ...parsed.data, id: input.id };
            // auto-repair: regenerate with the issues fed back; accept whatever's valid on the last go
            const { ok, issues } = checkSection(section, input.surface);
            if (ok) return section;
            usable = section;
            note = `\n\nYour previous section had problems: ${issues.join("; ")}. Rewrite it — fill every cell with a real element, lead with a clear headline, and use varied, purposeful elements (a stat/chart/card/bullets where they fit) so the frame reads full, not sparse.`;
        }
        // A section that parsed but never passed still renders, and shipping it beats losing the
        // beat: the checks describe a good section, not a valid one.
        if (usable) return usable;
        throw new Error(
            threw instanceof Error
                ? `the model could not write “${input.label}”: ${threw.message}`
                : `the model returned an unreadable section for “${input.label}”`,
        );
    },
);

// registered for the contract check + the registry; the route calls expandBrief() directly
implement("draft-brief", async function* (input, ctx): AsyncGenerator<never, BriefDraft> {
    return await expandBrief(input.prompt, input.surface, {
        previous: input.previous,
        tier: ctx.tier,
        models: ctx.models,
        signal: ctx.signal,
    });
});

interface BriefOpts {
    models?: ModelOverrides;
    tier?: ModelTier;
    signal?: AbortSignal;
    previous?: BriefRead; // a re-read: rule this one out and come back with a different angle
}

// expand a raw prompt into the editable brief the studio's Brief stage renders
export async function expandBrief(
    prompt: string,
    surface?: Surface,
    opts: BriefOpts = {},
): Promise<BriefDraft> {
    const parts = briefParts(prompt, surface, opts.previous);
    const modelId = modelFor("brief", opts.tier, opts.models);
    const { object } = await withStep("brief", () =>
        generateObject({
            // a re-read runs hot: the point is to land somewhere else
            ...modelCall(modelId, opts.previous ? 1 : 0.7),
            schema: zBriefDraft,
            system: parts.system,
            prompt: parts.prompt,
            abortSignal: opts.signal,
        }),
    );
    return normalizeBrief(prompt, object, surface);
}

// the count/emptiness rules live here, not in the schema, so a merely untidy read still lands
export function normalizeBrief(prompt: string, read: BriefDraftGen, surface?: Surface): BriefDraft {
    const clean = (s: string | null | undefined): string | undefined => s?.trim() || undefined;
    const points = (read.mustInclude ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 6);
    return {
        prompt,
        surface,
        goal: clean(read.goal),
        audience: clean(read.audience),
        tone: clean(read.tone),
        mustInclude: points.length ? points : undefined,
        clarify: clean(read.clarify),
    };
}
