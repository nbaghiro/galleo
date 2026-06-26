import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { getElement } from "@elements/registry";
import { block, skeletonFor } from "@elements/skeleton";
import { fit, grow } from "@model/size";

// A static showcase of element skeletons: (1) a section with a drop-preview ghost, and
// (2) the element palette where every element shows its structural skeleton.

const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

const PALETTE_TYPES = ["text", "image", "stat", "bullets", "quote", "button", "card", "divider"];

function label(text: string, size = 11): EngineNode {
    return {
        w: grow(),
        h: fit(),
        text: { text, fontId: "mono", size, weight: 600, color: "#8c8273", align: "start", wrap: "none" },
    };
}

function tile(name: string, skel: EngineNode): EngineNode {
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 8,
        children: [
            {
                w: grow(),
                h: fit(80),
                padding: pad(14),
                alignY: "center",
                fill: { color: "#fdfbf6", radius: 10, border: { color: "#ece6d9", width: 1 } },
                children: [skel],
            },
            {
                w: grow(),
                h: fit(),
                text: { text: name, fontId: "ui", size: 12, weight: 600, color: "#4d453a", align: "start", wrap: "none" },
            },
        ],
    };
}

function chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

function palette(ctx: LayoutCtx, perRow = 4): EngineNode {
    const tiles = PALETTE_TYPES.map((t): EngineNode => {
        const spec = getElement(t);
        return spec ? tile(spec.label, skeletonFor(spec, ctx)) : tile(t, label("?"));
    });
    const rows = chunk(tiles, perRow).map(
        (r): EngineNode => ({ w: grow(), h: fit(), direction: "row", gap: 16, children: r }),
    );
    return { w: grow(), h: fit(), direction: "col", gap: 16, children: rows };
}

// The element library for the right panel (drag source). Narrower → fewer per row.
export function paletteContent(ctx: LayoutCtx, perRow = 2): EngineNode {
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 16,
        children: [label("ELEMENTS · drag onto a section"), palette(ctx, perRow)],
    };
}

function dropPreview(): EngineNode {
    const leftCell: EngineNode = {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 10,
        children: [
            {
                w: grow(),
                h: fit(),
                text: { text: "Why now", fontId: "display", size: 30, weight: 600, color: "#211c16", align: "start", wrap: "words" },
            },
            {
                w: grow(),
                h: fit(),
                text: {
                    text: "A filled cell on the left. The cell on the right is empty — dragging an element over it shows its skeleton where it would land.",
                    fontId: "ui",
                    size: 15,
                    color: "#4d453a",
                    align: "start",
                    wrap: "words",
                },
            },
        ],
    };
    const dropCell: EngineNode = {
        w: grow(),
        h: fit(150),
        padding: pad(16),
        alignX: "center",
        alignY: "center",
        fill: { color: "#faf2e9", radius: 12, border: { color: "#c98a4b", width: 2, style: "dashed" } },
        children: [
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 10,
                alignX: "center",
                children: [
                    block(16 / 9),
                    {
                        w: grow(),
                        h: fit(),
                        text: { text: "▼  drop image here", fontId: "mono", size: 12, weight: 600, color: "#c98a4b", align: "center", wrap: "none" },
                    },
                ],
            },
        ],
    };
    return {
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 18,
        padding: pad(24),
        fill: { color: "#fffdf8", radius: 16, border: { color: "#eae3d5", width: 1 } },
        children: [leftCell, dropCell],
    };
}

export function buildShowcase(ctx: LayoutCtx): EngineNode {
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 26,
        children: [
            label("DRAG PREVIEW · the element's skeleton ghosts into the target cell"),
            dropPreview(),
            label("ELEMENT PALETTE · every element shows its structural skeleton"),
            palette(ctx),
        ],
    };
}
