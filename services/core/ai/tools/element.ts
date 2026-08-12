import type { ElementInstance, Section } from "@model/artifact";
import type { ArtifactContent } from "@model/artifact";
import { generateText } from "ai";
import { implement, type ToolContext } from "../tools";
import { elementTypes, findElement, replaceElement } from "../locate";
import { modelFor } from "../../models";
import { modelCall } from "../provider";
import { reviseElementParts } from "../prompts/generate";
import { extractJson, zElement } from "../schema";
import { resolveElement } from "../images";

export async function reviseElement(
    content: ArtifactContent,
    sectionId: string,
    element: ElementInstance,
    ctx: ToolContext,
    instruction?: string,
): Promise<ElementInstance> {
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) throw new Error("that section is not in the artifact");
    const parts = reviseElementParts(content, section, element, instruction);
    const modelId = modelFor("section", ctx.tier, ctx.models);
    const call = modelCall(modelId);
    let note = "";
    for (let attempt = 0; attempt < 2; attempt++) {
        const { text } = await generateText({
            ...call,
            system: parts.system,
            prompt: parts.prompt + note,
            abortSignal: ctx.signal,
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
        return resolveElement(revised, ctx.image);
    }
    throw new Error("the model returned an unreadable element");
}

// the agent has no selection to point with, so it names section + element type and we resolve the path
export const reviseElementTool = implement(
    "revise-element",
    async function* (input, ctx): AsyncGenerator<never, Section> {
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
            ctx,
            input.instruction,
        );
        return replaceElement(section, hit.path, revised);
    },
);
