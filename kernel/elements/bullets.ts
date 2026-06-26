import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit, fixed, grow } from "@model/size";

interface BulletsData {
    items: string[];
}

export const bulletsElement: ElementSpec<BulletsData> = {
    type: "bullets",
    label: "Bullet list",
    category: "text",
    tier: "smart",
    create: () => ({ items: ["First point", "Second point", "Third point"] }),
    layout: (d: BulletsData, _ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 12,
        children: d.items.map(
            (it): EngineNode => ({
                w: grow(),
                h: fit(),
                direction: "row",
                gap: 12,
                alignY: "start",
                children: [
                    { w: fixed(8), h: fixed(8), fill: { color: "#a8572c", radius: 99 } },
                    {
                        w: grow(),
                        h: fit(),
                        text: { text: it, fontId: "ui", size: 16, color: "#4d453a", align: "start", wrap: "words" },
                    },
                ],
            }),
        ),
    }),
    controls: [],
};

register(bulletsElement);
