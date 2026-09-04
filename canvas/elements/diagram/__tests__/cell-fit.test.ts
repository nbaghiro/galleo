import { describe, expect, it } from "vitest";
import { bandGeometry, diagramCell, nodePaint } from "@elements/diagram/utils";
import { tokens } from "@canvas/testkit";

// diagramCell budgets its text to a fixed cell height: a long detail the cell cannot hold stands
// down (as the float types have always done), and a label is capped so it never wraps unbounded.
// The engine's measurer then truncates each kept leaf to its maxLines; this pins the budget itself.
const text = (t: string) => ({
    w: {} as never,
    h: {} as never,
    text: { text: t, fontId: "t", size: 12, wrap: "words" as const },
});
const paint = nodePaint(tokens.accent, tokens, {});
const detailOf = (cellH: number) => {
    const cell = diagramCell(text("Label"), text("A detail line"), paint, { cellH });
    return cell.children!.find((c) => c.text?.text === "A detail line");
};

describe("diagramCell fit", () => {
    it("keeps the detail, capped, when the cell has room for it", () => {
        const d = detailOf(90);
        expect(d).toBeDefined();
        expect(d!.text!.maxLines).toBeGreaterThanOrEqual(1);
    });

    it("drops a detail the cell is too short to hold, leaving just the label", () => {
        const cell = diagramCell(text("Label"), text("A detail line"), paint, { cellH: 40 });
        expect(cell.children!.some((c) => c.text?.text === "A detail line")).toBe(false);
    });

    it("caps the label at two lines so a long one ellipsizes instead of wrapping unbounded", () => {
        const cell = diagramCell(text("A very long label"), undefined, paint, { cellH: 46 });
        const label = cell.children!.find((c) => c.text?.text === "A very long label");
        expect(label!.text!.maxLines).toBeLessThanOrEqual(2);
    });

    it("leaves a cell with no fixed height alone, so the self-sizing types are unaffected", () => {
        const cell = diagramCell(text("Label"), text("A detail line"), paint, {});
        const label = cell.children!.find((c) => c.text?.text === "Label");
        expect(label!.text!.maxLines).toBeUndefined();
    });
});

describe("funnel band floor", () => {
    // a funnel with no values tapers smoothly, but a band must never narrow below its own label
    // width, or the label clips horizontally in the narrow bottom bands
    it("never narrows a band below its label-width floor, even on a smooth taper", () => {
        const items = [
            { label: "External Load", body: "wind" },
            { label: "Grid Network", body: "members" },
            { label: "Vector Splitting", body: "tension" },
            { label: "Foundation", body: "ground" },
        ] as never;
        const floors = [80, 80, 90, 70]; // per-item label-width halves
        const geo = bandGeometry(items, 600, 400, false, floors);
        geo.bands.forEach((b, i) => {
            expect(Math.min(b.half0, b.half1), `band ${i}`).toBeGreaterThanOrEqual(
                floors[i]! - 0.5,
            );
        });
    });
});
