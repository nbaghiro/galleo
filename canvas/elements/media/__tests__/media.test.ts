import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { ElementSpec } from "@elements/spec";
import { getElement, listElements, resizeOf } from "@elements/spec";
import { updateDataAt } from "@elements/ops";
import type { ArtifactContent } from "@model/artifact";
import { layoutCtx, recordingDrawContext, tokens } from "@canvas/testkit";

const ctx = layoutCtx();
const spec = (type: string): ElementSpec => getElement(type)!;
const nodeOf = (type: string, over: Record<string, unknown> = {}): EngineNode =>
    spec(type).layout({ ...(spec(type).create() as Record<string, unknown>), ...over }, ctx);
const kids = (n: EngineNode): EngineNode[] => n.children ?? [];

const SRC = "/api/media/asset/00000000-0000-4000-8000-000000000000";
const art = (data: Record<string, unknown>): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "container",
                data: {
                    children: [
                        { id: "e-keep", type: "media", data, layout: { width: { pct: 40 } } },
                    ],
                },
            },
        },
    ],
});
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("one element, many kinds", () => {
    it("registers every kind against the same element", () => {
        const media = listElements().filter((s) => s.category === "media");
        expect(media.map((s) => s.type).sort()).toEqual([
            "avatar",
            "gif",
            "graphic",
            "icon",
            "illustration",
            "image",
            "media",
            "sticker",
            "video",
        ]);
        // one layout for all of them: what makes a kind swap a data patch rather than a replacement
        expect(new Set(media.map((s) => s.controls)).size).toBe(1);
    });

    it("keeps the frame when the kind changes, which is the point of merging them", () => {
        const framed = { src: SRC, aspect: 1.9, radius: 8 };
        const asPhoto = spec("media").layout({ kind: "photo", ...framed }, ctx);
        const asVideo = spec("media").layout({ kind: "video", ...framed }, ctx);
        expect(asPhoto.aspect).toBe(1.9);
        expect(asVideo.aspect).toBe(1.9);
        expect(asVideo.fill?.radius).toBe(8);
    });

    it("reads the kind from data, and falls back to the type it was stored under", () => {
        // a tree written before the merge has no kind in data
        expect(nodeOf("video", { src: SRC }).fill?.color).toBe("#15171c");
        expect(nodeOf("image", { src: SRC }).image?.src).toBe(SRC);
    });
});

describe("pictures", () => {
    it("a freshly inserted element is an empty frame, not a blank image", () => {
        const n = nodeOf("image");
        expect(n.aspect).toBe(1.5);
        expect(n.image).toBeUndefined();
        expect(kids(n)[0]!.surface).toBeDefined(); // the media glyph
    });

    it("with a source: cover fit, radius 14, zoom 1", () => {
        const n = nodeOf("image", { src: SRC });
        expect(n.image?.fit).toBe("cover");
        expect(n.image?.radius).toBe(14);
        expect(n.image?.zoom).toBe(1);
        expect(n.w.mode).toBe("grow");
    });

    it("zoom is a percent converted to a fraction", () => {
        expect(nodeOf("image", { src: SRC, zoom: 150 }).image?.zoom).toBe(1.5);
    });

    it("sticker and illustration letterbox rather than crop", () => {
        expect(nodeOf("sticker", { src: SRC }).image?.fit).toBe("contain");
        expect(nodeOf("sticker", { src: SRC }).aspect).toBe(1);
        expect(nodeOf("illustration", { src: SRC }).image?.fit).toBe("contain");
    });

    it("a circle shape is square whatever aspect says, and rings outside the picture", () => {
        const n = nodeOf("avatar", { src: SRC, aspect: 2 });
        expect(n.w).toEqual({ mode: "fixed", value: 72 });
        expect(n.image?.radius).toBe(72);
        expect(kids(nodeOf("avatar", { src: SRC, ring: true }))[0]!.image?.radius).toBe(72);
        expect(nodeOf("avatar", { src: SRC, ring: true }).fill?.border?.color).toBe(tokens.accent);
    });
});

describe("clips", () => {
    it("paints the poster as an image leaf so static surfaces show a frame", () => {
        const n = nodeOf("video", {
            src: "https://cdn.example.com/clip.mp4",
            poster: "https://p/x.jpg",
        });
        expect(n.image).toMatchObject({ src: "https://p/x.jpg", fit: "cover" });
    });

    it("derives a YouTube still when no poster was stored", () => {
        expect(nodeOf("video", { src: YT }).image?.src).toBe(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        );
    });

    it("falls back to the dark plate when no frame is known", () => {
        const n = nodeOf("video", { src: "https://cdn.example.com/clip.mp4" });
        expect(n.image).toBeUndefined();
        expect(n.fill?.color).toBe("#15171c");
    });

    it("only a clip declares itself live", () => {
        const s = spec("media");
        expect(typeof s.live).toBe("function");
        expect((s.live as (d: unknown) => boolean)({ kind: "video" })).toBe(true);
        expect((s.live as (d: unknown) => boolean)({ kind: "photo" })).toBe(false);
    });
});

describe("vectors", () => {
    it("renders the glyph into a fixed-size surface", () => {
        const n = nodeOf("icon");
        expect(n.w).toEqual({ mode: "fixed", value: 72 });
        expect(n.h).toEqual({ mode: "fixed", value: 72 });
        expect(n.surface).toBeDefined();
    });

    it("paints the default glyph tinted to the accent role", () => {
        const { ctx: rec, calls } = recordingDrawContext();
        nodeOf("icon").surface!.paint(rec, { x: 0, y: 0, w: 72, h: 72 });
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.some((c) => (c.style as { stroke?: string }).stroke === tokens.accent)).toBe(
            true,
        );
    });

    it("a graphic takes its aspect from the document's viewBox", () => {
        expect(nodeOf("graphic").aspect).toBeCloseTo(1, 5);
        expect(nodeOf("graphic").w.mode).toBe("grow");
    });
});

describe("resize contracts", () => {
    it("frames resize by aspect and sized kinds by their side", () => {
        const s = spec("media");
        expect(resizeOf(s, { kind: "photo" })?.aspect).toEqual({ min: 0.4, max: 2.6 });
        expect(resizeOf(s, { kind: "icon" })?.height).toMatchObject({ key: "size" });
        expect(resizeOf(s, { kind: "photo", shape: "circle" })?.height).toMatchObject({
            key: "size",
        });
        expect(resizeOf(s, { kind: "graphic" })?.aspect).toEqual({ min: 0.3, max: 3 });
    });
});

describe("swapping a picture for a clip in place", () => {
    it("keeps the node, its id, its width and its frame", () => {
        const before = art({ kind: "photo", src: "/api/media/asset/a", aspect: 1.9, radius: 8 });
        // what the picker's onPick does: patch kind and src on the same element
        const after = updateDataAt(
            before,
            { section: "s1", path: [0] },
            {
                kind: "video",
                src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                aspect: 1.9,
                radius: 8,
            },
        );
        const el = (
            after.sections[0]!.root.data as { children: { id?: string; layout?: unknown }[] }
        ).children[0]!;
        expect(el.id).toBe("e-keep");
        expect(el.layout).toEqual({ width: { pct: 40 } });

        const spec = getElement("media")!;
        const node = spec.layout((el as { data: unknown }).data, ctx);
        expect(node.aspect).toBe(1.9);
        expect(node.fill?.color).toBe("#15171c");
        expect(node.image?.src).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    });
});
