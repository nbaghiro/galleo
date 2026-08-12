import { describe, expect, it } from "vitest";
import { bool, num, oneOf, str } from "@elements/coerce";
import { toChartData } from "@elements/chart/utils";
import { toDiagramData } from "@elements/diagram/utils";

describe("primitive coercion", () => {
    it("keeps a value only when it is the right type", () => {
        expect(str("a")).toBe("a");
        expect(str(1)).toBeUndefined();
        expect(bool(true)).toBe(true);
        expect(bool("true")).toBeUndefined();
        expect(num(2)).toBe(2);
        expect(num("2")).toBeUndefined();
    });

    it("rejects non-finite numbers, which would poison layout math", () => {
        expect(num(NaN)).toBeUndefined();
        expect(num(Infinity)).toBeUndefined();
    });

    it("oneOf admits only members of the allowed set", () => {
        expect(oneOf("solid", ["solid", "outline"] as const)).toBe("solid");
        expect(oneOf("rainbow", ["solid", "outline"] as const)).toBeUndefined();
        expect(oneOf(7, ["solid", "outline"] as const)).toBeUndefined();
    });
});

describe("toChartData", () => {
    it("passes through well-typed fields", () => {
        expect(
            toChartData({ type: "line", values: "1,2", smooth: false, stacked: true }),
        ).toMatchObject({ type: "line", values: "1,2", smooth: false, stacked: true });
    });

    it("drops wrong-typed fields instead of handing them to the parser", () => {
        const d = toChartData({ values: 42, stacked: "yes", smooth: 1, height: "tall" });
        expect(d.values).toBe("");
        expect(d.stacked).toBeUndefined();
        expect(d.smooth).toBeUndefined();
        expect(d.height).toBeUndefined();
    });

    it("yields a usable shape from an empty record", () => {
        expect(toChartData({}).values).toBe("");
    });
});

describe("toDiagramData", () => {
    it("passes through well-typed fields", () => {
        expect(
            toDiagramData({ type: "org", items: "A, B", style: "card", numbers: "letter" }),
        ).toMatchObject({ type: "org", items: "A, B", style: "card", numbers: "letter" });
    });

    it("drops values outside the declared unions", () => {
        const d = toDiagramData({ items: 42, style: "neon", shape: "blob", height: "tall" });
        expect(d.items).toBe("");
        expect(d.style).toBeUndefined();
        expect(d.shape).toBeUndefined();
        expect(d.height).toBeUndefined();
    });
});
