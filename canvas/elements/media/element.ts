import type { ControlField, ElementSpec, LayoutCtx, ResizeSpec } from "@elements/spec";
import type { DrawContext, DrawStyle, EngineNode, Rect } from "@engine/node";
import type { ImageFit, MediaElementKind, MediaShape, ThemeRole, Vector } from "@model/elements";
import { register } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { mix } from "@themes";
import { IMAGE_FIT } from "@model/elements";
import { youtubeId } from "@model/media";
import { DEFAULT_GLYPH, DEFAULT_GRAPHIC, drawVector, parseSvg, type IconGlyph } from "./vector";

// One element for everything a person would call a picture: a photo, a GIF, an illustration, a
// sticker, a clip, an icon, a pasted vector. `kind` picks the branch, and everything else about the
// frame is shared, so swapping one for another in the picker is a data patch: the node keeps its id
// (comment anchors survive), its width in the row, and its aspect.
export interface MediaData {
    kind: MediaElementKind;
    // url-backed kinds
    src?: string;
    alt?: string;
    dims?: { w: number; h: number }; // the picked source's pixel size, written by the media control
    thumbSrc?: string; // the picked source's small copy, written by the media control
    poster?: string; // video: still frame for every static paint (thumbs, previews, exports)
    // vector-backed kinds
    glyph?: IconGlyph;
    doc?: Vector;
    color?: string; // icon: theme role (accent/ink/soft/muted) or hex
    adoptTheme?: boolean; // graphic
    // the frame, shared by every kind
    shape?: MediaShape;
    aspect?: number;
    radius?: number;
    fit?: ImageFit;
    zoom?: number; // percent, 100 = fit frame, higher crops in
    focusX?: number; // percent, which point of the image a crop keeps; 50/50 (absent) = center
    focusY?: number;
    size?: number; // side length for the kinds that size rather than frame
    ring?: boolean; // circle shape: accent border
    // video playback
    controls?: boolean;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
}

// controls receive the raw data bag, so the kind arrives unknown and is narrowed rather than cast
const isVectorKind = (kind: unknown): boolean => kind === "icon" || kind === "graphic";
// A tree written before the merge carries no kind in its data, but the type it was stored under is
// registered as a variant that knows one, so the spec supplies it.
const kindOf = (d: MediaData, fallback: MediaElementKind): MediaElementKind =>
    d.kind && d.kind in DEFAULT_ASPECT ? d.kind : fallback;
const fitOf = (kind: unknown, fit: unknown): ImageFit =>
    fit === "cover" || fit === "contain"
        ? fit
        : DEFAULT_FIT[
              (kind as MediaElementKind) in DEFAULT_FIT ? (kind as MediaElementKind) : "photo"
          ];
// a circle sizes by its side; so does an icon
const isSized = (d: MediaData, k: MediaElementKind): boolean =>
    kindOf(d, k) === "icon" || d.shape === "circle";

const DEFAULT_ASPECT: Record<MediaElementKind, number> = {
    photo: 1.5,
    gif: 1.5,
    illustration: 1.5,
    sticker: 1,
    video: 16 / 9,
    icon: 1,
    graphic: 1,
};
const DEFAULT_FIT: Record<MediaElementKind, ImageFit> = {
    photo: "cover",
    gif: "cover",
    illustration: "contain",
    sticker: "contain",
    video: "cover",
    icon: "contain",
    graphic: "contain",
};

// The source's own ratio, when it is one a frame can sanely take; the author's `aspect` still wins.
function naturalAspect(d: MediaData): number | undefined {
    const w = d.dims?.w ?? 0;
    const h = d.dims?.h ?? 0;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
    const a = w / h;
    return a >= 0.05 && a <= 20 ? a : undefined;
}

const aspectOf = (d: MediaData, k: MediaElementKind): number =>
    d.shape === "circle" ? 1 : (d.aspect ?? naturalAspect(d) ?? DEFAULT_ASPECT[kindOf(d, k)]);

const radiusOf = (d: MediaData, ctx: LayoutCtx, k: MediaElementKind): number =>
    d.shape === "circle"
        ? (d.size ?? 72)
        : (d.radius ?? (kindOf(d, k) === "video" ? Math.round(ctx.theme.radius / 1.5) : 14));

// YouTube and Vimeo pages have no file to paint, but YouTube publishes a still for every id
function posterOf(d: MediaData): string | undefined {
    if (d.poster) return d.poster;
    const yt = youtubeId(d.src);
    return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : undefined;
}

const GLYPH = 34;

// frame, sun, mountain
const mediaGlyph =
    (color: string) =>
    (g: DrawContext, box: Rect): void => {
        const s = Math.min(box.w, box.h);
        const x = box.x + (box.w - s) / 2;
        const y = box.y + (box.h - s) / 2;
        const line: DrawStyle = {
            stroke: color,
            width: Math.max(1.25, s * 0.07),
            cap: "round",
            join: "round",
        };
        g.rect(x, y + s * 0.1, s, s * 0.8, { ...line, radius: s * 0.12 });
        g.circle(x + s * 0.31, y + s * 0.36, s * 0.075, { fill: color });
        g.polyline(
            [
                [x + s * 0.12, y + s * 0.76],
                [x + s * 0.38, y + s * 0.49],
                [x + s * 0.59, y + s * 0.66],
                [x + s * 0.71, y + s * 0.56],
                [x + s * 0.88, y + s * 0.73],
            ],
            line,
        );
    };

// A frame with nothing in it yet: a planned section, or a cleared picker. Painting the element's own
// empty state beats an image leaf with no source, which renders as a blank hole.
function emptyFrame(d: MediaData, ctx: LayoutCtx, k: MediaElementKind): EngineNode {
    const side = isSized(d, k) ? fixed(d.size ?? 72) : undefined;
    return {
        w: side ?? grow(),
        h: side ?? fit(),
        aspect: side ? undefined : aspectOf(d, k),
        alignX: "center",
        alignY: "center",
        fill: { color: mix(ctx.theme.surface, ctx.theme.ink, 0.07), radius: radiusOf(d, ctx, k) },
        children: [
            {
                w: fixed(GLYPH),
                h: fixed(GLYPH),
                surface: { paint: mediaGlyph(mix(ctx.theme.surface, ctx.theme.ink, 0.3)) },
            },
        ],
    };
}

const iconPaint = (color: string | undefined): { role: ThemeRole } | { color: string } =>
    !color ? { role: "accent" } : color.startsWith("#") ? { color } : { role: color as ThemeRole };

function vectorNode(d: MediaData, ctx: LayoutCtx, k: MediaElementKind): EngineNode {
    if (kindOf(d, k) === "icon") {
        const side = fixed(d.size ?? 72);
        const glyph = d.glyph ?? DEFAULT_GLYPH;
        return {
            w: side,
            h: side,
            surface: {
                paint: (g, box) =>
                    drawVector(g, box, parseSvg(glyph.body, glyph.vb), ctx.theme, {
                        tint: iconPaint(d.color),
                    }),
            },
        };
    }
    const doc = d.doc ?? DEFAULT_GRAPHIC;
    return {
        w: grow(),
        h: fit(),
        aspect: (doc.vb[2] || 1) / (doc.vb[3] || 1),
        surface: {
            paint: (g, box) =>
                drawVector(g, box, doc, ctx.theme, { adoptTheme: d.adoptTheme ?? true }),
        },
    };
}

// A clip paints as its still, over a dark plate, under a play badge: the same picture Present, the
// published page and every export show, with the player mounted over it only where one can run.
function videoNode(d: MediaData, ctx: LayoutCtx, k: MediaElementKind): EngineNode {
    const radius = radiusOf(d, ctx, k);
    const poster = posterOf(d);
    return {
        w: grow(),
        h: fit(),
        aspect: aspectOf(d, k),
        alignX: "center",
        alignY: "center",
        fill: { color: "#15171c", radius },
        image: poster ? { src: poster, fit: "cover", radius } : undefined,
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
                            fontId: ctx.theme.fontBody,
                            size: 22,
                            color: "#ffffff",
                            align: "center",
                            wrap: "none",
                        },
                    },
                ],
            },
        ],
    };
}

function pictureNode(d: MediaData, ctx: LayoutCtx, k: MediaElementKind): EngineNode {
    const radius = radiusOf(d, ctx, k);
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v / 100));
    const image = {
        src: d.src!,
        thumb: d.thumbSrc,
        alt: d.alt?.trim() || undefined,
        natural: naturalAspect(d) ? d.dims : undefined,
        fit: fitOf(kindOf(d, k), d.fit),
        radius,
        zoom: (d.zoom ?? 100) / 100,
        ...(d.focusX !== undefined || d.focusY !== undefined
            ? { focus: { x: clamp01(d.focusX ?? 50), y: clamp01(d.focusY ?? 50) } }
            : {}),
    };
    if (d.shape !== "circle") return { w: grow(), h: fit(), aspect: aspectOf(d, k), image };
    const side = fixed(d.size ?? 72);
    // the ring is a wrapper so the border sits outside the picture rather than over it
    const inner: EngineNode = { w: side, h: side, image: { ...image, fit: "cover", radius } };
    return d.ring
        ? {
              w: fit(),
              h: fit(),
              padding: { top: 2, bottom: 2, left: 2, right: 2 },
              fill: { radius: 99, border: { color: ctx.theme.accent, width: 2 } },
              children: [inner],
          }
        : inner;
}

function mediaLayout(d: MediaData, ctx: LayoutCtx, k: MediaElementKind): EngineNode {
    const kind = kindOf(d, k);
    if (isVectorKind(kind)) return vectorNode(d, ctx, k);
    if (!d.src) return emptyFrame(d, ctx, k);
    return kind === "video" ? videoNode(d, ctx, k) : pictureNode(d, ctx, k);
}

const KIND_LABEL: Record<MediaElementKind, string> = {
    photo: "Image",
    gif: "GIF",
    illustration: "Illustration",
    sticker: "Sticker",
    video: "Video",
    icon: "Icon",
    graphic: "Graphic",
};

const CONTROLS: ControlField[] = [
    {
        key: "src",
        label: "Source",
        control: "media",
        dimsKey: "dims",
        posterKey: "poster",
        thumbKey: "thumbSrc",
        visibleWhen: (d) => !isVectorKind(d.kind),
    },
    {
        key: "glyph",
        label: "Icon",
        control: "icon",
        visibleWhen: (d) => d.kind === "icon",
    },
    {
        key: "color",
        label: "Color",
        control: "iconColor",
        visibleWhen: (d) => d.kind === "icon",
    },
    {
        key: "doc",
        label: "SVG",
        control: "vector",
        visibleWhen: (d) => d.kind === "graphic",
    },
    {
        key: "adoptTheme",
        label: "Match theme colors",
        control: "toggle",
        group: "Color",
        visibleWhen: (d) => d.kind === "graphic",
    },
    {
        key: "fit",
        label: "Fit",
        control: "segmented",
        options: IMAGE_FIT.map((v) => ({ value: v, label: v === "cover" ? "Cover" : "Contain" })),
        visibleWhen: (d) => !isVectorKind(d.kind) && d.kind !== "video" && d.shape !== "circle",
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
        // zoom only reads against cover fit
        visibleWhen: (d) =>
            !isVectorKind(d.kind) && d.kind !== "video" && fitOf(d.kind, d.fit) === "cover",
    },
    {
        key: "focusX",
        label: "Focus across",
        control: "slider",
        min: 0,
        max: 100,
        step: 5,
        unit: "%",
        group: "Frame",
        // a focal point only reads against a crop, same as zoom
        visibleWhen: (d) =>
            !isVectorKind(d.kind) && d.kind !== "video" && fitOf(d.kind, d.fit) === "cover",
    },
    {
        key: "focusY",
        label: "Focus down",
        control: "slider",
        min: 0,
        max: 100,
        step: 5,
        unit: "%",
        group: "Frame",
        visibleWhen: (d) =>
            !isVectorKind(d.kind) && d.kind !== "video" && fitOf(d.kind, d.fit) === "cover",
    },
    {
        key: "shape",
        label: "Shape",
        control: "segmented",
        options: [
            { value: "frame", label: "Frame" },
            { value: "circle", label: "Circle" },
        ],
        group: "Frame",
        visibleWhen: (d) => d.kind === "photo",
    },
    {
        key: "ring",
        label: "Ring",
        control: "toggle",
        group: "Frame",
        visibleWhen: (d) => d.shape === "circle",
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
        visibleWhen: (d) => !isVectorKind(d.kind) && d.shape !== "circle",
    },
    {
        key: "controls",
        label: "Player controls",
        control: "toggle",
        group: "Player",
        visibleWhen: (d) => d.kind === "video",
    },
    {
        key: "autoplay",
        label: "Autoplay (muted)",
        control: "toggle",
        group: "Player",
        visibleWhen: (d) => d.kind === "video",
    },
    {
        key: "loop",
        label: "Loop",
        control: "toggle",
        group: "Player",
        visibleWhen: (d) => d.kind === "video",
    },
    {
        key: "muted",
        label: "Mute",
        control: "toggle",
        group: "Player",
        visibleWhen: (d) => d.kind === "video",
    },
    {
        key: "alt",
        label: "Alt text",
        control: "text",
        placeholder: "What the picture shows",
        group: "Accessibility",
        visibleWhen: (d) => !isVectorKind(d.kind),
    },
];

const BAR_KEYS = ["src", "fit", "glyph", "color", "doc"];

const FRAME_RESIZE: ResizeSpec = { aspect: { min: 0.4, max: 2.6 } };
const SIDE_RESIZE: ResizeSpec = {
    width: false,
    height: { key: "size", min: 24, max: 240, step: 4 },
};

function mediaSpec(type: string, kind: MediaElementKind, preset: Partial<MediaData> = {}) {
    const spec: ElementSpec<MediaData> = {
        type,
        label: KIND_LABEL[kind],
        category: "media",
        tier: "primitive",
        // no `aspect`: an unset one is what lets a picked source's own ratio shape the frame
        create: (): MediaData => ({ kind, src: "", radius: 14, ...preset }),
        layout: (d, ctx) => mediaLayout(d, ctx, kind),
        resize: (d) =>
            isSized(d, kind)
                ? SIDE_RESIZE
                : kindOf(d, kind) === "graphic"
                  ? { aspect: { min: 0.3, max: 3 } }
                  : FRAME_RESIZE,
        // only a clip mounts a player; the rest of what this element covers is painted, not played
        live: (d) => kindOf(d, kind) === "video",
        fallback: (d) => d,
        // one static union: each key's own kind-gated visibleWhen carves the per-kind bar, so a
        // stored icon (normalized to `media`) keeps its glyph controls instead of an empty bar
        bar: BAR_KEYS,
        labelFor: (d) => KIND_LABEL[kindOf(d, kind)],
        controls: CONTROLS,
    };
    return spec;
}

// Palette entries: one per kind, so inserting still says Image or Video rather than Media. They are
// the same element underneath, which is what lets the picker hand back a different kind.
const VARIANTS: { type: string; kind: MediaElementKind; preset?: Partial<MediaData> }[] = [
    { type: "image", kind: "photo" },
    { type: "video", kind: "video", preset: { controls: true } },
    { type: "gif", kind: "gif" },
    { type: "illustration", kind: "illustration" },
    { type: "sticker", kind: "sticker" },
    { type: "icon", kind: "icon", preset: { glyph: DEFAULT_GLYPH, color: "accent", size: 72 } },
    { type: "graphic", kind: "graphic", preset: { doc: DEFAULT_GRAPHIC, adoptTheme: true } },
    // palette-hidden; a portrait bubble is a photo the composites reach for
    { type: "avatar", kind: "photo", preset: { shape: "circle", size: 72 } },
];

VARIANTS.forEach((v) => register(mediaSpec(v.type, v.kind, v.preset)));

// the stored element: the write path normalizes every variant to this, with data.kind picking the branch
export const mediaElement = mediaSpec("media", "photo");
register(mediaElement);
