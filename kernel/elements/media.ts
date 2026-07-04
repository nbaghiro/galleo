import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fit, grow } from "@model/size";

interface ImageData {
    src: string;
    aspect?: number;
    radius?: number;
    fit?: "cover" | "contain";
}

export const imageElement: ElementSpec<ImageData> = {
    type: "image",
    label: "Image",
    category: "media",
    tier: "primitive",
    create: () => ({
        src: "https://picsum.photos/seed/galleo-image/1100/760",
        aspect: 1.5,
        radius: 14,
        fit: "cover",
    }),
    layout: (data: ImageData, _ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        aspect: data.aspect ?? 1.5,
        image: { src: data.src, fit: data.fit ?? "cover", radius: data.radius },
    }),
    resize: { aspect: { min: 0.4, max: 2.6 } },
    controls: [
        { key: "src", label: "Source URL", control: "text", placeholder: "https://…" },
        {
            key: "fit",
            label: "Fit",
            control: "segmented",
            options: [
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
            ],
        },
        {
            key: "radius",
            label: "Corner radius",
            control: "slider",
            min: 0,
            max: 40,
            step: 1,
            unit: "px",
            group: "Frame",
        },
    ],
};

register(imageElement);
import { fontStack } from "@themes/theme";

// Static placeholder for an embedded video (the static fallback for paged/export is the same).
interface VideoData {
    url?: string;
}

export const videoElement: ElementSpec<VideoData> = {
    type: "video",
    label: "Video",
    category: "media",
    tier: "interactive",
    create: () => ({ url: "" }),
    layout: (_d: VideoData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        aspect: 16 / 9,
        alignX: "center",
        alignY: "center",
        fill: { color: "#15171c", radius: Math.round(ctx.theme.radius / 1.5) },
        children: [
            {
                w: fit(),
                h: fit(),
                alignX: "center",
                alignY: "center",
                padding: { top: 8, bottom: 8, left: 13, right: 11 },
                fill: { color: "rgba(255,255,255,0.16)", radius: 99 },
                children: [
                    {
                        w: fit(),
                        h: fit(),
                        text: {
                            text: "▶",
                            fontId: fontStack("ui", ctx.theme),
                            size: 22,
                            color: "#ffffff",
                            align: "center",
                            wrap: "none",
                        },
                    },
                ],
            },
        ],
    }),
    controls: [
        {
            key: "url",
            label: "Video URL",
            control: "text",
            placeholder: "https://… (YouTube, Vimeo, mp4)",
        },
    ],
    fallback: (d) => d,
};

register(videoElement);
