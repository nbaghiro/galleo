import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import { getElement } from "@elements/spec";
import { inst, layoutCtx } from "@canvas/testkit";

const btn = (label: string) => inst("button", { label });

const compose = (data: Record<string, unknown>, width = 900): EngineNode =>
    getElement("container")!.layout({ children: [btn("a"), btn("b")], ...data }, layoutCtx(width));

describe("a surfaced row honors the cross-axis align", () => {
    it("align center reaches alignY through the surfaced path too", () => {
        const c = compose({ direction: "row", align: "center", surface: "glass" });
        expect(c.alignY).toBe("center");
        expect(compose({ direction: "row", align: "center", surface: "outline" }).alignY).toBe(
            "center",
        );
    });
});

describe("row justify — the main axis through one key", () => {
    it("center and end pack through the engine's alignX", () => {
        const c = compose({ direction: "row", justify: "center" });
        expect(c.alignX).toBe("center");
        expect(c.distribute).toBeUndefined();
        expect(compose({ direction: "row", justify: "end" }).alignX).toBe("end");
    });

    it("the spread values still ride distribute, never alignX", () => {
        const c = compose({ direction: "row", justify: "between" });
        expect(c.distribute).toBe("between");
        expect(c.alignX).toBeUndefined();
    });

    it("align stays the cross axis: a row's align never leaks into alignX", () => {
        const c = compose({ direction: "row", align: "center" });
        expect(c.alignY).toBe("center");
        expect(c.alignX).toBeUndefined();
    });

    it("a surfaced row packs the same way", () => {
        const c = compose({ direction: "row", justify: "center", surface: "solid" });
        expect(c.alignX).toBe("center");
        expect(c.distribute).toBeUndefined();
    });

    it("a stacked row keeps the pack: its horizontal meaning survives the flip to col", () => {
        const c = compose({ direction: "row", justify: "center" }, 300);
        expect(c.direction).toBe("col");
        expect(c.alignX).toBe("center");
        expect(c.distribute).toBeUndefined();
    });
});
