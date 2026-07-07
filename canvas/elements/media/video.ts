import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { fontStack } from "@themes";

// Static placeholder for an embedded video (the static fallback for paged/export is the same).
interface VideoData {
    url?: string;
}

export const videoElement: ElementSpec<VideoData> = {
    type: "video",
    label: "Video",
    frame: true,
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
