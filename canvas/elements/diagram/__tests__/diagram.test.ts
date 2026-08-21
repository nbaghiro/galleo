import { describe, expect, it } from "vitest";
import type { EngineNode, RenderCommand } from "@engine/node";
import { layout } from "@engine/layout";
import { fit, grow } from "@model/geometry";
import { diagramTypeOptions } from "@elements/diagram/render";
import { DIAGRAM_SHAPES } from "@model/elements";
import {
    ICON_S,
    badgeText,
    buildTree,
    diagramSupportsIcons,
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
import { contrastRatio, luminance, resolveTheme } from "@themes";
import { getElement } from "@elements/spec";
import { composeSection } from "@elements/compose";
import { colGroup } from "@model/artifact";
import "@elements/register";
import {
    inst,
    layoutCtx as tkLayoutCtx,
    measure as tkMeasure,
    recordingDrawContext,
    sectionOf,
    tokens,
} from "@canvas/testkit";

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

    it("dark theme: ink is measured, the tinted wash recedes to the page instead of white", () => {
        const carbon = resolveTheme("carbon").tokens;
        const solid = nodePaint(carbon.accent, carbon, { style: "solid" });
        expect(contrastRatio(solid.ink, solid.fill!)).toBeGreaterThanOrEqual(4.5);
        const tinted = nodePaint(carbon.accent, carbon, { style: "tinted" });
        expect(luminance(tinted.fill!)).toBeLessThan(0.5);
        expect(contrastRatio(tinted.ink, tinted.fill!)).toBeGreaterThanOrEqual(4.5);
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
    measure,
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

// replay every surface's paint and collect the recorded calls
function chromeCalls(commands: RenderCommand[]): { op: string; [k: string]: unknown }[] {
    const calls: { op: string; [k: string]: unknown }[] = [];
    for (const c of commands) {
        if (c.kind !== "surface") continue;
        const rec = recordingDrawContext();
        c.paint(rec.ctx, { x: 0, y: 0, w: c.box.w, h: c.box.h });
        calls.push(...rec.calls);
    }
    return calls;
}

describe("cell icons", () => {
    it("iconInk is the item color where the fill leaves room, the label ink on solid", () => {
        expect(nodePaint("#3366aa", tokens, { style: "tinted" }).iconInk).toBe("#3366aa");
        expect(nodePaint("#3366aa", tokens, { style: "card" }).iconInk).toBe("#3366aa");
        expect(nodePaint("#3366aa", tokens, { style: "outline" }).iconInk).toBe("#3366aa");
        const solid = nodePaint("#3366aa", tokens, { style: "solid" });
        expect(solid.iconInk).toBe(solid.ink);
    });

    it("an iconed cell floats a leading glyph surface, inset before the label", () => {
        const commands = composed({
            type: "process",
            items: "Alpha, Beta",
            itemsMeta: [{ icon: "rocket" }, {}],
        });
        const icons = commands.filter(
            (c) => c.kind === "surface" && c.box.w === ICON_S && c.box.h === ICON_S,
        );
        expect(icons.length).toBe(1);
        const alpha = commands.find((c) => c.kind === "text" && c.text.text === "Alpha")!;
        expect(icons[0]!.box.x + ICON_S).toBeLessThanOrEqual(alpha.box.x + 1);
    });

    it("an item's icon replaces its number badge; the rest keep theirs", () => {
        const badges = chromeCalls(
            composed({
                type: "process",
                items: "Alpha, Beta",
                numbers: "number",
                itemsMeta: [{ icon: "rocket" }, {}],
            }),
        )
            .filter((c) => c.op === "text")
            .map((c) => c.text);
        expect(badges).toContain("2");
        expect(badges).not.toContain("1");
    });

    it("a timeline icon upgrades its spine dot to a milestone marker", () => {
        const radii = chromeCalls(
            composed({
                type: "timeline",
                items: "A, B, C",
                itemsMeta: [{}, { icon: "flag" }, {}],
            }),
        )
            .filter((c) => c.op === "circle")
            .map((c) => c.r);
        expect(radii.filter((r) => r === 5).length).toBe(2);
        expect(radii.filter((r) => r === 11).length).toBe(1);
    });

    it("band types opt out of icons; everything else supports them", () => {
        expect(diagramSupportsIcons("pyramid")).toBe(false);
        expect(diagramSupportsIcons("funnel")).toBe(false);
        expect(diagramSupportsIcons("process")).toBe(true);
        expect(diagramSupportsIcons("timeline")).toBe(true);
    });
});

describe("measured sizing", () => {
    const cellWidths = (commands: RenderCommand[]): number[] =>
        commands.filter((c) => c.kind === "rect").map((c) => Math.round(c.box.w));

    it("org sizes cells to the longest label, capped by the per-leaf share", () => {
        const short = composed({ type: "org", items: "CEO, CTO", links: "CEO>CTO" });
        const long = composed({
            type: "org",
            items: "A remarkably verbose executive title, CTO",
            links: "A remarkably verbose executive title>CTO",
        });
        expect(Math.max(...cellWidths(short))).toBe(90);
        expect(Math.max(...cellWidths(long))).toBe(170);
    });

    it("process wraps sooner when labels are long", () => {
        const items = (label: string): string =>
            Array.from({ length: 4 }, (_, i) => `${label} ${i}`).join(", ");
        const rows = (cmds: RenderCommand[]): number =>
            new Set(cmds.filter((c) => c.kind === "rect").map((c) => Math.round(c.box.y))).size;
        expect(rows(composed({ type: "process", items: items("Go") }))).toBe(1);
        expect(
            rows(composed({ type: "process", items: items("A very long process step label") })),
        ).toBeGreaterThan(1);
    });

    it("process splits a row by item weights; unweighted stays uniform", () => {
        const widths = (cmds: RenderCommand[]): number[] =>
            cmds
                .filter((c) => c.kind === "rect")
                .sort((a, b) => a.box.x - b.box.x)
                .map((c) => Math.round(c.box.w));
        const even = widths(composed({ type: "process", items: "A, B, C" }));
        expect(new Set(even).size).toBe(1);
        const weighted = widths(
            composed({
                type: "process",
                items: "A, B, C",
                itemsMeta: [{ weight: 2 }, {}, {}],
            }),
        );
        expect(weighted[0]!).toBeGreaterThan(weighted[1]! * 1.8);
        expect(weighted[1]).toBe(weighted[2]);
        // total row width is conserved: weights redistribute, never grow the row
        const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum(weighted) - sum(even))).toBeLessThanOrEqual(2);
    });

    it("the slots facet resizes a pair conserving its combined weight", () => {
        const spec = getElement("processDiagram")!;
        const d = { type: "process", items: "A, B, C" };
        const slots = spec.container!.slots!(d)!;
        expect(slots.of(0)).toBe(0);
        expect(slots.of(3)).toBe(1);
        const out = slots.resize([
            { slot: 0, pct: 44 },
            { slot: 1, pct: 22 },
        ]) as { itemsMeta?: { weight?: number }[] };
        const w0 = out.itemsMeta?.[0]?.weight ?? 1;
        const w1 = out.itemsMeta?.[1]?.weight ?? 1;
        expect(w0 / w1).toBeCloseTo(2, 1);
        expect(w0 + w1).toBeCloseTo(2, 1);
        // an even re-split leaves no weight residue in the stored meta
        const back = slots.resize([
            { slot: 0, pct: 33 },
            { slot: 1, pct: 33 },
        ]) as { itemsMeta?: unknown };
        expect(back.itemsMeta).toBeUndefined();
    });

    it("positioned types opt out of the divider gesture", () => {
        const spec = getElement("diagram")!;
        expect(spec.container!.slots!({ type: "cycle", items: "A, B" })).toBeNull();
        expect(spec.container!.slots!({ type: "org", items: "A, B" })).toBeNull();
        expect(spec.container!.slots!({ type: "process", items: "A, B" })).not.toBeNull();
    });

    it("a value-scaled funnel band never narrows past its own label", () => {
        const commands = composed({
            type: "funnel",
            items: "Big wide audience | | 100\nAn unusually long final stage label | | 1",
        });
        const t = commands.find(
            (c) => c.kind === "text" && c.text.text.startsWith("An unusually"),
        )!;
        expect(t.box.w).toBeGreaterThan(150);
    });

    it("org cells grow to hold a wrapped detail, and the detail stays inside its fill", () => {
        const bare = composed({ type: "org", items: "CEO, CTO", links: "CEO>CTO" });
        const detailed = composed({
            type: "org",
            items: "CEO | runs the whole company\nCTO | owns the stack",
            links: "CEO>CTO",
        });
        const cellH = (cmds: RenderCommand[]): number =>
            Math.max(...cmds.filter((c) => c.kind === "rect").map((c) => c.box.h));
        expect(cellH(bare)).toBe(40);
        expect(cellH(detailed)).toBeGreaterThan(40);
        const fills = detailed.filter((c) => c.kind === "rect");
        for (const t of detailed.filter((c) => c.kind === "text")) {
            const cx = t.box.x + t.box.w / 2;
            const cy = t.box.y + t.box.h / 2;
            const cell = fills.find(
                (f) =>
                    cx > f.box.x &&
                    cx < f.box.x + f.box.w &&
                    cy > f.box.y &&
                    cy < f.box.y + f.box.h,
            );
            expect(cell, `text ${JSON.stringify(t.box)} outside every cell`).toBeTruthy();
            expect(t.box.y).toBeGreaterThanOrEqual(cell!.box.y - 1);
            expect(t.box.y + t.box.h).toBeLessThanOrEqual(cell!.box.y + cell!.box.h + 1);
        }
    });

    it("an org detail that cannot fit the capped cell hides instead of spilling", () => {
        const long = "a supporting sentence far too long to ever fit inside one small node";
        const commands = composed({
            type: "org",
            items: `A | ${long}\nB | short note`,
            links: "A>B",
        });
        const texts = commands.filter((c) => c.kind === "text").map((c) => c.text.text);
        expect(texts).toContain("A");
        expect(texts).toContain("short note");
        expect(texts).not.toContain(long);
    });
});

describe("target", () => {
    it("nests one ring per item, outermost first", () => {
        const radii = chromeCalls(composed({ type: "target", items: "Market, Segment, Core" }))
            .filter((c) => c.op === "circle")
            .map((c) => c.r as number);
        expect(radii).toHaveLength(3);
        expect(radii[0]!).toBeGreaterThan(radii[1]!);
        expect(radii[1]!).toBeGreaterThan(radii[2]!);
    });
});

describe("venn", () => {
    const circles = (items: string): number =>
        chromeCalls(composed({ type: "venn", items })).filter((c) => c.op === "circle").length;

    it("draws one circle per set, capped at three", () => {
        expect(circles("A, B")).toBe(2);
        expect(circles("A, B, C")).toBe(3);
        expect(circles("A, B, C, Overlap")).toBe(3);
    });

    it("labels the overlap when a fourth item names it", () => {
        const texts = composed({ type: "venn", items: "A, B, C, Sweet spot" })
            .filter((c) => c.kind === "text")
            .map((c) => c.text.text);
        expect(texts).toContain("Sweet spot");
    });
});

describe("pictogram", () => {
    it("gives every item a row and a mark strip", () => {
        const commands = composed({
            type: "pictogram",
            items: "Enterprise | | 3\nStartup | | 1",
        });
        const texts = commands.filter((c) => c.kind === "text").map((c) => c.text.text);
        expect(texts).toContain("Enterprise");
        expect(texts).toContain("Startup");
        expect(commands.filter((c) => c.kind === "surface")).toHaveLength(2);
    });
});

describe("roadmap", () => {
    it("lays phases end to end and wraps to a new lane when the columns run out", () => {
        const rows = (items: string): number =>
            new Set(
                composed({ type: "roadmap", items, axes: "Q1, Q2, Q3, Q4" })
                    .filter((c) => c.kind === "rect")
                    .map((c) => Math.round(c.box.y)),
            ).size;
        expect(rows("A | | 2\nB | | 2")).toBe(1);
        expect(rows("A | | 2\nB | | 2\nC | | 2")).toBe(2);
    });
});

describe("flow", () => {
    it("ranks a chain top to bottom", () => {
        const ys = composed({
            type: "flow",
            items: "One, Two, Three",
            links: "One->Two, Two->Three",
        })
            .filter((c) => c.kind === "rect")
            .map((c) => Math.round(c.box.y))
            .sort((a, b) => a - b);
        expect(new Set(ys).size).toBe(3);
    });

    it("puts a branch's targets on one rank", () => {
        const ys = new Set(
            composed({
                type: "flow",
                items: "Start, Left, Right",
                links: "Start->Left, Start->Right",
            })
                .filter((c) => c.kind === "rect")
                .map((c) => Math.round(c.box.y)),
        );
        expect(ys.size).toBe(2);
    });

    it("draws a question as a decision diamond, so its cell is painted not filled", () => {
        const plain = composed({ type: "flow", items: "One, Two", links: "One->Two" });
        const decision = composed({ type: "flow", items: "One, Ready?", links: "One->Ready?" });
        const paths = (cmds: RenderCommand[]): number =>
            chromeCalls(cmds).filter((c) => c.op === "path").length;
        expect(paths(decision)).toBeGreaterThan(paths(plain));
    });

    it("labels an edge with its tail", () => {
        const chrome = chromeCalls(
            composed({ type: "flow", items: "Ready?, Ship", links: "Ready?->Ship:yes" }),
        );
        expect(chrome.some((c) => c.op === "text" && c.text === "yes")).toBe(true);
    });
});

describe("mindmap", () => {
    it("splits branches either side of a centred root", () => {
        const rects = composed({
            type: "mindmap",
            items: "Core, A, B, C, D",
            links: "Core>A, Core>B, Core>C, Core>D",
        }).filter((c) => c.kind === "rect");
        const centre = 640 / 2;
        expect(rects.some((c) => c.box.x + c.box.w < centre)).toBe(true);
        expect(rects.some((c) => c.box.x > centre)).toBe(true);
    });
});

// `ctx.availWidth` is an estimate: compose cannot know the padding a container will add, so inside
// a card it runs 48px wide. A type that turns that estimate into pixel widths overhangs its own
// box by exactly that much, which is what put a roadmap's last lane outside its selection border.
// Shares (percent/grow) are resolved by the engine against the real box, so they cannot drift.
describe("a diagram stays inside its box when availWidth over-estimates", () => {
    const EXTRA: Record<string, Record<string, unknown>> = {
        roadmap: { items: "A | a | 1\nB | b | 2\nC | c | 1", axes: "Q1, Q2, Q3, Q4" },
        flow: { items: "A, B?, C, D", links: "A->B?, B?->C:yes, B?->D:no" },
        mindmap: { items: "Core, A, B, C, D", links: "Core>A, Core>B, Core>C, Core>D" },
        org: { items: "CEO, CTO, CFO", links: "CEO>CTO, CEO>CFO" },
    };
    for (const { value: type } of diagramTypeOptions()) {
        it(`${type} fits inside a card`, () => {
            const d = inst("diagram", {
                type,
                items: "Alpha | one | 1\nBeta | two | 2\nGamma | three | 1",
                axes: "Q1, Q2, Q3, Q4",
                height: 260,
                ...EXTRA[type],
            });
            const node = composeSection(
                sectionOf(colGroup([inst("card", { children: [d] })])),
                tkLayoutCtx(1000),
            );
            const { commands, regions } = layout(node, { x: 0, y: 0, w: 1000, h: 900 }, tkMeasure);
            const box = regions.find((r) => r.id === "el:s1:0.0")!.box;
            for (const c of commands) {
                if (c.box.x < box.x - 1 || c.box.y < box.y - 1 || c.box.y > box.y + box.h + 1)
                    continue;
                expect(
                    c.box.x + c.box.w,
                    `${type} ${c.kind} overhangs its box`,
                ).toBeLessThanOrEqual(box.x + box.w + 1);
            }
        });
    }
});
