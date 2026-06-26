import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementAddress } from "@model/address";
import type { ElementInstance, Section } from "@model/content";
import { getElement } from "@elements/registry";
import { fallbackTemplate, TEMPLATES } from "@elements/templates";
import { cellRegionId, elementRegionId, sectionRegionId } from "@model/address";
import { fit, grow } from "@model/size";

// Compose one Section into an EngineNode tree, tagging section / cell / element nodes with region ids
// (so the engine can report their geometry for selection + drop-targets). Containers recurse here so
// nested elements get addressable paths.

const GUTTER = 14;
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

function composeElement(inst: ElementInstance, ctx: LayoutCtx, addr: ElementAddress): EngineNode {
    const spec = getElement(inst.type);
    if (!spec) {
        return { id: elementRegionId(addr), w: grow(), h: fit(40), fill: { color: "#f6dede", radius: 6 } };
    }
    let node: EngineNode;
    if (spec.container) {
        const kids = spec.container
            .children(inst.data)
            .map((child, i) =>
                composeElement(child, ctx, { section: addr.section, cell: addr.cell, path: [...addr.path, i] }),
            );
        node = spec.container.arrange(inst.data, ctx, kids);
    } else {
        node = spec.layout(inst.data, ctx);
    }
    node.id = elementRegionId(addr);
    return node;
}

export function composeSection(section: Section, ctx: LayoutCtx): EngineNode {
    const tmpl = TEMPLATES[section.grid] ?? fallbackTemplate;
    const cells = tmpl.cells.map((cellKey, i): EngineNode => {
        const inst = section.cells[cellKey]?.element;
        const content = inst
            ? composeElement(inst, ctx, { section: section.id, cell: cellKey, path: [] })
            : emptyCell();
        return {
            id: cellRegionId(section.id, cellKey),
            w: tmpl.widths[i] ?? grow(),
            h: fit(),
            padding: pad(GUTTER),
            direction: "col",
            children: [content],
        };
    });
    const inner: EngineNode = { w: grow(), h: fit(), direction: "row", gap: 0, alignY: "center", children: cells };
    return {
        id: sectionRegionId(section.id),
        w: grow(),
        h: fit(),
        padding: pad(36),
        fill: { color: "#fffdf8", radius: 18, border: { color: "#eae3d5", width: 1 } },
        children: [inner],
    };
}
