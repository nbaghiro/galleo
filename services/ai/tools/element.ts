import { z } from "zod";
import type { ElementInstance } from "@model/artifact";
import { register } from "./registry";
import { zElement } from "../schema";
import { reviseElement } from "../run";

// The element tool — regenerate ONE element in place. A thin wrapper over the reviseElement runtime; the
// element is supplied in the input (the registry can't traverse the canvas element tree — that lives in
// @elements — so the caller resolves the element and hands it over). Each surface presents the result its
// own way (the editor → swaps it in as one undo step; a direct/MCP caller → an apply-patch).

export const reviseElementTool = register({
    id: "revise-element",
    describe:
        "Regenerate ONE element in place — a fresh, stronger version of the SAME element type. sectionId = the section it lives in; element = its current { type, data }; instruction = optional steer (omit for a straight re-roll).",
    input: z.object({
        sectionId: z.string().describe("the id of the section the element is in"),
        element: zElement.describe("the element to regenerate, exactly as it is now"),
        instruction: z
            .string()
            .optional()
            .describe("optional: how to change it; omit for a straight regenerate"),
    }),
    async *run(input, ctx) {
        if (!ctx.artifact) throw new Error("no artifact is open");
        return await reviseElement(
            ctx.artifact,
            input.sectionId,
            input.element as unknown as ElementInstance,
            input.instruction,
            { image: ctx.image, signal: ctx.signal },
        );
    },
});
