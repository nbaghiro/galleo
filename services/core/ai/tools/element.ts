import { z } from "zod";
import type { Section } from "@model/artifact";
import { register } from "./registry";
import { elementTypes, findElement, replaceElement } from "../locate";
import { reviseElement } from "../run";

// the agent has no selection to point with, so it names section + element type and we resolve the path
export const reviseElementTool = register({
    id: "revise-element",
    describe:
        "Regenerate ONE element in place — a fresh, stronger version of the SAME element type, leaving the rest of the section alone. Reach for it when a chart, stat, table or diagram is weak but the section around it is fine. `elementType` is the element's type (chart · stat · table · diagram · image · quote …); `nth` picks between several of that type in the same section (0 = the first).",
    input: z.object({
        sectionId: z.string().describe("the id of the section the element is in"),
        elementType: z.string().describe("the element's type, e.g. 'chart' or 'stat'"),
        nth: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("which one, when the section has several of that type (default 0)"),
        instruction: z
            .string()
            .optional()
            .describe("optional: how to change it; omit for a straight re-roll"),
    }),
    async *run(input, ctx): AsyncGenerator<never, Section> {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const section = ctx.artifact.sections.find((s) => s.id === input.sectionId);
        if (!section) throw new Error(`There is no section “${input.sectionId}” in this piece.`);
        const hit = findElement(section.root, input.elementType, input.nth ?? 0);
        if (!hit)
            throw new Error(
                `No “${input.elementType}” element in ${input.sectionId}. It contains: ${elementTypes(section.root).join(", ")}.`,
            );
        const revised = await reviseElement(
            ctx.artifact,
            input.sectionId,
            hit.element,
            input.instruction,
            { image: ctx.image, signal: ctx.signal, tier: ctx.tier, models: ctx.models },
        );
        return replaceElement(section, hit.path, revised);
    },
});
