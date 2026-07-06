import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { register, getElement } from "@elements/spec";
import { fit, fixed, grow, percent } from "@model/geometry";
import { fontStack } from "@themes/theme";

// The "data" primitives that aren't their own subsystem: table + stat. Charts register from
// @elements/charts (→ @canvas/charts) and diagrams from @elements/diagrams (→ @canvas/diagrams).

interface TableData {
    data: string; // rows by newline, cells by comma (a grid data-editor comes later)
    header?: boolean;
}

function parse(data: string): string[][] {
    return data
        .split("\n")
        .map((r) => r.split(",").map((c) => c.trim()))
        .filter((r) => r.some((c) => c.length > 0));
}

export const tableElement: ElementSpec<TableData> = {
    type: "table",
    label: "Table",
    frame: true,
    category: "data",
    tier: "smart",
    create: () => ({
        data: "Plan,Price,Seats\nStarter,Free,1\nPro,$20,5\nTeam,$50,20",
        header: true,
    }),
    layout: (d: TableData, ctx: LayoutCtx): EngineNode => {
        const rows = parse(d.data);
        const cols = Math.max(1, ...rows.map((r) => r.length));
        const cell = (text: string, head: boolean): EngineNode => ({
            w: percent(1 / cols),
            h: fit(),
            padding: { top: 9, bottom: 9, left: 13, right: 13 },
            children: [
                {
                    w: grow(),
                    h: fit(),
                    text: {
                        text,
                        fontId: fontStack("ui", ctx.theme),
                        size: 14,
                        weight: head ? 700 : 400,
                        color: head ? ctx.theme.ink : ctx.theme.soft,
                        align: "start",
                        wrap: "words",
                    },
                },
            ],
        });
        const children: EngineNode[] = [];
        rows.forEach((row, ri) => {
            const head = !!d.header && ri === 0;
            if (ri > 0) children.push({ w: grow(), h: fixed(1), fill: { color: ctx.theme.line } });
            children.push({
                w: grow(),
                h: fit(),
                direction: "row",
                children: Array.from({ length: cols }, (_, ci) => cell(row[ci] ?? "", head)),
            });
        });
        return {
            w: grow(),
            h: fit(),
            direction: "col",
            fill: {
                color: ctx.theme.surface,
                radius: Math.round(ctx.theme.radius / 2),
                border: { color: ctx.theme.line, width: 1 },
            },
            children,
        };
    },
    controls: [
        {
            key: "data",
            label: "Cells (rows ↵ · cols ,)",
            control: "text",
            multiline: true,
            placeholder: "A,B\n1,2",
        },
        { key: "header", label: "Header row", control: "toggle" },
    ],
};

register(tableElement);

// A stat is a value + caption — both real text children, so each is independently selectable/editable.
interface StatData {
    children: ElementInstance[];
}

const arrange = (_d: StatData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 6,
    children: kids,
});

function compose(d: StatData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const statElement: ElementSpec<StatData> = {
    type: "stat",
    label: "Stat",
    category: "data",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "30s", style: "h1" } },
            { type: "text", data: { text: "prompt → first draft", style: "caption" } },
        ],
    }),
    layout: (d, ctx) => arrange(d, ctx, compose(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [],
};

register(statElement);
