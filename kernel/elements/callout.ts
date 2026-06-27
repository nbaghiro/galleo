import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { Tokens } from "@themes/theme";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, fixed, grow } from "@model/size";

// A note box (note/tip/warn) with an accent bar and real text children — the body edits inline.
type Tone = "note" | "info" | "tip" | "success" | "warn" | "caution" | "question";

interface CalloutData {
    children: ElementInstance[];
    tone?: Tone;
}

function toneColor(tone: Tone | undefined, t: Tokens): string {
    switch (tone) {
        case "info":
            return "#2d5bff";
        case "tip":
            return "#3f8f4f";
        case "success":
            return "#2e9e5b";
        case "warn":
            return "#d98324";
        case "caution":
            return "#c2402c";
        case "question":
            return "#7a5af0";
        default:
            return t.accent; // note
    }
}

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
            control: "select",
            options: [
                { label: "Note", value: "note" },
                { label: "Info", value: "info" },
                { label: "Tip", value: "tip" },
                { label: "Success", value: "success" },
                { label: "Warning", value: "warn" },
                { label: "Caution", value: "caution" },
                { label: "Question", value: "question" },
            ],
        },
    ],
};

register(calloutElement);
