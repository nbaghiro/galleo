import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement, listElements } from "@elements/spec";
import { layoutCtx, recordingDrawContext, tokens } from "@canvas/testkit";

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
    it("renders the glyph into a fixed-size vector surface", () => {
        const n = nodeOf("icon");
        expect(n.w).toEqual({ mode: "fixed", value: 72 });
        expect(n.h).toEqual({ mode: "fixed", value: 72 });
        expect(n.surface).toBeDefined();
    });
    it("paints the default glyph tinted to the accent role", () => {
        const { ctx: rec, calls } = recordingDrawContext();
        spec("icon").layout(spec("icon").create(), ctx).surface!.paint(rec, {
            x: 0,
            y: 0,
            w: 72,
            h: 72,
        });
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.some((c) => (c.style as { stroke?: string }).stroke === tokens.accent)).toBe(
            true,
        );
    });
});

// Driven off the registry, not a hardcoded list: a new media element is covered the moment it registers.
describe("a media element with no source paints its own empty state", () => {
    const mediaTypes = (): string[] =>
        listElements()
            .filter((s) => s.category === "media")
            .map((s) => s.type);

    it("covers every registered media element", () => {
        expect(mediaTypes().length).toBeGreaterThan(3);
    });

    it("never leaves an image leaf pointing at an empty src", () => {
        for (const type of mediaTypes()) {
            const n = nodeOf(type, { src: "" });
            expect(n.image?.src, `${type} painted an empty image leaf`).not.toBe("");
        }
    });

    it("keeps the frame's shape so the ghost occupies the real slot", () => {
        const n = nodeOf("image", { src: "", aspect: 1.4 });
        expect(n.aspect).toBe(1.4);
        expect(n.fill).toBeDefined();
    });

    it("draws the picture glyph rather than an empty box", () => {
        const n = nodeOf("image", { src: "" });
        const glyph = kids(n)[0];
        expect(glyph?.surface).toBeDefined();
        const { ctx: draw, calls } = recordingDrawContext();
        glyph!.surface!.paint(draw, { x: 0, y: 0, w: 34, h: 34 });
        expect(calls.map((c) => c.op)).toEqual(
            expect.arrayContaining(["rect", "circle", "polyline"]),
        );
    });

    it("still paints the real asset when a source is set", () => {
        const n = nodeOf("image", { src: "https://example.com/a.jpg" });
        expect(n.image?.src).toBe("https://example.com/a.jpg");
        expect(n.children).toBeUndefined();
    });
});
