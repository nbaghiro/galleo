import "@elements/register";
import { describe, expect, it } from "vitest";
import {
    dataShapeFor,
    invalidNumber,
    itemLimit,
    parseModel,
    removeHierNode,
    serializeModel,
    type HierModel,
    type ListModel,
} from "@editor/core/infographic";

describe("dataShapeFor", () => {
    it("maps chart types, defaulting an unknown chart to series", () => {
        expect(dataShapeFor("chart", "bar")).toBe("series");
        expect(dataShapeFor("chart", "line")).toBe("series");
        expect(dataShapeFor("chart", "pie")).toBe("labelValue");
        expect(dataShapeFor("chart", "mystery")).toBe("series");
    });

    it("maps diagram types, defaulting an unknown diagram to list", () => {
        expect(dataShapeFor("diagram", "org")).toBe("hierarchy");
        expect(dataShapeFor("diagram", "process")).toBe("list");
        expect(dataShapeFor("diagram", "mystery")).toBe("list");
    });

    it("routes by category, and returns undefined for other categories", () => {
        expect(dataShapeFor("chart", "treemap")).toBe("labelValue");
        expect(dataShapeFor("diagram", "funnel")).toBe("list");
        expect(dataShapeFor("text", "callout")).toBeUndefined();
    });
});

describe("parseModel ↔ serializeModel round-trip", () => {
    it("a bar series preserves values / categories / seriesNames", () => {
        const data = {
            type: "bar",
            values: "10, 20, 30\n40, 50, 60",
            categories: "A, B, C",
            seriesNames: "S1, S2",
        };
        const model = parseModel("chart", "series", data);
        expect(serializeModel("chart", model)).toEqual({
            values: "10, 20, 30\n40, 50, 60",
            categories: "A, B, C",
            seriesNames: "S1, S2",
        });
    });

    it("a line series preserves its fields the same way", () => {
        const data = {
            type: "line",
            values: "1, 2, 3",
            categories: "Q1, Q2, Q3",
            seriesNames: "Revenue",
        };
        const model = parseModel("chart", "series", data);
        expect(serializeModel("chart", model)).toEqual({
            values: "1, 2, 3",
            categories: "Q1, Q2, Q3",
            seriesNames: "Revenue",
        });
    });

    it("a graph (from->to:label) preserves items + links", () => {
        const data = { type: "flow", items: "A, B, C", links: "A->B:yes, B->C" };
        const model = parseModel("diagram", "graph", data);
        expect(serializeModel("diagram", model)).toEqual({
            items: "A, B, C",
            links: "A->B:yes, B->C",
        });
    });

    it("a hierarchy (parent>child) preserves items + links", () => {
        const data = {
            type: "tree",
            items: "Root, Child1, Child2",
            links: "Root>Child1, Root>Child2",
        };
        const model = parseModel("diagram", "hierarchy", data);
        expect(serializeModel("diagram", model)).toEqual({
            items: "Root, Child1, Child2",
            links: "Root>Child1, Root>Child2",
        });
    });

    it("a list carries per-item meta both ways", () => {
        const data = {
            type: "hub",
            items: "Core, One, Two",
            itemsMeta: [{ icon: "rocket" }, {}, { color: "#ff0000", emphasis: true }],
        };
        const m = parseModel("diagram", "list", data) as ListModel;
        expect(m.items[0]!.icon).toBe("rocket");
        expect(m.items[1]!.icon).toBe("");
        expect(m.items[2]!.color).toBe("#ff0000");
        expect(m.items[2]!.emphasis).toBe(true);
        expect(serializeModel("diagram", m)).toEqual({
            items: "Core, One, Two",
            itemsMeta: [{ icon: "rocket" }, {}, { color: "#ff0000", emphasis: true }],
        });
    });

    it("a grid row removal keeps positional meta aligned", () => {
        const m = parseModel("diagram", "list", {
            type: "process",
            items: "A, B, C",
            itemsMeta: [{ icon: "rocket" }, {}, { icon: "flag" }],
        }) as ListModel;
        m.items.splice(0, 1);
        expect(serializeModel("diagram", m)).toEqual({
            items: "B, C",
            itemsMeta: [{}, { icon: "flag" }],
        });
    });

    it("a hierarchy carries details, values, and meta without loss", () => {
        const data = {
            type: "org",
            items: "CEO | runs the company | 3\nCTO | owns the stack",
            links: "CEO>CTO",
            itemsMeta: [{ icon: "users" }, { emphasis: true }],
        };
        const m = parseModel("diagram", "hierarchy", data) as HierModel;
        expect(m.nodes[0]!.body).toBe("runs the company");
        expect(m.nodes[0]!.value).toBe("3");
        expect(m.nodes[0]!.icon).toBe("users");
        expect(m.nodes[1]!.parent).toBe("CEO");
        expect(m.nodes[1]!.emphasis).toBe(true);
        expect(serializeModel("diagram", m)).toEqual({
            items: "CEO | runs the company | 3\nCTO | owns the stack",
            links: "CEO>CTO",
            itemsMeta: [{ icon: "users" }, { emphasis: true }],
        });
    });

    it("removing a hierarchy node reparents its children to its own parent", () => {
        const m = parseModel("diagram", "hierarchy", {
            type: "org",
            items: "CEO, VP, IC1, IC2",
            links: "CEO>VP, VP>IC1, VP>IC2",
        }) as HierModel;
        removeHierNode(m, 1);
        expect(m.nodes.map((n) => n.label)).toEqual(["CEO", "IC1", "IC2"]);
        expect(m.nodes[1]!.parent).toBe("CEO");
        expect(m.nodes[2]!.parent).toBe("CEO");
        expect(serializeModel("diagram", m)).toEqual({
            items: "CEO, IC1, IC2",
            links: "CEO>IC1, CEO>IC2",
        });
    });

    it("removing a root makes its children roots", () => {
        const m = parseModel("diagram", "hierarchy", {
            type: "org",
            items: "CEO, CTO",
            links: "CEO>CTO",
        }) as HierModel;
        removeHierNode(m, 0);
        expect(m.nodes[0]!.parent).toBe("");
        expect(serializeModel("diagram", m)).toEqual({ items: "CTO", links: "" });
    });

    it("clears itemsMeta when no row styles anything", () => {
        const m = parseModel("diagram", "list", {
            type: "process",
            items: "A, B",
            itemsMeta: [{ icon: "rocket" }, {}],
        }) as ListModel;
        m.items[0]!.icon = "";
        const out = serializeModel("diagram", m);
        expect("itemsMeta" in out).toBe(true);
        expect(out.itemsMeta).toBeUndefined();
    });
});

describe("invalidNumber", () => {
    it("treats empty / whitespace as valid (they mean 0)", () => {
        expect(invalidNumber("")).toBe(false);
        expect(invalidNumber("   ")).toBe(false);
    });

    it("accepts finite numbers including exponent notation", () => {
        expect(invalidNumber("42")).toBe(false);
        expect(invalidNumber("1e3")).toBe(false);
    });

    it("rejects non-numeric text", () => {
        expect(invalidNumber("x")).toBe(true);
        expect(invalidNumber("1.2.3")).toBe(true);
    });
});

describe("itemLimit", () => {
    it("caps quadrant diagrams and leaves other diagrams uncapped", () => {
        expect(itemLimit("diagram", "quadrant")).toBe(4);
        expect(itemLimit("diagram", "process")).toBeUndefined();
    });

    it("only applies to diagrams, never charts", () => {
        expect(itemLimit("chart", "quadrant")).toBeUndefined();
    });
});
