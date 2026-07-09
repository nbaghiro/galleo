import { z } from "zod";
import { register } from "./registry";
import { findStock, resolveImage } from "../run";

// The media tools — turn a description into a real image url. `source-image` is the façade that picks stock
// vs AI (per the context's image strategy); `find-stock-image` searches stock only. Both wrap the existing
// image resolution; a URL passes straight through.

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
