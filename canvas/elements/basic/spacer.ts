import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";

interface SpacerData {
    height: number;
}

export const spacerElement: ElementSpec<SpacerData> = {
    type: "spacer",
    label: "Spacer",
    category: "basic",
    tier: "primitive",
    create: () => ({ height: 32 }),
    layout: (d: SpacerData, _ctx: LayoutCtx): EngineNode => ({ w: grow(), h: fixed(d.height) }),
    resize: { width: false, height: { key: "height", min: 8, max: 240, step: 4 } },
    controls: [],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fixed(22),
        fill: { color: "#e8e3d6", radius: 4 },
    }),
};

register(spacerElement);
