import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { GHOST, register } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";

interface IconGlyph {
    id: string; // iconify id
    body: string; // inner SVG markup, currentColor-based
    vb: string; // viewBox
}
interface IconData {
    glyph: IconGlyph;
    color?: string; // theme role (accent/ink/soft/muted) or custom hex
    size?: number; // px, square; default 72
}

function iconColor(role: string | undefined, theme: LayoutCtx["theme"]): string {
    switch (role) {
        case "ink":
            return theme.ink;
        case "soft":
            return theme.soft;
        case "muted":
            return theme.muted;
        case "accent":
            return theme.accent;
        default:
            return role?.startsWith("#") ? role : theme.accent;
    }
}

const DEFAULT_GLYPH: IconGlyph = {
    id: "lucide:sparkles",
    vb: "0 0 24 24",
    body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"/><circle cx="4" cy="20" r="2"/></g>`,
};

// Custom ghost: auto-skeletonize jams a fixed-size square to one side.
const iconGhost = (): EngineNode => ({
    w: grow(),
    h: fit(),
    alignX: "center",
    alignY: "center",
    children: [{ w: fixed(64), h: fixed(64), fill: { color: GHOST, radius: 14 } }],
});

export const iconElement: ElementSpec<IconData> = {
    type: "icon",
    label: "Icon",
    category: "media",
    tier: "primitive",
    create: () => ({ glyph: DEFAULT_GLYPH, color: "accent", size: 72 }),
    layout: (data: IconData, ctx: LayoutCtx): EngineNode => {
        const size = data.size ?? 72;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${data.glyph.vb}">${data.glyph.body.replaceAll("currentColor", iconColor(data.color, ctx.theme))}</svg>`;
        return {
            w: fixed(size),
            h: fixed(size),
            image: { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, fit: "contain" },
        };
    },
    resize: { width: false, height: { key: "size", min: 24, max: 240, step: 4 } },
    bar: ["glyph", "color"],
    controls: [
        { key: "glyph", label: "Icon", control: "icon" },
        { key: "color", label: "Color", control: "iconColor" },
    ],
    skeleton: iconGhost,
};

register(iconElement);
