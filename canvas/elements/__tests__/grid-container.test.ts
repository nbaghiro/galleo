import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement } from "@elements/spec";
import { resolveProfile } from "@engine/profile";
import { inst, layoutCtx } from "@canvas/testkit";

const card = (t: string, pct?: number): ElementInstance => ({
    type: "container",
    data: { surface: "solid", children: [inst("text", { text: t })] },
    ...(pct !== undefined ? { layout: { width: { pct } } } : {}),
});

const compose = (data: Record<string, unknown>, width = 900): EngineNode =>
    getElement("container")!.layout(
        { children: [card("a", 60), card("b"), card("c"), card("d")], ...data },
        layoutCtx(width),
    );

describe("the grid container", () => {
    it("composes a grid node with its column count clamped to 2–6", () => {
        const node = compose({ direction: "grid", columns: 3 });
        expect(node.direction).toBe("grid");
        expect(node.columns).toBe(3);
        expect(compose({ direction: "grid" }).columns).toBe(2);
        expect(compose({ direction: "grid", columns: 40 }).columns).toBe(6);
        expect(compose({ direction: "grid", columns: 0 }).columns).toBe(2);
    });

    it("strips member widths, so a stale row fraction never pins a track", () => {
        const node = compose({ direction: "grid", columns: 2 });
        expect(node.children!.map((c) => c.w.mode)).toEqual(["grow", "grow", "grow", "grow"]);
    });

    it("keeps the surface and the tracks on a surfaced grid", () => {
        const node = compose({ direction: "grid", columns: 2, surface: "solid" });
        expect(node.direction).toBe("grid");
        expect(node.columns).toBe(2);
        expect(node.fill?.color).toBeDefined();
        expect(node.children!.map((c) => c.w.mode)).toEqual(["grow", "grow", "grow", "grow"]);
    });

    it("stacks to a single column under splitMinWidth, the same rule a row follows", () => {
        const node = compose({ direction: "grid", columns: 3 }, 300);
        expect(node.direction).toBe("col");
        expect(node.columns).toBeUndefined();
    });

    it("never stacks a deck, which lays out at its fixed page width", () => {
        const node = getElement("container")!.layout(
            { children: [card("a"), card("b"), card("c")], direction: "grid", columns: 3 },
            layoutCtx(1280, resolveProfile("deck")),
        );
        expect(node.direction).toBe("grid");
    });

    it("carries the vertical align onto the grid and leaves distribute off it", () => {
        const node = compose({
            direction: "grid",
            columns: 2,
            align: "center",
            justify: "between",
        });
        expect(node.alignY).toBe("center");
        expect(node.distribute).toBeUndefined();
    });
});
