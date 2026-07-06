import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { MediaKind } from "@model/media";
import { GHOST, register } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack } from "@themes/theme";

interface ImageData {
    src: string;
    aspect?: number;
    radius?: number;
    fit?: "cover" | "contain";
    zoom?: number; // percentage (100 = fit the frame, higher crops in)
}

// The "image-like" media family: photo · gif · illustration · sticker. They all paint a url in a frame
// (the engine renders any of them — gifs animate as-is, svgs/illustrations are just images), so one
// factory builds them all. They differ only in defaults (fit / aspect) and the media kind their picker
// opens for (the palette tile art lives in insert.tsx's PREVIEWS map). Editing is entirely on-canvas:
// Replace + Fit + Zoom on the context bar (covers every control → the docked panel is skipped) plus the
// aspect resize handle and the universal radius.
interface MediaConfig {
    type: string;
    label: string;
    kind: MediaKind;
    src: string; // default until the user picks — a keyless, type-appropriate placeholder
    fit: "cover" | "contain";
    aspect: number;
}

function imageLike(cfg: MediaConfig): ElementSpec<ImageData> {
    return {
        type: cfg.type,
        label: cfg.label,
        category: "media",
        tier: "primitive",
        create: () => ({ src: cfg.src, aspect: cfg.aspect, radius: 14, fit: cfg.fit }),
        layout: (data: ImageData): EngineNode => ({
            w: grow(),
            h: fit(),
            aspect: data.aspect ?? cfg.aspect,
            image: {
                src: data.src,
                fit: data.fit ?? cfg.fit,
                radius: data.radius ?? 14,
                zoom: (data.zoom ?? 100) / 100,
            },
        }),
        resize: { aspect: { min: 0.4, max: 2.6 } },
        frame: true, // corner radius comes from the universal frame control on the bar
        bar: ["src", "fit", "zoom"],
        controls: [
            { key: "src", label: cfg.label, control: "media", mediaKind: cfg.kind },
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
                key: "zoom",
                label: "Zoom",
                control: "slider",
                icon: "zoom",
                min: 100,
                max: 300,
                step: 5,
                unit: "%",
                group: "Frame",
            },
        ],
    };
}

// The photo Image element keeps its exported name (used by section-background helpers + tests).
export const imageElement = imageLike({
    type: "image",
    label: "Image",
    kind: "photo",
    src: "https://picsum.photos/seed/galleo-image/1100/760",
    fit: "cover",
    aspect: 1.5,
});
register(imageElement);

// Animated GIFs — render/animate natively; keyless search via Openverse (extension=gif).
register(
    imageLike({
        type: "gif",
        label: "GIF",
        kind: "gif",
        src: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif",
        fit: "cover",
        aspect: 1.5,
    }),
);

// Vector art / drawings — default to `contain` so artwork isn't cropped. Search via Openverse
// (category=illustration) or generate with the illustration AI style.
register(
    imageLike({
        type: "illustration",
        label: "Illustration",
        kind: "illustration",
        src: "https://api.dicebear.com/9.x/shapes/svg?seed=galleo",
        fit: "contain",
        aspect: 1.5,
    }),
);

// Transparent cutouts for accents — small, contained, square by default; the frame stays see-through.
register(
    imageLike({
        type: "sticker",
        label: "Sticker",
        kind: "sticker",
        src: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=galleo",
        fit: "contain",
        aspect: 1,
    }),
);

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
