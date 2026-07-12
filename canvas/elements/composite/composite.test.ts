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

describe("group — cross-axis alignment inference", () => {
    it("defaults to an empty column with gap 14", () => {
        const n = nodeOf("group");
        expect(n.direction).toBe("col");
        expect(n.gap).toBe(14);
        expect(n.children).toEqual([]);
    });
    it("infers center when all text children are centered", () => {
        const n = spec("group").layout(
            { direction: "col", children: [text("a", "center"), text("b", "center")] },
            ctx,
        );
        expect(n.alignX).toBe("center");
    });
    it("does not infer when the children disagree", () => {
        const n = spec("group").layout(
            { direction: "col", children: [text("a", "center"), text("b", "start")] },
            ctx,
        );
        expect(n.alignX).toBeUndefined();
    });
    it("an explicit align wins over inference", () => {
        const n = spec("group").layout(
            { direction: "col", align: "end", children: [text("a", "center")] },
            ctx,
        );
        expect(n.alignX).toBe("end");
    });
});

describe("card", () => {
    it("solid default: surface fill, theme radius, hairline border", () => {
        const n = nodeOf("card");
        expect(n.fill?.color).toBe(tokens.surface);
        expect(n.fill?.radius).toBe(tokens.radius);
        expect(n.fill?.border).toEqual({ color: tokens.line, width: 1 });
    });
    it("sharp shape forces radius 2", () => {
        expect(nodeOf("card", { shape: "sharp" }).fill?.radius).toBe(2);
    });
    it("outline style: a border and no fill color", () => {
        const n = nodeOf("card", { style: "outline" });
        expect(n.fill?.color).toBeUndefined();
        expect(n.fill?.border?.width).toBe(1.5);
    });
    it("throws on an unknown child type", () => {
        expect(() =>
            spec("card").layout({ children: [{ type: "does-not-exist", data: {} }] }, ctx),
        ).toThrow();
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
    it("feature stacks icon + heading + body", () => {
        const n = nodeOf("feature");
        expect(n.direction).toBe("col");
        expect(n.gap).toBe(10);
    });
});
