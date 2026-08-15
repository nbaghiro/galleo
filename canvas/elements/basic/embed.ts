import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, DrawStyle, EngineNode, Rect } from "@engine/node";
import { register } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack } from "@themes";

const GLYPH = 20;

// two interlocking links
const linkGlyph =
    (color: string) =>
    (g: DrawContext, box: Rect): void => {
        const s = Math.min(box.w, box.h);
        const x = box.x + (box.w - s) / 2;
        const y = box.y + (box.h - s) / 2;
        const line: DrawStyle = {
            stroke: color,
            width: Math.max(1.25, s * 0.09),
            cap: "round",
            join: "round",
        };
        g.rect(x + s * 0.06, y + s * 0.34, s * 0.46, s * 0.32, { ...line, radius: s * 0.16 });
        g.rect(x + s * 0.48, y + s * 0.34, s * 0.46, s * 0.32, { ...line, radius: s * 0.16 });
    };

// A link/bookmark card (the static fallback for an iframe/embed).
interface EmbedData {
    title?: string;
    url?: string;
}

export const embedElement: ElementSpec<EmbedData> = {
    type: "embed",
    label: "Embed",
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
                w: fixed(GLYPH),
                h: fixed(GLYPH),
                surface: { paint: linkGlyph(ctx.theme.muted) },
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
    frame: true,
    fallback: (d) => d,
};

register(embedElement);
