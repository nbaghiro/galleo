import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { fontStack } from "@themes";

interface VideoData {
    src?: string;
    aspect?: number; // width / height
    radius?: number;
    controls?: boolean;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
}

export const videoElement: ElementSpec<VideoData> = {
    type: "video",
    label: "Video",
    category: "media",
    tier: "interactive",
    create: () => ({ src: "", aspect: 16 / 9, controls: true }),
    layout: (d: VideoData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        aspect: d.aspect ?? 16 / 9,
        alignX: "center",
        alignY: "center",
        fill: { color: "#15171c", radius: d.radius ?? Math.round(ctx.theme.radius / 1.5) },
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
    bar: ["src"],
    resize: { aspect: { min: 0.4, max: 2.6 } },
    controls: [
        { key: "src", label: "Video", control: "media", mediaKind: "video" },
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
        { key: "controls", label: "Player controls", control: "toggle", group: "Player" },
        { key: "autoplay", label: "Autoplay (muted)", control: "toggle", group: "Player" },
        { key: "loop", label: "Loop", control: "toggle", group: "Player" },
        { key: "muted", label: "Mute", control: "toggle", group: "Player" },
    ],
    fallback: (d) => d,
};

register(videoElement);
