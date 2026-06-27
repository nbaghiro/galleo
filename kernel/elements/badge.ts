import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit } from "@model/size";
import { fontStack } from "@themes/theme";

interface BadgeData {
    text: string;
}

export const badgeElement: ElementSpec<BadgeData> = {
    type: "badge",
    label: "Badge",
    category: "branding",
    tier: "primitive",
    create: () => ({ text: "NEW" }),
    layout: (d: BadgeData, ctx: LayoutCtx): EngineNode => ({
        w: fit(),
        h: fit(),
        padding: { top: 5, bottom: 5, left: 11, right: 11 },
        alignX: "center",
        alignY: "center",
        fill: { color: ctx.theme.bg, radius: 99, border: { color: ctx.theme.accent, width: 1.3 } },
        children: [
            {
                w: fit(),
                h: fit(),
                text: { text: d.text, fontId: fontStack("mono", ctx.theme), size: 11, weight: 700, color: ctx.theme.accent, align: "center", wrap: "none" },
            },
        ],
    }),
    controls: [{ key: "text", label: "Text", control: "text" }],
};

register(badgeElement);
