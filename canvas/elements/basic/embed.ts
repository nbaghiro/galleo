import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { fontStack } from "@themes";

// A link/bookmark card (the static fallback for an iframe/embed).
interface EmbedData {
    title?: string;
    url?: string;
}

export const embedElement: ElementSpec<EmbedData> = {
    type: "embed",
    label: "Embed",
    frame: true,
    category: "basic",
    tier: "interactive",
    create: () => ({ title: "Embedded link", url: "https://galleo.app" }),
    layout: (d: EmbedData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 13,
        alignY: "center",
        padding: { top: 14, bottom: 14, left: 16, right: 16 },
        fill: {
            color: ctx.theme.bg,
            radius: Math.round(ctx.theme.radius / 2),
            border: { color: ctx.theme.line, width: 1 },
        },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: "🔗",
                    fontId: fontStack("ui", ctx.theme),
                    size: 20,
                    color: ctx.theme.muted,
                    align: "center",
                    wrap: "none",
                },
            },
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 3,
                children: [
                    {
                        w: grow(),
                        h: fit(),
                        text: {
                            text: d.title ?? "Embedded link",
                            fontId: fontStack("ui", ctx.theme),
                            size: 15,
                            weight: 600,
                            color: ctx.theme.ink,
                            align: "start",
                            wrap: "words",
                        },
                    },
                    {
                        w: grow(),
                        h: fit(),
                        text: {
                            text: d.url ?? "https://…",
                            fontId: fontStack("mono", ctx.theme),
                            size: 12,
                            color: ctx.theme.muted,
                            align: "start",
                            wrap: "none",
                        },
                    },
                ],
            },
        ],
    }),
    controls: [
        { key: "title", label: "Title", control: "text" },
        { key: "url", label: "URL", control: "text", placeholder: "https://…" },
    ],
    fallback: (d) => d,
};

register(embedElement);
