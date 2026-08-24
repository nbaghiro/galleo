import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, DrawStyle, EngineNode, Rect } from "@engine/node";
import type { MediaKind } from "@model/media";
import { fit, fixed, grow } from "@model/geometry";
import { mix } from "@themes";
import { IMAGE_FIT } from "@model/elements";
import type { ImageFit } from "@model/elements";

export interface ImageData {
    src: string;
    alt?: string;
    aspect?: number;
    dims?: { w: number; h: number }; // the picked source's pixel size, written by the media control
    radius?: number;
    fit?: ImageFit;
    zoom?: number; // percent, 100 = fit frame, higher crops in
}

// The source's own ratio, when it is one a frame can sanely take; the author's `aspect` still wins.
function naturalAspect(d: ImageData): number | undefined {
    const w = d.dims?.w ?? 0;
    const h = d.dims?.h ?? 0;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
    const a = w / h;
    return a >= 0.05 && a <= 20 ? a : undefined;
}

export interface MediaConfig {
    type: string;
    label: string;
    kind: MediaKind;
    src: string; // default placeholder until the user picks
    fit: ImageFit;
    aspect: number;
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

// A frame with nothing in it yet — a planned section, or a cleared picker. Painting the element's own
// empty state beats an image leaf with no source, which renders as a blank hole.
function emptyFrame(data: ImageData, cfg: MediaConfig, ctx: LayoutCtx): EngineNode {
    return {
        w: grow(),
        h: fit(),
        aspect: data.aspect ?? cfg.aspect,
        alignX: "center",
        alignY: "center",
        fill: {
            color: mix(ctx.theme.surface, ctx.theme.ink, 0.07),
            radius: data.radius ?? 14,
        },
        children: [
            {
                w: fixed(GLYPH),
                h: fixed(GLYPH),
                surface: { paint: mediaGlyph(mix(ctx.theme.surface, ctx.theme.ink, 0.3)) },
            },
        ],
    };
}

export function imageLike(cfg: MediaConfig): ElementSpec<ImageData> {
    return {
        type: cfg.type,
        label: cfg.label,
        category: "media",
        tier: "primitive",
        // no `aspect`: an unset one is what lets a picked source's own ratio shape the frame
        create: () => ({ src: cfg.src, radius: 14, fit: cfg.fit }),
        layout: (data: ImageData, ctx: LayoutCtx): EngineNode =>
            data.src
                ? {
                      w: grow(),
                      h: fit(),
                      aspect: data.aspect ?? naturalAspect(data) ?? cfg.aspect,
                      image: {
                          src: data.src,
                          alt: data.alt?.trim() || undefined,
                          natural: naturalAspect(data) ? data.dims : undefined,
                          fit: data.fit ?? cfg.fit,
                          radius: data.radius ?? 14,
                          zoom: (data.zoom ?? 100) / 100,
                      },
                  }
                : emptyFrame(data, cfg, ctx),
        resize: { aspect: { min: 0.4, max: 2.6 } },
        bar: ["src", "fit"],
        controls: [
            {
                key: "src",
                label: cfg.label,
                control: "media",
                mediaKind: cfg.kind,
                dimsKey: "dims",
            },
            {
                key: "fit",
                label: "Fit",
                control: "segmented",
                options: IMAGE_FIT.map((v) => ({
                    value: v,
                    label: v === "cover" ? "Cover" : "Contain",
                })),
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
                visibleWhen: (d) => ((d.fit as string) ?? cfg.fit) === "cover",
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
            {
                key: "alt",
                label: "Alt text",
                control: "text",
                placeholder: "What the picture shows",
                group: "Accessibility",
            },
        ],
    };
}
