import type { ElementSpec } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { MediaKind } from "@model/media";
import { fit, grow } from "@model/geometry";
import { IMAGE_FIT } from "@model/elements";
import type { ImageFit } from "@model/elements";

export interface ImageData {
    src: string;
    aspect?: number;
    radius?: number;
    fit?: ImageFit;
    zoom?: number; // percent, 100 = fit frame, higher crops in
}

export interface MediaConfig {
    type: string;
    label: string;
    kind: MediaKind;
    src: string; // default placeholder until the user picks
    fit: ImageFit;
    aspect: number;
}

export function imageLike(cfg: MediaConfig): ElementSpec<ImageData> {
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
        bar: ["src", "fit"],
        controls: [
            { key: "src", label: cfg.label, control: "media", mediaKind: cfg.kind },
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
        ],
    };
}
