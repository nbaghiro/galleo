import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement } from "@elements/spec";
import { layoutCtx, tokens } from "@canvas/testkit";

const ctx = layoutCtx();
const spec = (type: string): ElementSpec => getElement(type)!;
const nodeOf = (type: string, over: Record<string, unknown> = {}): EngineNode =>
    spec(type).layout({ ...(spec(type).create() as Record<string, unknown>), ...over }, ctx);
const kids = (n: EngineNode): EngineNode[] => n.children ?? [];

describe("text", () => {
    it("default is the body style in ink", () => {
        const n = nodeOf("text");
        expect(n.text?.size).toBe(17);
        expect(n.text?.weight).toBe(400);
        expect(n.text?.color).toBe(tokens.ink);
        expect(n.text?.wrap).toBe("words");
        expect(n.w.mode).toBe("grow");
        expect(n.h.mode).toBe("fit");
    });
    it("a display style takes the theme heading weight (not the table's 600)", () => {
        const n = nodeOf("text", { style: "h1" });
        expect(n.text?.size).toBe(44);
        expect(n.text?.weight).toBe(tokens.headingWeight);
    });
    it("the label style is small + accent-colored", () => {
        const n = nodeOf("text", { style: "label" });
        expect(n.text?.size).toBe(13);
        expect(n.text?.color).toBe(tokens.accent);
    });
    it("an explicit color overrides the style tone", () => {
        expect(nodeOf("text", { color: "#123456" }).text?.color).toBe("#123456");
    });
    it("has no runs until marks are present", () => {
        expect(nodeOf("text").text?.runs).toBeUndefined();
    });
});

describe("bullets", () => {
    const firstMarker = (over: Record<string, unknown>): EngineNode =>
        kids(kids(nodeOf("bullets", over))[0]!)[0]!;
    it("default marker is an accent dot (a disc, not text)", () => {
        const m = firstMarker({});
        expect(m.fill?.color).toBe(tokens.accent);
        expect(m.fill?.radius).toBe(99);
        expect(m.text).toBeUndefined();
    });
    it("the number marker renders '1.' in accent", () => {
        const m = firstMarker({ marker: "number" });
        expect(m.text?.text).toBe("1.");
        expect(m.text?.color).toBe(tokens.accent);
    });
    it("the check marker renders '✓'", () => {
        expect(firstMarker({ marker: "check" }).text?.text).toBe("✓");
    });
});

describe("callout", () => {
    const bar = (over: Record<string, unknown>): EngineNode => kids(nodeOf("callout", over))[0]!;
    it("the note tone uses the theme accent for the side bar", () => {
        expect(bar({}).fill?.color).toBe(tokens.accent);
    });
    it("the info tone uses its fixed hex", () => {
        expect(bar({ tone: "info" }).fill?.color).toBe("#2d5bff");
    });
});

describe("code", () => {
    it("splits into one mono line per row; an empty line keeps a space", () => {
        const n = spec("code").layout({ code: "a\n\nb" }, ctx);
        expect(kids(n).map((l) => l.text?.text)).toEqual(["a", " ", "b"]);
        expect(kids(n)[0]!.text?.size).toBe(13.5);
    });
});

describe("quote", () => {
    it("stacks its children in a column", () => {
        const n = nodeOf("quote");
        expect(n.direction).toBe("col");
        expect(kids(n).length).toBeGreaterThanOrEqual(2);
    });
});
