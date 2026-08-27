import type { Section } from "@model/artifact";
import { sectionForms } from "@model/artifact";
import { generateObject, generateText } from "ai";
import { implement } from "@services/core/ai/tools";
import { withStep } from "@services/core/ai/meter";
import { modelCall } from "@services/core/ai/provider";
import { warn } from "@services/utils/env";
import { defaultModelFor, modelFor } from "@services/core/models";
import { outlineParts } from "@services/core/ai/prompts/generate";
import type { PromptParts } from "@services/core/ai/prompts/system";
import { checkSection } from "@services/core/ai/quality";
import { template } from "@services/core/templates";
import { zOutline, zSection, zSectionPlan } from "@services/core/ai/schema";
import type { Outline, SectionPlan } from "@services/core/ai/schema";
import type { BriefDraft, GenerateInput, Surface } from "@model/ai";
import { zBriefDraft, type BriefDraftGen } from "@services/core/ai/schema";
import { briefParts, type BriefRead } from "@services/core/ai/prompts/brief";
import type { ModelTier } from "@model/billing";
import type { ModelOverrides } from "@services/core/models";
import { extractJson } from "@services/core/ai/schema";

// A schema miss is a sampling accident, not a broken model, and the SDK's own retries do not cover
// it: they only fire on transport errors. Losing the plan ends the whole run, so it gets one more go.
async function withSchemaRetry<T>(call: () => Promise<T>): Promise<T> {
    try {
        return await call();
    } catch (e) {
        const abort = e instanceof DOMException && e.name === "AbortError";
        if (abort || !/did not match schema|No object generated/i.test(String(e))) throw e;
        warn("[ai:outline] schema miss, retrying once");
        return await call();
    }
}

export const planOutlineTool = implement(
    "plan-outline",
    async function* (input: GenerateInput, ctx): AsyncGenerator<never, Outline> {
        // ground the arc in the attached contexts; retrieval failure degrades to no pack
        const packQuery = [input.prompt, ...(input.mustInclude ?? [])].join(". ");
        const pack = (await ctx.pack?.(packQuery).catch(() => null)) ?? undefined;
        // the starter whose shapes this run borrows, if the reader picked one; an id we do not
        // recognise resolves to nothing and the run plans as it would have anyway
        const shape = input.shapeTemplateId ? template(input.shapeTemplateId) : null;
        const forms = shape ? sectionForms(shape.content) : undefined;
        const op = outlineParts(input, {
            maxSections: ctx.maxSections,
            pack,
            forms,
            shapeName: shape?.name,
        });
        const model = modelFor("outline", ctx.tier, ctx.models);
        const outline = await withStep("outline", () =>
            withSchemaRetry(() =>
                generateObject({
                    // warm so section count + arc vary brief-to-brief; section writing stays cooler
                    ...modelCall(model, 0.9),
                    schema: zOutline,
                    system: op.system,
                    prompt: op.prompt,
                    abortSignal: ctx.signal,
                }).then((r) => r.object as Outline),
            ),
        );
        // the prompt asks for the cap; the slice guarantees it
        if (ctx.maxSections) outline.beats = outline.beats.slice(0, ctx.maxSections);
        // and the same rule for the shape: `zBeat.layout` and `blocks` are free strings, so asking
        // is not enough. Only the three shape fields are taken; the story stays the planner's, and
        // a beat past the starter's last one keeps the layout the planner chose for it.
        if (forms?.length)
            outline.beats = outline.beats.map((b, i) => {
                const form = forms[i];
                return form
                    ? { ...b, layout: form.layout, blocks: form.blocks, image: form.image }
                    : b;
            });
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
