import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { Tokens } from "@themes";
import type { CalloutTone } from "@model/elements";
import { register, getElement } from "@elements/spec";
import { fit, grow, fixed } from "@model/geometry";
import { CALLOUT_TONES } from "@model/elements";

// A note box (note/tip/warn) with an accent bar and real text children — the body edits inline.
interface CalloutData {
    children: ElementInstance[];
    tone?: CalloutTone;
}

function toneColor(tone: CalloutTone | undefined, t: Tokens): string {
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

const arrangeCallout = (d: CalloutData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    fill: {
        color: ctx.theme.bg,
        radius: Math.round(ctx.theme.radius / 1.6),
        border: { color: ctx.theme.line, width: 1 },
    },
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

const TONE_LABELS: Record<CalloutTone, string> = {
    note: "Note",
    info: "Info",
    tip: "Tip",
    success: "Success",
    warn: "Warning",
    caution: "Caution",
    question: "Question",
};

export const calloutElement: ElementSpec<CalloutData> = {
    type: "callout",
    label: "Callout",
    frame: true,
    category: "text",
    tier: "smart",
    create: () => ({
        children: [
            {
                type: "text",
                data: {
                    text: "Heads up — callouts hold real text you can edit inline.",
                    style: "body",
                },
            },
        ],
        tone: "note",
    }),
    layout: (d, ctx) =>
        arrangeCallout(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange: arrangeCallout,
        withChildren: (d, children) => ({ ...d, children }),
    },
    bar: ["tone"], // a container hides the docked panel, so the one control must live on the bar
    controls: [
        {
            key: "tone",
            label: "Tone",
            control: "select",
            options: CALLOUT_TONES.map((v) => ({ value: v, label: TONE_LABELS[v] })),
        },
    ],
};

register(calloutElement);
