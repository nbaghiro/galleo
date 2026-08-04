import { z } from "zod";
import type { Section } from "@model/artifact";
import { register } from "./registry";
import { elementTypes, findElement, setImageSrc } from "../locate";
import { findStock, resolveImage } from "../run";

const zImage = z.object({
    phrase: z.string().describe("a short, vivid description of the wanted photo"),
    orientation: z
        .enum(["landscape", "portrait", "square"])
        .optional()
        .describe("preferred shape (default landscape)"),
});

export const sourceImageTool = register({
    id: "source-image",
    describe:
        "Turn a phrase into a real image url — picks stock or AI per the current image strategy.",
    input: zImage,
    async *run(input, ctx) {
        return await resolveImage(input.phrase, input.orientation ?? "landscape", ctx.image);
    },
});

export const findStockImageTool = register({
    id: "find-stock-image",
    describe:
        "Search stock libraries for a photo matching a phrase; returns a url, or null if none fit.",
    input: zImage,
    async *run(input) {
        return await findStock(input.phrase, input.orientation ?? "landscape");
    },
});

// Re-source a picture from a new description. resolveImage honours the turn's image strategy, so this
// finds stock or generates depending on how the run was started — the tool doesn't decide.
export const reimageTool = register({
    id: "reimage",
    describe:
        "Replace an image with one sourced from a new description — the section's own image, or the piece's full-bleed backdrop. Use it when the picture is wrong for the words. `phrase` is a vivid description of the photo you want, not an instruction.",
    input: z.object({
        sectionId: z
            .string()
            .describe("the section whose image to replace; also the anchor for the backdrop"),
        phrase: z
            .string()
            .describe("a vivid description of the wanted photo, e.g. 'a quiet studio at dawn'"),
        target: z
            .enum(["image", "backdrop"])
            .optional()
            .describe(
                "the section's image element (default), or the section's full-bleed backdrop",
            ),
        nth: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("which image, when the section has several (default 0)"),
    }),
    async *run(input, ctx): AsyncGenerator<never, Section> {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const section = ctx.artifact.sections.find((s) => s.id === input.sectionId);
        if (!section) throw new Error(`There is no section “${input.sectionId}” in this piece.`);
        const backdrop = input.target === "backdrop";
        const url = await resolveImage(input.phrase, "landscape", ctx.image);
        if (backdrop)
            return {
                ...section,
                background: {
                    ...(section.background ?? { kind: "image" }),
                    kind: "image",
                    image: url,
                },
            };
        const hit = findElement(section.root, "image", input.nth ?? 0);
        if (!hit)
            throw new Error(
                `No image in ${input.sectionId} to replace. It contains: ${elementTypes(section.root).join(", ")}. To give it a backdrop instead, pass target:"backdrop".`,
            );
        return setImageSrc(section, hit.path, url);
    },
});
