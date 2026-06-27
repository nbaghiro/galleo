import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit, grow } from "@model/size";

interface ImageData {
    src: string;
    aspect?: number;
    radius?: number;
    fit?: "cover" | "contain";
}

export const imageElement: ElementSpec<ImageData> = {
    type: "image",
    label: "Image",
    category: "media",
    tier: "primitive",
    create: () => ({ src: "https://picsum.photos/seed/galleo-image/1100/760", aspect: 1.5, radius: 14, fit: "cover" }),
    layout: (data: ImageData, _ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        aspect: data.aspect ?? 1.5,
        image: { src: data.src, fit: data.fit ?? "cover", radius: data.radius },
    }),
    controls: [
        { key: "src", label: "Source URL", control: "text", placeholder: "https://…" },
        {
            key: "fit",
            label: "Fit",
            control: "segmented",
            options: [
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
            ],
        },
        { key: "aspect", label: "Aspect (w / h)", control: "slider", min: 0.4, max: 2.6, step: 0.05, group: "Frame" },
        { key: "radius", label: "Corner radius", control: "slider", min: 0, max: 40, step: 1, unit: "px", group: "Frame" },
    ],
};

register(imageElement);
