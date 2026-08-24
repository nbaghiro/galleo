import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register } from "@elements/spec";
import { hitRegionId, parseTarget } from "@model/artifact";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack, hexA } from "@themes";
import { t, at } from "@elements/composite/shared";

// One panel visible at a time. `active` is authored data like any other field, so every static
// surface (export, thumbnails, the corpus) renders the panel the author left showing; a reader's
// switch is a per-session override the playback surface holds (see withViewerPatches).
interface TabsData {
    children: ElementInstance[]; // one panel per tab
    labels?: string; // comma-separated, positional; a missing one falls back to "Tab n"
    active?: number;
}

const TAB_H = 34;

const labelFor = (d: TabsData, i: number): string => {
    const parts = (d.labels ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return parts[i] || `Tab ${i + 1}`;
};

const activeIndex = (d: TabsData, count: number): number =>
    Math.max(0, Math.min(Math.round(d.active ?? 0), Math.max(0, count - 1)));

function chip(label: string, active: boolean, ctx: LayoutCtx): EngineNode {
    return {
        w: fit(),
        h: fixed(TAB_H),
        alignX: "center",
        alignY: "center",
        padding: { top: 0, bottom: 0, left: 14, right: 14 },
        fill: {
            color: active ? ctx.theme.accent : hexA(ctx.theme.ink, 0.06),
            radius: Math.max(4, Math.min(12, Math.round(ctx.theme.radius))),
        },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: label,
                    fontId: fontStack("ui", ctx.theme),
                    size: 14,
                    weight: 600,
                    color: active ? ctx.theme.onAccent : ctx.theme.muted,
                    align: "center",
                    wrap: "none",
                },
            },
        ],
    };
}

function arrangeTabs(d: TabsData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode {
    const active = activeIndex(d, kids.length);
    const strip: EngineNode = {
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 8,
        children: kids.map((kid, i) => {
            const c = chip(labelFor(d, i), i === active, ctx);
            // addressed at the panel, so the affordance resolves to this container's `active`
            const target = parseTarget(kid.id ?? "");
            if (target?.kind === "element") c.id = hitRegionId("tab", target.address);
            return c;
        }),
    };
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 16,
        children: kids.length ? [strip, at(kids, active)] : [strip],
    };
}

const panel = (title: string, body: string): ElementInstance => ({
    type: "container",
    data: { children: [t(title, "h3"), t(body, "body")] },
});

const composeKids = (d: TabsData, ctx: LayoutCtx): EngineNode[] =>
    d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });

export const tabsElement: ElementSpec<TabsData> = {
    type: "tabs",
    label: "Tabs",
    category: "composite",
    tier: "unit",
    create: () => ({
        labels: "Overview, Details",
        active: 0,
        children: [
            panel("Overview", "The short version, for a reader who is here for a minute."),
            panel("Details", "The long version, for a reader who wants the whole thing."),
        ],
    }),
    layout: (d, ctx) => arrangeTabs(d, ctx, composeKids(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange: arrangeTabs,
        withChildren: (d, children) => ({ ...d, children }),
        closed: true,
    },
    bar: ["labels"],
    controls: [
        {
            key: "labels",
            label: "Tab names",
            control: "text",
            placeholder: "Overview, Details, Pricing",
        },
    ],
};
register(tabsElement);
