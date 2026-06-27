import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { Tokens } from "@themes/theme";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, fixed, grow } from "@model/size";

// A note box (note/tip/warn) with an accent bar and real text children — the body edits inline.
interface CalloutData {
    children: ElementInstance[];
    tone?: "note" | "tip" | "warn";
}

const toneColor = (tone: CalloutData["tone"], t: Tokens): string =>
    tone === "warn" ? "#c2402c" : tone === "tip" ? "#3f8f4f" : t.accent;

const arrange = (d: CalloutData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    fill: { color: ctx.theme.bg, radius: Math.round(ctx.theme.radius / 1.6), border: { color: ctx.theme.line, width: 1 } },
    children: [
        { w: fixed(4), h: grow(), fill: { color: toneColor(d.tone, ctx.theme) } },
        {
            w: grow(),
            h: fit(),
            direction: "col",
            gap: 6,
            padding: { top: 14, bottom: 14, left: 16, right: 16 },
            children: kids,
        },
    ],
});

export const calloutElement: ElementSpec<CalloutData> = {
    type: "callout",
    label: "Callout",
    category: "text",
    tier: "smart",
    create: () => ({
        children: [{ type: "text", data: { text: "Heads up — callouts hold real text you can edit inline.", style: "body" } }],
        tone: "note",
    }),
    layout: (d, ctx) =>
        arrange(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
            }),
        ),
    container: { children: (d) => d.children, arrange, withChildren: (d, children) => ({ ...d, children }) },
    controls: [
        {
            key: "tone",
            label: "Tone",
            control: "segmented",
            options: [
                { label: "Note", value: "note" },
                { label: "Tip", value: "tip" },
                { label: "Warn", value: "warn" },
            ],
        },
    ],
};

register(calloutElement);
