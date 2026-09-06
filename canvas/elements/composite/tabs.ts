import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register } from "@elements/spec";
import { num, str } from "@elements/coerce";
import { hitRegionId, parseTarget, withFreshElementIds } from "@model/artifact";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack, hexA } from "@themes";
import { t, at } from "@elements/composite/shared";

// One panel visible at a time. `active` is authored data like any other field, so every static
// surface (export, thumbnails, the corpus) renders the panel the author left showing; a reader's
// switch is a per-session override the playback surface holds (see withViewerPatches).
type TabsData = {
    children: ElementInstance[]; // one panel per tab
    labels?: string; // comma-separated, positional; a missing one falls back to "Tab n"
    active?: number;
};

// the panel's controls see an untyped bag, so they narrow before reading
const tabsData = (d: Record<string, unknown>): TabsData => ({
    children: Array.isArray(d.children) ? (d.children as ElementInstance[]) : [],
    labels: str(d.labels),
    active: num(d.active),
});

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

const panel = (title: string, body: string): ElementInstance => ({
    type: "container",
    data: { children: [t(title, "h3"), t(body, "body")] },
});

const labelsOf = (d: TabsData): string[] => d.children.map((_, i) => labelFor(d, i));

// a tab is a panel and its label together, so both go and both copy
function removeTab(d: TabsData, i: number): TabsData {
    const children = d.children.filter((_, k) => k !== i);
    const labels = labelsOf(d).filter((_, k) => k !== i);
    const was = activeIndex(d, d.children.length);
    return { ...d, children, labels: labels.join(", "), active: was > i ? was - 1 : was };
}

function addTab(d: TabsData): TabsData {
    const n = d.children.length;
    return {
        ...d,
        children: [...d.children, panel(`Tab ${n + 1}`, "")],
        labels: [...labelsOf(d), `Tab ${n + 1}`].join(", "),
        active: n,
    };
}

function duplicateTab(d: TabsData, i: number): { data: TabsData; index: number } {
    const children = [...d.children];
    children.splice(i + 1, 0, withFreshElementIds(structuredClone(d.children[i]!)));
    const labels = labelsOf(d);
    labels.splice(i + 1, 0, labels[i]!);
    return { data: { ...d, children, labels: labels.join(", "), active: i + 1 }, index: i + 1 };
}

function chip(label: string, active: boolean, ctx: LayoutCtx): EngineNode {
    return {
        w: fit(),
        h: fixed(TAB_H),
        alignX: "center",
        alignY: "center",
        padding: { top: 0, bottom: 0, left: 14, right: 14 },
        fill: {
            color: active ? ctx.theme.accent : hexA(ctx.theme.ink, 0.06),
            // the open tab keeps square base corners, the way a physical tab meets its panel
            radius: ((r): number | [number, number, number, number] => (active ? [r, r, 0, 0] : r))(
                Math.max(4, Math.min(12, Math.round(ctx.theme.radius))),
            ),
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
        removeChild: removeTab,
        duplicateChild: duplicateTab,
    },
    controls: [
        {
            key: "labels",
            label: "Tab names",
            control: "text",
            placeholder: "Overview, Details, Pricing",
        },
        {
            key: "active",
            label: "Default tab",
            control: "select",
            numeric: true,
            options: (d) => {
                const t = tabsData(d);
                return t.children.map((_, i) => ({ value: String(i), label: labelFor(t, i) }));
            },
        },
        { key: "addTab", label: "Add tab", control: "action", run: (d) => addTab(tabsData(d)) },
        {
            key: "removeTab",
            label: "Remove last tab",
            control: "action",
            visibleWhen: (d) => tabsData(d).children.length > 1,
            run: (d) => {
                const t = tabsData(d);
                return removeTab(t, t.children.length - 1);
            },
        },
    ],
};
register(tabsElement);
