import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import { renderDiagram, diagramTypeOptions } from "./render";
import type { DiagramData } from "./utils";

const GRAPH_TYPES = new Set(["flow", "tree", "org", "mindmap"]);

export const DIAGRAM_CONTROLS: ControlField[] = [
    // getter so `options` reads the live type registry each render (see charts/elements.ts).
    {
        key: "type",
        label: "Type",
        control: "select",
        get options() {
            return diagramTypeOptions();
        },
    },
    {
        key: "items",
        label: "Items (, or ↵)",
        control: "text",
        multiline: true,
        placeholder: "Discover, Design, Build, Ship",
    },
    {
        key: "links",
        label: "Links (A->B, …)",
        control: "text",
        multiline: true,
        placeholder: "Start->Review, Review->Done",
        visibleWhen: (d) => GRAPH_TYPES.has(String(d.type)),
    },
    {
        key: "palette",
        label: "Palette",
        control: "segmented",
        options: [
            { label: "Multi-hue", value: "categorical" },
            { label: "Accent", value: "ramp" },
        ],
    },
];

function diagramSpec(
    typeKey: string,
    label: string,
    diagType: string,
    preset: Partial<DiagramData>,
): ElementSpec<DiagramData> {
    return {
        type: typeKey,
        label,
        category: "diagram",
        tier: "smart",
        create: (): DiagramData => ({
            type: diagType,
            items: "Discover, Design, Build, Ship",
            links: "",
            palette: "categorical",
            height: 240,
            ...preset,
        }),
        layout: (d: DiagramData, ctx: LayoutCtx): EngineNode => ({
            w: grow(),
            h: fixed(d.height ?? 240),
            surface: { paint: (g, box) => renderDiagram(g, box, d, ctx.theme) },
        }),
        resize: { height: { key: "height", min: 140, max: 440, step: 10 } },
        bar: ["type", "palette"],
        controls: DIAGRAM_CONTROLS,
    };
}

const VARIANTS: {
    key: string;
    label: string;
    type: string;
    preset: Partial<DiagramData>;
}[] = [
    {
        key: "processDiagram",
        label: "Process",
        type: "process",
        preset: { items: "Research, Design, Build, Test, Launch" },
    },
    {
        key: "cycleDiagram",
        label: "Cycle",
        type: "cycle",
        preset: { items: "Plan, Do, Check, Act" },
    },
    {
        key: "pyramidDiagram",
        label: "Pyramid",
        type: "pyramid",
        preset: { items: "Vision, Strategy, Tactics, Operations" },
    },
    {
        key: "funnelDiagram",
        label: "Funnel",
        type: "funnel",
        preset: { items: "Awareness, Interest, Consideration, Intent, Purchase" },
    },
    {
        key: "timelineDiagram",
        label: "Timeline",
        type: "timeline",
        preset: { items: "Founded, Seed round, Series A, Expansion, IPO" },
    },
    {
        key: "vennDiagram",
        label: "Venn",
        type: "venn",
        preset: { items: "Desirable, Feasible, Viable" },
    },
    {
        key: "quadrantDiagram",
        label: "Quadrant",
        type: "quadrant",
        preset: { items: "Quick wins, Major projects, Fill-ins, Thankless tasks" },
    },
    {
        key: "matrixDiagram",
        label: "Matrix",
        type: "matrix",
        preset: { items: "Strengths, Weaknesses, Opportunities, Threats" },
    },
    {
        key: "treeDiagram",
        label: "Tree",
        type: "tree",
        preset: {
            items: "Company, Product, Platform, Sales, Marketing",
            links: "Company>Product, Company>Sales, Product>Platform, Sales>Marketing",
        },
    },
    {
        key: "orgDiagram",
        label: "Org chart",
        type: "org",
        preset: {
            items: "CEO, CTO, CFO, VP Eng, VP Sales",
            links: "CEO>CTO, CEO>CFO, CTO>VP Eng, CFO>VP Sales",
        },
    },
    {
        key: "mindmapDiagram",
        label: "Mind map",
        type: "mindmap",
        preset: {
            items: "Product Launch, Marketing, Engineering, Sales, Support",
            links: "Product Launch>Marketing, Product Launch>Engineering, Product Launch>Sales, Product Launch>Support",
        },
    },
    {
        key: "flowDiagram",
        label: "Flowchart",
        type: "flow",
        preset: {
            items: "Start, Review, Approve, Reject, Publish",
            links: "Start->Review, Review->Approve, Review->Reject, Approve->Publish, Reject->Start",
        },
    },
];

VARIANTS.forEach((v) => register(diagramSpec(v.key, v.label, v.type, v.preset)));

// Back-compat: hidden `diagram` element so existing `{ type: "diagram" }` content keeps rendering.
register(
    diagramSpec("diagram", "Diagram", "process", {
        items: "Research, Design, Build, Test, Launch",
    }),
);
