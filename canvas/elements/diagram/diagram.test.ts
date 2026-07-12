import { describe, expect, it } from "vitest";
import { renderDiagram, diagramTypeOptions } from "@elements/diagram/render";
import {
    boxWidth,
    buildTree,
    clamp,
    getDiagram,
    layoutTree,
    normalizeDiagram,
} from "@elements/diagram/utils";
import { recordingDrawContext, tokens } from "@canvas/testkit";

describe("normalizeDiagram", () => {
    it("splits items on comma or newline", () => {
        expect(normalizeDiagram({ items: "A, B\nC" }).items).toEqual(["A", "B", "C"]);
    });
    it("parses edges 'From->To:label', dropping malformed entries", () => {
        const d = normalizeDiagram({ items: "A,B", links: "A->B:yes, broken, C>D" });
        expect(d.edges).toEqual([
            { from: "A", to: "B", label: "yes" },
            { from: "C", to: "D", label: undefined },
        ]);
    });
    it("resolves the type: type → legacy → default process", () => {
        expect(normalizeDiagram({ items: "A", type: "tree" }).type).toBe("tree");
        expect(normalizeDiagram({ items: "A", kind: "funnel" }).type).toBe("funnel");
        expect(normalizeDiagram({ items: "A" }).type).toBe("process");
    });
});

describe("buildTree", () => {
    it("returns null when there are no nodes", () => {
        expect(buildTree(normalizeDiagram({ items: "" }))).toBeNull();
    });
    it("with no edges, roots at the first node with the rest as children (a star)", () => {
        const t = buildTree(normalizeDiagram({ items: "Root, A, B" }))!;
        expect(t.label).toBe("Root");
        expect(t.children.map((c) => c.label)).toEqual(["A", "B"]);
    });
    it("roots at the node never used as a target, cutting cycles", () => {
        const t = buildTree(normalizeDiagram({ items: "A, B, C", links: "A->B, B->C, C->A" }))!;
        expect(t.label).toBe("A");
        expect(t.children[0]!.label).toBe("B");
        expect(t.children[0]!.children[0]!.label).toBe("C");
        expect(t.children[0]!.children[0]!.children).toHaveLength(0); // C->A back-edge cut
    });
});

describe("layoutTree", () => {
    it("places every node inside the box (never upscaling past natural spacing)", () => {
        const data = {
            label: "R",
            children: [
                { label: "A", children: [] },
                { label: "B", children: [] },
            ],
        };
        const { placed } = layoutTree(data, 400, 300, 80, 36, false);
        expect(placed).toHaveLength(3);
        for (const p of placed) {
            expect(p.cx).toBeGreaterThanOrEqual(0);
            expect(p.cx).toBeLessThanOrEqual(400);
            expect(p.cy).toBeGreaterThanOrEqual(0);
            expect(p.cy).toBeLessThanOrEqual(300);
        }
    });
});

describe("boxWidth", () => {
    it("clamps a uniform node width around the longest label", () => {
        const { ctx } = recordingDrawContext(); // measureText → text.length * 8
        expect(boxWidth(ctx, tokens, ["hi"], 60, 40, 200)).toBe(60); // base wins
        expect(boxWidth(ctx, tokens, ["x".repeat(30)], 60, 40, 200)).toBe(200); // clamped to max
    });
});

describe("clamp", () => {
    it("bounds a value", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-3, 0, 10)).toBe(0);
        expect(clamp(99, 0, 10)).toBe(10);
    });
});

describe("registry", () => {
    it("registers every diagram type", () => {
        const ids = diagramTypeOptions().map((o) => o.value);
        expect(ids).toContain("process");
        expect(ids).toContain("flow");
        expect(getDiagram("tree")?.id).toBe("tree");
    });
});

describe("renderDiagram", () => {
    const box = { x: 0, y: 0, w: 400, h: 300 };
    const data = {
        items: "Step one, Step two, Step three",
        links: "Step one->Step two, Step two->Step three",
    };

    for (const { value: id } of diagramTypeOptions()) {
        it(`${id} produces draw calls for valid data`, () => {
            const { ctx, calls } = recordingDrawContext();
            renderDiagram(ctx, box, { ...data, type: id }, tokens);
            expect(calls.length).toBeGreaterThan(0);
        });
    }

    it("renders nothing when there are no items", () => {
        const { ctx, calls } = recordingDrawContext();
        renderDiagram(ctx, box, { items: "", type: "process" }, tokens);
        expect(calls).toHaveLength(0);
    });
});
