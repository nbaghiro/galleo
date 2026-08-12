import type { ControlField, ElementSpec } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { grow } from "@model/geometry";
import { GRAPH_DIAGRAM_TYPES } from "@model/elements";
import { diagramTypeOptions } from "./render";
import type { DiagramData, DiagItem } from "./utils";
import { formatItems, getDiagram, normalizeDiagram, toDiagramData } from "./utils";
import type { ElementInstance } from "@model/artifact";

// Every item becomes two real text children (label + detail, the detail kept even when empty so it
// stays clickable — the table does the same for empty cells); the type's arrange lays them out.
const textChild = (text: string): ElementInstance => ({
    type: "text",
    data: { text, style: "body", align: "center" },
});
const textOf = (i: ElementInstance | undefined): string =>
    typeof (i?.data as { text?: unknown })?.text === "string"
        ? (i!.data as { text: string }).text
        : "";

const resolved = (d: DiagramData): ReturnType<typeof normalizeDiagram> =>
    normalizeDiagram(toDiagramData(d));

function diagramChildren(d: DiagramData): ElementInstance[] {
    return resolved(d).items.flatMap((i) => [textChild(i.label), textChild(i.body ?? "")]);
}

function diagramWithChildren(d: DiagramData, kids: ElementInstance[]): DiagramData {
    const items = resolved(d).items;
    const next: DiagItem[] = items.map((it, i) => ({
        ...it,
        label: textOf(kids[i * 2]),
        body: textOf(kids[i * 2 + 1]) || undefined,
    }));
    return { ...d, items: formatItems(next) };
}

const GRAPH_TYPES = new Set<string>(GRAPH_DIAGRAM_TYPES);
// which types honor the authored node shape / the numbering badge
const SHAPE_TYPES = new Set<string>(["process", "cycle", "hub", "matrix"]);
const NUMBER_TYPES = new Set<string>(["process", "steps", "cycle", "hub", "matrix"]);
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
    {
        key: "style",
        label: "Node style",
        control: "segmented",
        options: [
            { label: "Solid", value: "solid" },
            { label: "Tinted", value: "tinted" },
            { label: "Card", value: "card" },
            { label: "Outline", value: "outline" },
        ],
    },
    {
        key: "shape",
        label: "Node shape",
        control: "segmented",
        options: [
            { label: "Rounded", value: "rounded" },
            { label: "Pill", value: "pill" },
            { label: "Chevron", value: "chevron" },
            { label: "Hexagon", value: "hexagon" },
        ],
        visibleWhen: (d) => SHAPE_TYPES.has(String(d.type)),
    },
    {
        key: "numbers",
        label: "Numbering",
        control: "segmented",
        options: [
            { label: "None", value: "none" },
            { label: "1 2 3", value: "number" },
            { label: "A B C", value: "letter" },
        ],
        visibleWhen: (d) => NUMBER_TYPES.has(String(d.type)),
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
            height: 260,
            ...preset,
        }),
        // compose always routes through `container`; this is the sized stand-in for anything else
        layout: (d: DiagramData): EngineNode => ({ w: grow(), h: grow(d.height ?? 260) }),
        container: {
            children: diagramChildren,
            arrange: (d, ctx, kids) => {
                const r = resolved(d);
                const type = getDiagram(r.type) ?? getDiagram("process")!;
                return type.arrange(r, ctx, kids, d.height ?? 260);
            },
            withChildren: diagramWithChildren,
            closed: true,
        },
        resize: { height: { key: "height", min: 140, max: 480, step: 10 } },
        bar: ["type", "style"],
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
        key: "orgDiagram",
        label: "Org chart",
        type: "org",
        preset: {
            items: "CEO, CTO, CFO, VP Eng, VP Sales",
            links: "CEO>CTO, CEO>CFO, CTO>VP Eng, CFO>VP Sales",
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
