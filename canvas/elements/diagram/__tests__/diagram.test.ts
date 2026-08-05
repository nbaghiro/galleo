import { describe, expect, it } from "vitest";
import { renderDiagram, diagramTypeOptions } from "@elements/diagram/render";
import {
    boxWidth,
    buildTree,
    clamp,
    formatItems,
    getDiagram,
    labelsOf,
    layoutTree,
    normalizeDiagram,
} from "@elements/diagram/utils";
import { num, str } from "@elements/coerce";
import { DIAGRAM_TYPES } from "@model/elements";
import "@elements/register";
import { recordingDrawContext, tokens } from "@canvas/testkit";

// DrawCall fields are `unknown` (any op, any shape), so a recorded text style narrows before use.
const fontSize = (style: unknown): number =>
    style !== null && typeof style === "object" && "size" in style ? (num(style.size) ?? 13) : 13;

describe("normalizeDiagram", () => {
    it("splits a plain list on commas", () => {
        expect(labelsOf(normalizeDiagram({ items: "A, B, C" }).items)).toEqual(["A", "B", "C"]);
    });
    it("splits on newlines when present, so a detail may contain commas", () => {
        const items = normalizeDiagram({ items: "A | one, two\nB" }).items;
        expect(labelsOf(items)).toEqual(["A", "B"]);
        expect(items[0]!.body).toBe("one, two");
    });
    it("reads 'label | detail | value' segments, leaving absent ones undefined", () => {
        const [full, bare] = normalizeDiagram({ items: "Leads | from ads | 42\nPlain" }).items;
        expect(full).toEqual({ label: "Leads", body: "from ads", value: 42 });
        expect(bare).toEqual({ label: "Plain", body: undefined, value: undefined });
    });
    it("ignores a non-numeric value segment", () => {
        expect(normalizeDiagram({ items: "A | b | soon" }).items[0]!.value).toBeUndefined();
    });
    it("parses axis captions", () => {
        expect(normalizeDiagram({ items: "A", axes: "lo, hi" }).axes).toEqual(["lo", "hi"]);
    });
    it("defaults the presentation options", () => {
        expect(normalizeDiagram({ items: "A" }).options).toEqual({ flow: "down" });
    });
    it("parses edges 'From->To:label', dropping malformed entries", () => {
        const d = normalizeDiagram({ items: "A,B", links: "A->B:yes, broken, C>D" });
        expect(d.edges).toEqual([
            { from: "A", to: "B", label: "yes" },
            { from: "C", to: "D", label: undefined },
        ]);
    });
    it("resolves the type, defaulting to process", () => {
        expect(normalizeDiagram({ items: "A", type: "tree" }).type).toBe("tree");
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

describe("formatItems", () => {
    it("round-trips through the parser", () => {
        const src = "Leads | from ads | 42\nPlain";
        expect(formatItems(normalizeDiagram({ items: src }).items)).toBe(src);
    });
    it("keeps a plain list comma-joined, and drops empty trailing segments", () => {
        expect(formatItems(normalizeDiagram({ items: "A, B" }).items)).toBe("A, B");
    });
    it("switches to newlines once any entry carries a detail", () => {
        expect(formatItems([{ label: "A", body: "x" }, { label: "B" }])).toBe("A | x\nB");
    });
});

describe("registry", () => {
    it("registers every diagram type", () => {
        const ids = diagramTypeOptions().map((o) => o.value);
        expect(ids).toContain("process");
        expect(ids).toContain("flow");
        expect(getDiagram("tree")?.id).toBe("tree");
    });
    // drift guard: the model value-set and the canvas registry must name the same types
    it("matches the DIAGRAM_TYPES value-set exactly", () => {
        const ids = diagramTypeOptions().map((o) => o.value);
        expect([...ids].sort()).toEqual([...DIAGRAM_TYPES].sort());
    });
});

describe("renderDiagram", () => {
    const box = { x: 0, y: 0, w: 400, h: 300 };
    const data = {
        items: "Step one, Step two, Step three",
        links: "Step one->Step two, Step two->Step three",
    };
    const rich = {
        items: "Step one | first detail | 12\nStep two | second detail | 8\nStep three | third | 4",
        links: "Step one->Step two:yes, Step two->Step three",
        axes: "low, high, near, far",
    };

    for (const { value: id } of diagramTypeOptions()) {
        it(`${id} produces draw calls for valid data`, () => {
            const { ctx, calls } = recordingDrawContext();
            renderDiagram(ctx, box, { ...data, type: id }, tokens);
            expect(calls.length).toBeGreaterThan(0);
        });

        it(`${id} survives a single item in a cramped box`, () => {
            const { ctx } = recordingDrawContext();
            expect(() =>
                renderDiagram(
                    ctx,
                    { x: 0, y: 0, w: 60, h: 40 },
                    { items: "Only", type: id },
                    tokens,
                ),
            ).not.toThrow();
        });
    }

    // a surface clips to its own <svg>, so anything outside is silently lost
    describe("stays inside the surface box", () => {
        const crowded = Array.from(
            { length: 10 },
            (_, i) => `Item ${i + 1} | detail ${i + 1}`,
        ).join("\n");
        const boxes = [
            { x: 0, y: 0, w: 420, h: 280 },
            { x: 0, y: 0, w: 260, h: 220 }, // a narrow column, where crowding bites first
            { x: 0, y: 0, w: 900, h: 300 },
        ];
        const SLACK = 4; // strokes and shadows may bleed a hair

        for (const { value: id } of diagramTypeOptions()) {
            it(id, () => {
                for (const b of boxes) {
                    for (const items of [rich.items, crowded]) {
                        const { ctx, calls } = recordingDrawContext();
                        renderDiagram(ctx, b, { ...rich, items, type: id }, tokens);
                        const within = (x: number, y: number, what: string): void => {
                            const where = `${id} ${b.w}x${b.h} ${what}`;
                            expect(x, where).toBeGreaterThanOrEqual(-SLACK);
                            expect(x, where).toBeLessThanOrEqual(b.w + SLACK);
                            expect(y, where).toBeGreaterThanOrEqual(-SLACK);
                            expect(y, where).toBeLessThanOrEqual(b.h + SLACK);
                        };
                        for (const c of calls) {
                            if (c.op === "text" || c.op === "moveTo" || c.op === "lineTo")
                                within(c.x as number, c.y as number, String(c.op));
                            if (c.op === "rect") {
                                within(c.x as number, c.y as number, "rect origin");
                                within(
                                    (c.x as number) + (c.w as number),
                                    (c.y as number) + (c.h as number),
                                    "rect corner",
                                );
                            }
                            if (c.op === "circle") {
                                const [cx, cy, r] = [c.cx, c.cy, c.r] as number[];
                                within(cx! - r!, cy! - r!, "circle");
                                within(cx! + r!, cy! + r!, "circle");
                            }
                            for (const [px, py] of (c.points ?? []) as [number, number][])
                                within(px, py, "polyline");
                        }
                    }
                }
            });
        }
    });

    // inside the surface isn't enough: a label must stay inside its own node box
    describe("keeps each label inside its own node box", () => {
        const longDetails = [
            "01 Site Prep & Species | Deep soil analysis and native selection",
            "02 Structural Planting | High-density grids with engineered soils",
            "03 Canopy Stewardship | Two-year community irrigation contracts",
        ].join("\n");
        const links =
            "01 Site Prep & Species>02 Structural Planting, 01 Site Prep & Species>03 Canopy Stewardship";

        for (const id of ["org", "tree", "mindmap"]) {
            it(id, () => {
                const b = { x: 0, y: 0, w: 690, h: 450 };
                const { ctx, calls } = recordingDrawContext();
                renderDiagram(ctx, b, { type: id, items: longDetails, links }, tokens);
                const rects = calls
                    .filter((c) => c.op === "rect")
                    .map((c) => ({
                        x: num(c.x) ?? 0,
                        y: num(c.y) ?? 0,
                        w: num(c.w) ?? 0,
                        h: num(c.h) ?? 0,
                    }));
                const texts = calls
                    .filter((c) => c.op === "text")
                    .map((c) => ({
                        text: str(c.text) ?? "",
                        x: num(c.x) ?? 0,
                        y: num(c.y) ?? 0,
                        size: fontSize(c.style),
                    }));
                expect(texts.length).toBeGreaterThan(0);
                let checked = 0;
                for (const t of texts) {
                    // slack on purpose: matching only labels already inside would skip the overflow
                    const mid = (r: { y: number; h: number }): number =>
                        Math.abs(t.y - (r.y + r.h / 2));
                    const own = rects
                        .filter((r) => t.x >= r.x && t.x <= r.x + r.w && mid(r) < r.h / 2 + 40)
                        .sort((a, b) => mid(a) - mid(b))[0];
                    if (!own) continue;
                    checked++;
                    const half = (t.size * 1.25) / 2;
                    expect(t.y - half, `${id}: "${t.text}" above its node`).toBeGreaterThanOrEqual(
                        own.y - 0.5,
                    );
                    expect(t.y + half, `${id}: "${t.text}" below its node`).toBeLessThanOrEqual(
                        own.y + own.h + 0.5,
                    );
                }
                expect(
                    checked,
                    `${id}: no label matched a node — the guard would be vacuous`,
                ).toBeGreaterThan(0);
            });
        }
    });

    it("renders nothing when there are no items", () => {
        const { ctx, calls } = recordingDrawContext();
        renderDiagram(ctx, box, { items: "", type: "process" }, tokens);
        expect(calls).toHaveLength(0);
    });
});
