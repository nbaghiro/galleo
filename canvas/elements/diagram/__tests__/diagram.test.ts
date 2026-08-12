import { describe, expect, it } from "vitest";
import type { EngineNode, RenderCommand } from "@engine/node";
import { layout } from "@engine/layout";
import { fit, grow } from "@model/geometry";
import { diagramTypeOptions } from "@elements/diagram/render";
import { DIAGRAM_SHAPES } from "@model/elements";
import {
    badgeText,
    buildTree,
    drawShape,
    getNodeShape,
    nodeShapeIds,
    clamp,
    diagramColors,
    drawNodeBadge,
    formatItems,
    getDiagram,
    labelsOf,
    layoutTree,
    nodePaint,
    normalizeDiagram,
    resolveItemColor,
    toDiagramData,
    type ResolvedDiagram,
} from "@elements/diagram/utils";
import { DIAGRAM_TYPES } from "@model/elements";
import "@elements/register";
import { recordingDrawContext, tokens } from "@canvas/testkit";

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
        expect(normalizeDiagram({ items: "A" }).options).toEqual({
            style: "solid",
            shape: undefined,
            numbers: "none",
        });
    });
    it("parses edges 'Parent>Child', dropping malformed entries", () => {
        const d = normalizeDiagram({ items: "A,B", links: "A>B, broken, C>D" });
        expect(d.edges).toEqual([
            { from: "A", to: "B", label: undefined },
            { from: "C", to: "D", label: undefined },
        ]);
    });
    it("resolves the type, defaulting to process", () => {
        expect(normalizeDiagram({ items: "A", type: "org" }).type).toBe("org");
        expect(normalizeDiagram({ items: "A" }).type).toBe("process");
    });
});

describe("itemsMeta", () => {
    it("zips positional meta onto items, ignoring excess entries", () => {
        const d = normalizeDiagram({
            items: "A, B, C",
            itemsMeta: [
                { color: "#ff0000", emphasis: true },
                {},
                { icon: "rocket" },
                { color: "#0f0" },
            ],
        });
        expect(d.items[0]).toMatchObject({ label: "A", color: "#ff0000", emphasis: true });
        expect(d.items[1]!.color).toBeUndefined();
        expect(d.items[2]!.icon).toBe("rocket");
        expect(d.items).toHaveLength(3);
    });
    it("coerces malformed meta entries instead of failing", () => {
        const d = normalizeDiagram(
            toDiagramData({ items: "A, B", itemsMeta: [{ color: 7, emphasis: "yes" }, null] }),
        );
        expect(d.items[0]!.color).toBeUndefined();
        expect(d.items[0]!.emphasis).toBeUndefined();
    });
});

describe("resolveItemColor", () => {
    it("passes hex through, resolves theme roles, drops junk", () => {
        expect(resolveItemColor("#a1b2c3", tokens)).toBe("#a1b2c3");
        expect(resolveItemColor("accent", tokens)).toBe(tokens.accent);
        expect(resolveItemColor("not-a-color", tokens)).toBeUndefined();
        expect(resolveItemColor(undefined, tokens)).toBeUndefined();
    });
});

describe("diagramColors", () => {
    it("returns opaque 6-digit hex (never alpha)", () => {
        const cols = diagramColors(tokens, 8);
        expect(cols).toHaveLength(8);
        for (const c of cols) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
    it("starts at the accent and lightens from there", () => {
        const cols = diagramColors(tokens, 3);
        expect(cols[0]!.toLowerCase()).toBe(tokens.accent.toLowerCase());
        expect(cols[1]).not.toBe(cols[0]);
    });
});

describe("nodePaint treatments", () => {
    it("solid carries a downward depth gradient on a hex fill", () => {
        const p = nodePaint("#3366aa", tokens, { style: "solid" });
        expect(p.fill).toBe("#3366aa");
        expect(p.gradient?.from).toBe("#3366aa");
        expect(p.gradient?.angle).toBe(180);
    });
    it("tinted washes the color opaque and keeps readable ink", () => {
        const p = nodePaint("#3366aa", tokens, { style: "tinted" });
        expect(p.fill).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(p.fill).not.toBe("#3366aa");
        expect(p.gradient).toBeUndefined();
    });
    it("card is paper + hairline + shadow, ignoring the item color fill", () => {
        const p = nodePaint("#3366aa", tokens, { style: "card" });
        expect(p.fill).toBe(tokens.surface);
        expect(p.stroke).toBe(tokens.line);
        expect(p.shadow?.blur).toBe(10);
        expect(p.ink).toBe(tokens.ink);
    });
    it("outline strokes the color with no fill", () => {
        const p = nodePaint("#3366aa", tokens, { style: "outline" });
        expect(p.fill).toBeUndefined();
        expect(p.stroke).toBe("#3366aa");
    });
    it("emphasis promotes any treatment to solid", () => {
        const p = nodePaint("#3366aa", tokens, { style: "outline", emphasis: true });
        expect(p.fill).toBe("#3366aa");
        expect(p.gradient).toBeTruthy();
    });
});

describe("badges", () => {
    it("badgeText maps the numbering option to per-item badges", () => {
        expect(badgeText("none", 0)).toBeUndefined();
        expect(badgeText("number", 2)).toBe("3");
        expect(badgeText("letter", 1)).toBe("B");
    });
    it("drawNodeBadge paints a disc and its text", () => {
        const rec = recordingDrawContext();
        drawNodeBadge(rec.ctx, 10, 10, "1", "#3366aa", tokens);
        expect(rec.calls.some((c) => c.op === "circle")).toBe(true);
        expect(rec.calls.some((c) => c.op === "text" && c.text === "1")).toBe(true);
    });
});

describe("node shapes", () => {
    it("every authored shape resolves in the registry", () => {
        for (const id of DIAGRAM_SHAPES) expect(getNodeShape(id).id).toBe(id);
        expect(nodeShapeIds()).toContain("diamond"); // renderer-assigned, not authored
    });
    it("unknown ids fall back to rounded", () => {
        expect(getNodeShape("blob").id).toBe("rounded");
        expect(getNodeShape(undefined).id).toBe("rounded");
    });
    it("engine-fillable shapes carry a radius; angled ones inset text instead", () => {
        expect(getNodeShape("rounded").engineRadius?.(46)).toBe(6);
        expect(getNodeShape("pill").engineRadius?.(46)).toBe(23);
        expect(getNodeShape("chevron").engineRadius).toBeUndefined();
        expect(getNodeShape("chevron").insetX(46)).toBeGreaterThan(0);
        expect(getNodeShape("hexagon").insetX(46)).toBeGreaterThan(0);
    });
    it("drawShape paints a silhouette path with the full node paint", () => {
        const rec = recordingDrawContext();
        drawShape(
            rec.ctx,
            "hexagon",
            { x: 0, y: 0, w: 120, h: 46 },
            nodePaint("#3366aa", tokens, { style: "solid" }),
        );
        const path = rec.calls.find((c) => c.op === "path");
        expect(path).toBeTruthy();
        expect((path!.style as { gradient?: unknown }).gradient).toBeTruthy();
    });
    it("an authored chevron flows into a composed process (silhouettes behind, no links)", () => {
        const commands = composed({ items: "A, B, C", type: "process", shape: "chevron" });
        const chromeOps = commands
            .filter((c) => c.kind === "surface")
            .flatMap((c) => {
                const rec = recordingDrawContext();
                (c as { paint: (g: unknown, b: unknown) => void }).paint(rec.ctx, {
                    x: 0,
                    y: 0,
                    w: c.box.w,
                    h: c.box.h,
                });
                return rec.calls.map((call) => call.op);
            });
        expect(chromeOps.filter((op) => op === "path").length).toBe(3); // one silhouette per item
        expect(chromeOps).not.toContain("polyline"); // chevrons are their own arrows
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
        const t = buildTree(normalizeDiagram({ items: "A, B, C", links: "A>B, B>C, C>A" }))!;
        expect(t.label).toBe("A");
        expect(t.children[0]!.label).toBe("B");
        expect(t.children[0]!.children[0]!.label).toBe("C");
        expect(t.children[0]!.children[0]!.children).toHaveLength(0); // C>A back-edge cut
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
        expect(ids).toContain("org");
        expect(getDiagram("hub")?.id).toBe("hub");
    });
    // drift guard: the model value-set and the canvas registry must name the same types
    it("matches the DIAGRAM_TYPES value-set exactly", () => {
        const ids = diagramTypeOptions().map((o) => o.value);
        expect([...ids].sort()).toEqual([...DIAGRAM_TYPES].sort());
    });
});

// ---- the composed path: arrange → engine layout → commands, the way compose runs it ----

const measure = (
    leaf: { text: string; size: number },
    maxWidth: number,
): { width: number; height: number } => {
    const w = leaf.text.length * 8;
    const lines = Math.max(1, Math.ceil(w / Math.max(1, maxWidth)));
    return { width: Math.min(w, maxWidth), height: lines * leaf.size * 1.35 };
};

const kidsFor = (diagram: ResolvedDiagram): EngineNode[] =>
    diagram.items.flatMap((i): EngineNode[] => [
        { w: grow(), h: fit(), text: { text: i.label, fontId: "t", size: 13, wrap: "words" } },
        { w: grow(), h: fit(), text: { text: i.body ?? "", fontId: "t", size: 11, wrap: "words" } },
    ]);

const layoutCtx = (w: number): Record<string, unknown> => ({
    box: { x: 0, y: 0, w, h: 260 },
    availWidth: w,
    format: {
        id: "deck",
        name: "Deck",
        kind: "paged",
        width: 1280,
        height: 720,
        tokenScale: 1,
        splitMinWidth: 520,
        overflow: "paginate",
    },
    theme: tokens,
});

function composed(data: Record<string, unknown>, w = 640, h = 260): RenderCommand[] {
    const diagram = normalizeDiagram(toDiagramData(data));
    const type = getDiagram(diagram.type)!;
    const node = type.arrange(diagram, layoutCtx(w) as never, kidsFor(diagram), h);
    return layout(node, { x: 0, y: 0, w, h }, measure as never).commands;
}

const DATA = {
    items: "Step one | first detail | 12\nStep two | second detail | 8\nStep three | third | 4",
    links: "Step one>Step two, Step two>Step three",
    axes: "low, high, near, far",
};

describe("composed diagrams", () => {
    for (const { value: id } of diagramTypeOptions()) {
        it(`${id} composes to commands inside the box`, () => {
            for (const [w, h] of [
                [640, 260],
                [320, 180],
            ] as const) {
                const commands = composed({ ...DATA, type: id }, w, h);
                expect(commands.length).toBeGreaterThan(0);
                for (const c of commands) {
                    expect(c.box.x, `${id} x at ${w}x${h}`).toBeGreaterThanOrEqual(-1);
                    expect(c.box.y, `${id} y at ${w}x${h}`).toBeGreaterThanOrEqual(-1);
                    expect(c.box.x + c.box.w, `${id} right at ${w}x${h}`).toBeLessThanOrEqual(
                        w + 1,
                    );
                    expect(c.box.y + c.box.h, `${id} bottom at ${w}x${h}`).toBeLessThanOrEqual(
                        h + 1,
                    );
                }
            }
        });

        it(`${id} survives one item and a crowded ten`, () => {
            expect(() => composed({ items: "Only", type: id }, 200, 140)).not.toThrow();
            const many = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`).join(", ");
            expect(() => composed({ items: many, type: id })).not.toThrow();
        });

        it(`${id} keeps a stable command profile`, () => {
            const commands = composed({ ...DATA, type: id });
            const profile = commands.map((c) => ({
                kind: c.kind,
                box: {
                    x: Math.round(c.box.x),
                    y: Math.round(c.box.y),
                    w: Math.round(c.box.w),
                    h: Math.round(c.box.h),
                },
            }));
            // decorate chrome exercised through a recorder, since surface paints are closures
            const chrome = commands
                .filter((c) => c.kind === "surface")
                .map((c) => {
                    const rec = recordingDrawContext();
                    (c as { paint: (g: unknown, b: unknown) => void }).paint(rec.ctx, {
                        x: 0,
                        y: 0,
                        w: c.box.w,
                        h: c.box.h,
                    });
                    return rec.calls.map((call) => call.op);
                });
            expect({ profile, chrome }).toMatchSnapshot();
        });
    }

    it("labels are real text commands, editable by address", () => {
        const commands = composed({ items: "Alpha | detail", type: "process" });
        const texts = commands.filter((c) => c.kind === "text");
        expect(texts.some((c) => c.kind === "text" && c.text.text === "Alpha")).toBe(true);
        expect(texts.some((c) => c.kind === "text" && c.text.text === "detail")).toBe(true);
    });
});
