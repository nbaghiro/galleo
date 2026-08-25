import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement } from "@elements/spec";
import { mix } from "@themes";
import { layoutCtx, tokens } from "@canvas/testkit";

const ctx = layoutCtx();
const spec = (type: string): ElementSpec => getElement(type)!;
const nodeOf = (type: string, over: Record<string, unknown> = {}): EngineNode =>
    spec(type).layout({ ...(spec(type).create() as Record<string, unknown>), ...over }, ctx);
const kids = (n: EngineNode): EngineNode[] => n.children ?? [];
const text = (t: string, align?: string): { type: string; data: unknown } => ({
    type: "text",
    data: { text: t, ...(align ? { align } : {}) },
});

describe("container — bare stack (what `group` was)", () => {
    it("defaults to an empty column with gap 14", () => {
        const n = nodeOf("container");
        expect(n.direction).toBe("col");
        expect(n.gap).toBe(14);
        expect(n.children).toEqual([]);
    });
    it("infers center when all text children are centered", () => {
        const n = spec("container").layout(
            { direction: "col", children: [text("a", "center"), text("b", "center")] },
            ctx,
        );
        expect(n.alignX).toBe("center");
    });
    it("does not infer when the children disagree", () => {
        const n = spec("container").layout(
            { direction: "col", children: [text("a", "center"), text("b", "start")] },
            ctx,
        );
        expect(n.alignX).toBeUndefined();
    });
    it("an explicit align wins over inference", () => {
        const n = spec("container").layout(
            { direction: "col", align: "end", children: [text("a", "center")] },
            ctx,
        );
        expect(n.alignX).toBe("end");
    });
    it("paints no surface without one, so a bare stack stays bare", () => {
        expect(nodeOf("container").fill).toBeUndefined();
    });
    it("justify maps onto the node's main-axis distribution, surfaced or not", () => {
        const row = { direction: "row", justify: "between", children: [text("a")] };
        expect(spec("container").layout(row, ctx).distribute).toBe("between");
        expect(spec("container").layout({ ...row, surface: "plain" }, ctx).distribute).toBe(
            "between",
        );
    });
    it("no justify leaves the node without a distribution", () => {
        expect(nodeOf("container", { direction: "row" }).distribute).toBeUndefined();
    });
});

describe("container — surfaced (what `card` was)", () => {
    it("solid: surface fill, theme radius, hairline border", () => {
        const n = nodeOf("container", { surface: "solid" });
        expect(n.fill?.color).toBe(tokens.surface);
        expect(n.fill?.radius).toBe(tokens.radius);
        expect(n.fill?.border).toEqual({ color: tokens.line, width: 1 });
    });
    it("sharp shape forces radius 2", () => {
        expect(nodeOf("container", { surface: "solid", shape: "sharp" }).fill?.radius).toBe(2);
    });
    it("outline: a border and no fill color", () => {
        const n = nodeOf("container", { surface: "outline" });
        expect(n.fill?.color).toBeUndefined();
        expect(n.fill?.border?.width).toBe(1.5);
    });
    it("a surface tightens the gap and adds the inset", () => {
        const n = nodeOf("container", { surface: "solid" });
        expect(n.gap).toBe(12);
        expect(n.padding?.top).toBe(24);
    });
    // the old `card` threw here and `group` did not; the merge keeps the lenient path, because a
    // render that throws takes the whole canvas down over one bad child
    it("falls back for an unknown child type instead of throwing", () => {
        const n = spec("container").layout(
            { children: [{ type: "does-not-exist", data: {} }] },
            ctx,
        );
        expect(n.children).toHaveLength(1);
    });
});

describe("other composites", () => {
    it("faq pairs its children two at a time", () => {
        const n = nodeOf("faq");
        expect(n.gap).toBe(16);
        expect(kids(n)).toHaveLength(3); // 6 children → 3 pairs
        expect(kids(kids(n)[0]!)).toHaveLength(2);
    });
    it("cta is a centered panel tinted toward the accent", () => {
        const n = nodeOf("cta");
        expect(n.alignX).toBe("center");
        expect(n.fill?.color).toBe(mix(tokens.surface, tokens.accent, 0.08));
        expect(n.fill?.radius).toBe(tokens.radius);
    });
    it("pricing is a bordered surface panel", () => {
        const n = nodeOf("pricing");
        expect(n.fill?.color).toBe(tokens.surface);
        expect(n.fill?.border).toEqual({ color: tokens.line, width: 1 });
    });
    it("profile is a fit-width centered column", () => {
        const n = nodeOf("profile");
        expect(n.w.mode).toBe("fit");
        expect(n.alignX).toBe("center");
    });
    it("testimonial stacks a quote over an avatar + name/role row", () => {
        const n = nodeOf("testimonial");
        expect(n.direction).toBe("col");
        expect(kids(n)).toHaveLength(2);
    });
    // The name and role are grow-width text: a fit column around them measures to nothing, and the
    // attribution laid out at zero width, painting nothing under the avatar.
    it("gives the attribution a width to lay out in", () => {
        const attribution = kids(nodeOf("testimonial"))[1]!;
        const names = kids(attribution)[1]!;
        expect(attribution.w.mode).toBe("grow");
        expect(names.w.mode).toBe("grow");
    });
    it("feature stacks icon + heading + body", () => {
        const n = nodeOf("feature");
        expect(n.direction).toBe("col");
        expect(n.gap).toBe(10);
    });
});
