import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { Section } from "@model/content";
import { getElement } from "@elements/registry";
import { fallbackTemplate, TEMPLATES } from "@elements/templates";
import { fit, grow } from "@model/size";

// Compose one Section into an EngineNode: pick its template, fill each cell with its element (or a
// drop-target placeholder when empty), and wrap the whole thing in a section panel.

const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

function emptyCell(): EngineNode {
    return {
        w: grow(),
        h: fit(90),
        alignX: "center",
        alignY: "center",
        fill: { color: "#faf6ee", radius: 10, border: { color: "#d8cdb8", width: 1.5, style: "dashed" } },
        children: [
            {
                w: fit(),
                h: fit(),
                text: { text: "+ drop element", fontId: "mono", size: 12, color: "#b3a892", align: "center", wrap: "none" },
            },
        ],
    };
}

function composeElement(type: string, data: unknown, ctx: LayoutCtx): EngineNode {
    const spec = getElement(type);
    if (!spec) return { w: grow(), h: fit(40), fill: { color: "#f6dede", radius: 6 } };
    return spec.layout(data, ctx);
}

export function composeSection(section: Section, ctx: LayoutCtx): EngineNode {
    const tmpl = TEMPLATES[section.grid] ?? fallbackTemplate;
    const contents = tmpl.cells.map((cid): EngineNode => {
        const inst = section.cells[cid]?.element;
        return inst ? composeElement(inst.type, inst.data, ctx) : emptyCell();
    });
    return {
        w: grow(),
        h: fit(),
        padding: pad(36),
        fill: { color: "#fffdf8", radius: 18, border: { color: "#eae3d5", width: 1 } },
        children: [tmpl.build(contents)],
    };
}
