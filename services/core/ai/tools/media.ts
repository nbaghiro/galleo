import type { Section } from "@model/artifact";
import type { TurnEvent } from "@model/ai";
import { implement } from "../tools";
import { elementTypes, findElement, setImageSrc } from "../locate";
import { resolveImage } from "../images";

// the one producer: honours the turn's stock-or-AI strategy, and refines `ref` when given one
export const generateImageTool = implement("generate-image", async function* (input, ctx) {
    return await resolveImage(input.prompt, input.orientation ?? "landscape", ctx.image, input.ref);
});

// placement only: what image to make is generate-image's job, where to put it is this one's
export const reimageTool = implement("reimage", async function* (input, ctx): AsyncGenerator<
    TurnEvent,
    Section
> {
    if (!ctx.artifact) throw new Error("no artifact is open");
    const section = ctx.artifact.sections.find((s) => s.id === input.sectionId);
    if (!section) throw new Error(`There is no section “${input.sectionId}” in this piece.`);
    const backdrop = input.target === "backdrop";

    // resolve the target first: its current image becomes the reference, so re-generating keeps the
    // picture's character and the phrase reads as the change to make
    const hit = backdrop ? null : findElement(section.root, "image", input.nth ?? 0);
    if (!backdrop && !hit)
        throw new Error(
            `No image in ${input.sectionId} to replace. It contains: ${elementTypes(section.root).join(", ")}. To give it a backdrop instead, pass target:"backdrop".`,
        );
    const current = backdrop
        ? section.background?.image
        : (hit!.element.data as { src?: string }).src;

    const url = yield* ctx.use(generateImageTool, {
        prompt: input.phrase,
        orientation: "landscape",
        ref: current,
    });

    if (backdrop)
        return {
            ...section,
            background: { ...(section.background ?? { kind: "image" }), kind: "image", image: url },
        };
    return setImageSrc(section, hit!.path, url);
});
