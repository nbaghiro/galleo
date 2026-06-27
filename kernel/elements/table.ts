import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit, fixed, grow, percent } from "@model/size";
import { fontStack } from "@themes/theme";

interface TableData {
    data: string; // rows by newline, cells by comma (v1 data editor)
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
    category: "data",
    tier: "smart",
    create: () => ({ data: "Plan,Price,Seats\nStarter,Free,1\nPro,$20,5\nTeam,$50,20", header: true }),
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
                    text: { text, fontId: fontStack("ui", ctx.theme), size: 14, weight: head ? 700 : 400, color: head ? ctx.theme.ink : ctx.theme.soft, align: "start", wrap: "words" },
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
            fill: { color: ctx.theme.surface, radius: Math.round(ctx.theme.radius / 2), border: { color: ctx.theme.line, width: 1 } },
            children,
        };
    },
    controls: [
        { key: "data", label: "Cells (rows ↵ · cols ,)", control: "text", multiline: true, placeholder: "A,B\n1,2" },
        { key: "header", label: "Header row", control: "toggle" },
    ],
};

register(tableElement);
