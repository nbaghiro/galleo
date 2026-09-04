import type { ElementInstance, Section } from "@model/artifact";
import type { ArtifactContent } from "@model/artifact";
import { generateText } from "ai";
import { implement, type ToolContext } from "@services/core/ai/tools";
import { elementAt, elementTypes, findElement, replaceElement } from "@services/core/ai/locate";
import { modelFor } from "@services/core/models";
import { modelCall } from "@services/core/ai/provider";
import { reviseElementParts } from "@services/core/ai/prompts/generate";
import { extractJson, zElement } from "@services/core/ai/schema";
import { resolveElement } from "@services/core/ai/images";

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

// Two callers, two ways to name an element: the editor has a selection and hands over its path, the
// agent has neither and names a type plus an ordinal. Both land on the same body.
implement(
    "revise-element",
    async function* (input, ctx): AsyncGenerator<never, Section> {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const section = ctx.artifact.sections.find((s) => s.id === input.sectionId);
        if (!section) throw new Error(`There is no section “${input.sectionId}” in this piece.`);
        const hit = input.path
            ? { path: input.path, element: elementAt(section.root, input.path) }
            : input.elementType
              ? findElement(section.root, input.elementType, input.nth ?? 0)
              : null;
        if (!hit?.element)
            throw new Error(
                input.path
                    ? `There is no element at that path in ${input.sectionId}.`
                    : `No “${input.elementType}” element in ${input.sectionId}. It contains: ${elementTypes(section.root).join(", ")}.`,
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
    {
        patch: (section, input) => ({
            artifact: [{ op: "replaceSection", id: input.sectionId, section }],
        }),
        note: (_section, input) =>
            `Proposed a fresh ${input.elementType ?? "element"} in ${input.sectionId}; the rest of the section is unchanged.`,
    },
);
