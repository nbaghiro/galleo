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

describe("image / imageLike", () => {
    it("default photo is cover-fit, radius 14, zoom 1, aspect 1.5", () => {
        const n = nodeOf("image");
        expect(n.aspect).toBe(1.5);
        expect(n.image?.fit).toBe("cover");
        expect(n.image?.radius).toBe(14);
        expect(n.image?.zoom).toBe(1);
        expect(n.w.mode).toBe("grow");
    });
    it("zoom is a percent converted to a fraction", () => {
        expect(nodeOf("image", { zoom: 150 }).image?.zoom).toBe(1.5);
    });
    it("sticker + illustration default to contain fit", () => {
        expect(nodeOf("sticker").image?.fit).toBe("contain");
        expect(nodeOf("sticker").aspect).toBe(1);
        expect(nodeOf("illustration").image?.fit).toBe("contain");
    });
});

describe("avatar", () => {
    it("no ring: a fully-round image (radius = size)", () => {
        const n = nodeOf("avatar");
        expect(n.w).toEqual({ mode: "fixed", value: 72 });
        expect(kids(n)[0]!.image?.radius).toBe(72);
    });
    it("ring: adds a bordered accent wrapper", () => {
        expect(nodeOf("avatar", { ring: true }).fill?.border?.color).toBe(tokens.accent);
    });
});

describe("video", () => {
    it("is a 16:9 dark box with a play glyph", () => {
        const n = nodeOf("video");
        expect(n.aspect).toBe(16 / 9);
        expect(n.fill?.color).toBe("#15171c");
    });
});

describe("icon", () => {
    it("bakes an SVG data-URI sized to the glyph", () => {
        const n = nodeOf("icon");
        expect(n.w).toEqual({ mode: "fixed", value: 72 });
        expect(n.image?.fit).toBe("contain");
        expect(n.image?.src.startsWith("data:image/svg+xml,")).toBe(true);
    });
});
