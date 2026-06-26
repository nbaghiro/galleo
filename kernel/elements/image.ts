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
    create: () => ({ src: "", fit: "cover" }),
    layout: (data: ImageData, _ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        aspect: data.aspect,
        image: { src: data.src, fit: data.fit ?? "cover", radius: data.radius },
    }),
    controls: [
        {
            key: "fit",
            label: "Fit",
            control: "select",
            options: [
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
            ],
        },
    ],
};

register(imageElement);
