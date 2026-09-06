import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { layoutCtx } from "@canvas/testkit";
import { getElement, optionsOf, resizeOf } from "@elements/spec";
import { normalize } from "@elements/chart/utils";

// The controls phase 4 and 5 of the distribution plan added: bars that grew, panel actions, and the
// fields those actions and dividers write.

const create = (type: string): Record<string, unknown> =>
    getElement(type)!.create() as Record<string, unknown>;
const control = (type: string, key: string) =>
    getElement(type)!.controls.find((c) => c.key === key)!;
const kidsOf = (d: Record<string, unknown>): ElementInstance[] => d.children as ElementInstance[];

describe("charts honour only the options their type reads", () => {
    it("a stale stacked flag on a line chart resolves to false", () => {
        const line = normalize({ type: "line", values: "1, 2\n3, 4", stacked: true });
        expect(line.options.stacked).toBe(false);
        expect(normalize({ type: "column", values: "1, 2", stacked: true }).options.stacked).toBe(
            true,
        );
        expect(normalize({ type: "pie", values: "1, 2" }).options.showGrid).toBe(false);
    });

    it("shows a toggle on the bar only where the type honours it", () => {
        const spec = getElement("barChart")!;
        const on = (key: string, type: string): boolean =>
            !!control("barChart", key).visibleWhen?.({ type });
        expect(spec.bar).toEqual(["type", "stacked", "smooth", "showValues", "showGrid"]);
        expect(on("smooth", "bar")).toBe(false);
        expect(on("smooth", "line")).toBe(true);
        expect(on("stacked", "line")).toBe(false);
        expect(on("showGrid", "pie")).toBe(false);
    });
});

describe("tabs from the panel", () => {
    it("offers its own labels as the default tab and adds or removes a tab", () => {
        const d = create("tabs");
        expect(optionsOf(control("tabs", "active"), d).map((o) => o.label)).toEqual([
            "Overview",
            "Details",
        ]);
        const three = control("tabs", "addTab").run!(d);
        expect(kidsOf(three)).toHaveLength(3);
        expect(three.labels).toBe("Overview, Details, Tab 3");
        expect(three.active).toBe(2);
        const two = control("tabs", "removeTab").run!(three);
        expect(kidsOf(two)).toHaveLength(2);
        expect(two.labels).toBe("Overview, Details");
        expect(control("tabs", "removeTab").visibleWhen!({ children: [{}] })).toBe(false);
    });
});

describe("forms from the panel", () => {
    it("appends a text field", () => {
        const d = create("contactForm");
        const next = control("contactForm", "addField").run!(d);
        expect(kidsOf(next)).toHaveLength(4);
        expect(kidsOf(next)[3]).toEqual({ type: "field", data: { kind: "text", label: "Field" } });
        expect(getElement("field")!.bar).toEqual(["kind", "required"]);
    });
});

describe("the container's gap and the embed's aspect", () => {
    it("an authored gap replaces the bare and surfaced defaults", () => {
        const spec = getElement("container")!;
        const bare = spec.layout({ children: [], gap: 30 }, layoutCtx(800));
        expect(bare.gap).toBe(30);
        const card = spec.layout({ children: [], surface: "solid", gap: 4 }, layoutCtx(800));
        expect(card.gap).toBe(4);
        expect(spec.layout({ children: [] }, layoutCtx(800)).gap).toBe(14);
        expect(spec.frame).toBe(true);
    });

    it("a video embed takes the aspect handle; a link card does not", () => {
        const spec = getElement("embed")!;
        expect(
            resizeOf(spec, { url: "https://www.youtube.com/watch?v=abc123xyz00" })?.aspect,
        ).toEqual({
            min: 0.75,
            max: 2.6,
        });
        expect(resizeOf(spec, { url: "https://galleo.app" })).toBeUndefined();
    });
});

describe("table column widths", () => {
    const spec = getElement("table")!;
    const cellWidths = (d: Record<string, unknown>): string[] =>
        (spec.layout(d, layoutCtx(800)).children ?? [])
            .slice(0, Number(d.cols))
            .map((c) => c.w.mode);

    it("size to content until a divider drag authors them", () => {
        const d = create("table");
        expect(cellWidths(d)).toEqual(["grow", "grow", "grow"]);
        const slots = spec.container!.slots!(d)!;
        expect([0, 1, 2, 3, 4].map(slots.of)).toEqual([0, 1, 2, 0, 1]);
        const resized = slots.resize([
            { slot: 0, pct: 50 },
            { slot: 1, pct: 17 },
        ]) as Record<string, unknown>;
        expect(resized.widths).toEqual([50, 17, 33]);
        expect(cellWidths(resized)).toEqual(["percent", "percent", "percent"]);
        expect(
            (spec.layout(resized, layoutCtx(800)).children![0]!.w as { value: number }).value,
        ).toBe(0.5);
    });

    it("keeps its widths through a cell edit and drops them when the column count changes", () => {
        const d = { ...create("table"), widths: [50, 25, 25] };
        const kept = spec.container!.withChildren(d, spec.container!.children(d)) as Record<
            string,
            unknown
        >;
        expect(kept.widths).toEqual([50, 25, 25]);
        expect(cellWidths({ ...d, cols: 2 })).toEqual(["grow", "grow"]);
    });
});
