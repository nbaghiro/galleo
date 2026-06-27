import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fixed, grow } from "@model/size";

interface SpacerData {
    height: number;
}

export const spacerElement: ElementSpec<SpacerData> = {
    type: "spacer",
    label: "Spacer",
    category: "layout",
    tier: "primitive",
    create: () => ({ height: 32 }),
    layout: (d: SpacerData, _ctx: LayoutCtx): EngineNode => ({ w: grow(), h: fixed(d.height) }),
    controls: [{ key: "height", label: "Height", control: "slider", min: 8, max: 240, step: 4, unit: "px" }],
    skeleton: (): EngineNode => ({ w: grow(), h: fixed(22), fill: { color: "#e8e3d6", radius: 4 } }),
};

register(spacerElement);
