import type { Section } from "@model/artifact";
import type { TurnEvent } from "@model/ai";
import type { MediaItem } from "@model/media";
import { assetIdFromUrl } from "@model/media";
import { implement } from "@services/core/ai/tools";
import { elementTypes, findElement, setImageSrc } from "@services/core/ai/locate";
import { resolveImage } from "@services/core/ai/images";
import {
    generateVideo,
    refImage,
    storeGenerated,
    streamImages,
    type GenRef,
} from "@services/core/media";

const workspaceOf = (ws: { id: string } | undefined): string => {
    if (!ws) throw new Error("There is no workspace in this context.");
    return ws.id;
};

// AI pictures for the media picker: each one lands as its own event as it comes back, stored in
// the library, and the caller bills what actually arrived
implement("generate-image", async function* (input, ctx): AsyncGenerator<TurnEvent, MediaItem[]> {
    const workspaceId = workspaceOf(ctx.principal?.ws);
    let ref: GenRef | undefined;
    if (input.ref) {
        const refId = assetIdFromUrl(input.ref) ?? input.ref;
        const found = await refImage(workspaceId, refId);
        if (!found) throw new Error("That reference image was not found.");
        ref = found;
    }
    const items: MediaItem[] = [];
    for await (const img of streamImages(
        input.prompt.trim(),
        input.aspect,
        input.variations ?? 1,
        input.style ?? "photo",
        ref,
        ctx.tier,
    )) {
        if (!img) {
            yield { type: "media.failed" };
            continue;
        }
        const item = await storeGenerated(workspaceId, "image", img, input.prompt.trim(), {
            style: input.style ?? "photo",
            ...(ref ? { refId: assetIdFromUrl(input.ref) ?? input.ref } : {}),
        });
        items.push(item);
        yield { type: "media", item };
    }
    return items;
});

// one clip; the route heartbeats while the provider renders, since a poll is not an event
implement("generate-video", async function* (input, ctx): AsyncGenerator<
    TurnEvent,
    MediaItem | null
> {
    const workspaceId = workspaceOf(ctx.principal?.ws);
    const vid = await generateVideo(input.prompt.trim(), input.aspect ?? "16:9");
    if (!vid) {
        yield { type: "media.failed", reason: "generation timed out" };
        return null;
    }
    const item = await storeGenerated(workspaceId, "video", vid, input.prompt.trim());
    yield { type: "media", item };
    return item;
});

// placement only: the picture is sourced the way the run sources every other one, stock or AI per
// the turn's strategy, and an AI one is counted by the turn that made it
implement(
    "reimage",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Section> {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const section = ctx.artifact.sections.find((s) => s.id === input.sectionId);
        if (!section) throw new Error(`There is no section “${input.sectionId}” in this piece.`);
        const backdrop = input.target === "backdrop";

        // resolve the target first: its current image becomes the reference, so re-generating keeps
        // the picture's character and the phrase reads as the change to make
        const hit = backdrop ? null : findElement(section.root, "image", input.nth ?? 0);
        if (!backdrop && !hit)
            throw new Error(
                `No image in ${input.sectionId} to replace. It contains: ${elementTypes(section.root).join(", ")}. To give it a backdrop instead, pass target:"backdrop".`,
            );
        const current = backdrop
            ? section.background?.image
            : (hit!.element.data as { src?: string }).src;

        const url = await resolveImage(input.phrase, "landscape", ctx.image, current);

        if (backdrop)
            return {
                ...section,
                background: {
                    ...(section.background ?? { kind: "image" }),
                    kind: "image",
                    image: url,
                },
            };
        return setImageSrc(section, hit!.path, url);
    },
    {
        patch: (section, input) => ({
            artifact: [{ op: "replaceSection", id: input.sectionId, section }],
        }),
        note: (_section, input) =>
            `Proposed a new ${input.target === "backdrop" ? "backdrop" : "image"} for ${input.sectionId}.`,
    },
);
