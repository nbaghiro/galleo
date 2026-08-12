import type { Section } from "@model/artifact";
import { generateObject, generateText } from "ai";
import { implement } from "../tools";
import { modelCall } from "../provider";
import { warn } from "../../../utils/env";
import { defaultModelFor, modelFor } from "../../models";
import { outlineParts } from "../prompts/generate";
import type { PromptParts } from "../prompts/system";
import { checkSection } from "../quality";
import { zOutline, zSection, zSectionPlan } from "../schema";
import type { Outline, SectionPlan } from "../schema";
import type { BriefDraft, GenerateInput, Surface } from "@model/ai";
import { zBriefDraft, type BriefDraftGen } from "../schema";
import { briefParts, type BriefRead } from "../prompts/brief";
import type { ModelTier } from "@model/billing";
import type { ModelOverrides } from "../../models";
import { extractJson } from "../schema";

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
        const op = outlineParts(input, ctx.maxSections, pack);
        const model = modelFor("outline", ctx.tier, ctx.models);
        const outline = await withSchemaRetry(() =>
            generateObject({
                // warm so section count + arc vary brief-to-brief; section writing stays cooler
                ...modelCall(model, 0.9),
                schema: zOutline,
                system: op.system,
                prompt: op.prompt,
                abortSignal: ctx.signal,
            }).then((r) => r.object as Outline),
        );
        // the prompt asks for the cap; the slice guarantees it
        if (ctx.maxSections) outline.beats = outline.beats.slice(0, ctx.maxSections);
        return outline;
    },
);

export const planSectionTool = implement(
    "plan-section",
    async function* (input: PromptParts, ctx): AsyncGenerator<never, SectionPlan> {
        const model = modelFor("outline", ctx.tier, ctx.models);
        const { object } = await generateObject({
            ...modelCall(model, 0.9),
            schema: zSectionPlan,
            system: input.system,
            prompt: input.prompt,
            abortSignal: ctx.signal,
        });
        return object as SectionPlan;
    },
);

export interface WriteSectionInput {
    parts: PromptParts;
    id: string;
    label: string;
    surface: Surface;
}

export const writeSectionTool = implement(
    "write-section",
    async function* (input: WriteSectionInput, ctx): AsyncGenerator<never, Section> {
        const modelId = modelFor("section", ctx.tier, ctx.models) || defaultModelFor("section");
        const call = modelCall(modelId);
        let note = ""; // feedback appended to the prompt on retry
        for (let attempt = 0; attempt < 2; attempt++) {
            const { text } = await generateText({
                ...call,
                system: input.parts.system,
                prompt: input.parts.prompt + note,
                abortSignal: ctx.signal,
            });
            const parsed = zSection.safeParse(extractJson(text));
            if (!parsed.success) {
                note =
                    "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object, nothing else.";
                continue;
            }
            const section = { ...parsed.data, id: input.id };
            // auto-repair: one regenerate with issues fed back; accept whatever's valid on the last go
            const { ok, issues } = checkSection(section, input.surface);
            if (ok || attempt === 1) return section;
            note = `\n\nYour previous section had problems: ${issues.join("; ")}. Rewrite it — fill every cell with a real element, lead with a clear headline, and use varied, purposeful elements (a stat/chart/card/bullets where they fit) so the frame reads full, not sparse.`;
        }
        throw new Error(`the model returned an unreadable section for “${input.label}”`);
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

export interface BriefOpts {
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
    const { object } = await generateObject({
        // a re-read runs hot: the point is to land somewhere else
        ...modelCall(modelId, opts.previous ? 1 : 0.7),
        schema: zBriefDraft,
        system: parts.system,
        prompt: parts.prompt,
        abortSignal: opts.signal,
    });
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
