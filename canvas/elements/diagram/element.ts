import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import { GRAPH_DIAGRAM_TYPES } from "@model/elements";
import { renderDiagram, diagramTypeOptions } from "./render";
import type { DiagramData } from "./utils";

const GRAPH_TYPES = new Set<string>(GRAPH_DIAGRAM_TYPES);
// one field per consumer: a placeholder is static, and `axes` means something different per type
const axisField = (type: string, label: string, placeholder: string): ControlField => ({
    key: "axes",
    label,
    control: "text",
    placeholder,
    visibleWhen: (d) => d.type === type,
});

export const DIAGRAM_CONTROLS: ControlField[] = [
    // getter: reads the live type registry each render (mirrors chart/element.ts)
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
        label: "Items (one per line)",
        control: "text",
        multiline: true,
        placeholder: "Discover | research the market\nDesign | shape the solution",
    },
    {
        key: "links",
        label: "Links (A->B, …)",
        control: "text",
        multiline: true,
        placeholder: "Start->Review, Review->Done",
        visibleWhen: (d) => GRAPH_TYPES.has(String(d.type)),
    },
    axisField(
        "quadrant",
        "Axis ends (x lo, x hi, y lo, y hi)",
        "Low effort, High effort, Low impact, High impact",
    ),
    axisField("matrix", "Headers (columns, then rows)", "Helpful, Harmful, Internal, External"),
    axisField("roadmap", "Columns", "Q1, Q2, Q3, Q4"),
    {
        key: "palette",
        label: "Palette",
        control: "segmented",
        options: [
            { label: "Accent", value: "ramp" },
            { label: "Multi-hue", value: "categorical" },
        ],
    },
    {
        key: "flow",
        label: "Direction",
        control: "segmented",
        options: [
            { label: "Down", value: "down" },
            { label: "Across", value: "right" },
        ],
        visibleWhen: (d) => d.type === "flow",
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
            axes: "",
            palette: "ramp",
            flow: "down",
            height: 260,
            ...preset,
        }),
        layout: (d: DiagramData, ctx: LayoutCtx): EngineNode => ({
            w: grow(),
            h: fixed(d.height ?? 260),
            surface: { paint: (g, box) => renderDiagram(g, box, d, ctx.theme) },
        }),
        resize: { height: { key: "height", min: 140, max: 480, step: 10 } },
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
        preset: {
            items: "Research, Design, Build, Test, Launch",
        },
    },
    {
        key: "stepsDiagram",
        label: "Steps",
        type: "steps",
        preset: {
            items: "Crawl | prove the basics\nWalk | expand the surface\nRun | scale it up",
        },
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
        preset: {
            items: "Awareness, Interest, Consideration, Intent, Purchase",
        },
    },
    {
        key: "timelineDiagram",
        label: "Timeline",
        type: "timeline",
        preset: {
            items: "Founded, Seed round, Series A, Expansion, IPO",
        },
    },
    {
        key: "roadmapDiagram",
        label: "Roadmap",
        type: "roadmap",
        preset: {
            items: "Discovery | interviews and sizing | 1\nBeta | design partners | 2\nGA | full launch | 1\nScale | expand the surface | 2",
            axes: "Q1, Q2, Q3, Q4",
        },
    },
    {
        key: "vennDiagram",
        label: "Venn",
        type: "venn",
        // hue earns its place here: overlapping washes of one hue are indistinguishable
        preset: { items: "Desirable, Feasible, Viable, Innovation", palette: "categorical" },
    },
    {
        key: "quadrantDiagram",
        label: "Quadrant",
        type: "quadrant",
        preset: {
            items: "Quick wins, Major projects, Fill-ins, Thankless tasks",
            axes: "Low effort, High effort, Low impact, High impact",
        },
    },
    {
        key: "matrixDiagram",
        label: "Matrix",
        type: "matrix",
        preset: {
            items: "Strengths, Weaknesses, Opportunities, Threats",
            axes: "Helpful, Harmful, Internal, External",
        },
    },
    {
        key: "hubDiagram",
        label: "Hub & spoke",
        type: "hub",
        preset: { items: "Platform, Billing, Identity, Insights, Support, Partners" },
    },
    {
        key: "targetDiagram",
        label: "Target rings",
        type: "target",
        preset: {
            items: "Market | everyone in the category\nSegment | who we serve\nBeachhead | where we start",
        },
    },
    {
        key: "honeycombDiagram",
        label: "Honeycomb",
        type: "honeycomb",
        preset: { items: "Speed, Quality, Trust, Scale, Focus, Craft" },
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
            items: "Start, Ready to ship?, Publish, Send back",
            links: "Start->Ready to ship?, Ready to ship?->Publish:yes, Ready to ship?->Send back:no, Send back->Start",
        },
    },
];

VARIANTS.forEach((v) => register(diagramSpec(v.key, v.label, v.type, v.preset)));

// the stored element: templates + AI write this, with data.type picking the renderer
register(
    diagramSpec("diagram", "Diagram", "process", {
        items: "Research, Design, Build, Test, Launch",
    }),
);
