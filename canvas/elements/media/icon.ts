import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { GHOST, register } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";

// --- Icon (Iconify) ---
// A monochrome vector glyph that adopts a theme color. It stores the icon's `currentColor`-based SVG body
// plus a colour *role*; layout resolves the role against the artifact theme and bakes it into a data-URI
// the engine paints — so the icon re-tints live when the theme changes, stays crisp at any size, and
// exports cleanly. Sizing is a square `size` (drag the bottom handle); colour + glyph edit on the bar.
interface IconGlyph {
    id: string; // iconify id, e.g. "lucide:sparkles"
    body: string; // inner SVG markup (currentColor-based)
    vb: string; // viewBox, e.g. "0 0 24 24"
}
interface IconData {
    glyph: IconGlyph;
    color?: string; // theme role ("accent" · "ink" · "soft" · "muted") or a custom hex
    size?: number; // px, square; default 72
}

// Resolve a colour role against the live theme (custom hex passes through) — this is what makes an icon
// belong to the deck and follow a theme switch.
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

// A baked default so a freshly-dropped Icon shows something on-theme before the user picks (lucide:sparkles).
const DEFAULT_GLYPH: IconGlyph = {
    id: "lucide:sparkles",
    vb: "0 0 24 24",
    body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"/><circle cx="4" cy="20" r="2"/></g>`,
};

// Custom drop ghost: the icon is a small fixed square, so auto-skeletonize jams it to one side of the
// full-width drop frame. A centered rounded-square glyph reads clearly as "an icon lands here" (mirrors
// how charts/diagrams hand-author their skeletons rather than lean on the generic auto ghost).
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
