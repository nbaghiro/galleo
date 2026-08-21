import { describe, expect, it } from "vitest";
import type { ArtifactContent } from "@model/artifact";
import { mapMediaRefs, mediaRefs } from "@model/artifact";
import { assetIdFromUrl, assetUrl, isEmbedVideoUrl } from "@model/media";

const ASSET = "00000000-0000-4000-8000-000000000001";

const content = (): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    background: { kind: "image", image: "https://cdn.example/backdrop.jpg" },
    sections: [
        {
            id: "s1",
            background: { kind: "image", image: "https://cdn.example/section.jpg" },
            root: {
                type: "container",
                data: {
                    children: [
                        { type: "image", data: { src: "https://cdn.example/a.jpg", aspect: 1.5 } },
                        {
                            type: "table",
                            data: {
                                cells: [
                                    { type: "avatar", data: { src: "https://cdn.example/b.png" } },
                                ],
                            },
                        },
                        {
                            type: "video",
                            data: {
                                src: "https://cdn.example/clip.mp4",
                                poster: "https://cdn.example/poster.jpg",
                            },
                        },
                        { type: "embed", data: { url: "https://example.com/page" } },
                        { type: "icon", data: { glyph: { id: "lucide:star", body: "<path/>" } } },
                        { type: "button", data: { href: "https://example.com/buy" } },
                    ],
                },
            },
        },
    ],
});

describe("mediaRefs", () => {
    it("finds every media url, through children and cells", () => {
        expect(mediaRefs(content()).sort()).toEqual([
            "https://cdn.example/a.jpg",
            "https://cdn.example/b.png",
            "https://cdn.example/backdrop.jpg",
            "https://cdn.example/clip.mp4",
            "https://cdn.example/poster.jpg",
            "https://cdn.example/section.jpg",
        ]);
    });

    it("leaves link-shaped fields alone: an embed page, a button href, an icon glyph", () => {
        const refs = mediaRefs(content());
        expect(refs).not.toContain("https://example.com/page");
        expect(refs).not.toContain("https://example.com/buy");
    });

    it("reports each distinct url once", () => {
        const same = { type: "image", data: { src: "https://cdn.example/x.jpg" } };
        const c = {
            sections: [{ id: "s", root: { type: "container", data: { children: [same, same] } } }],
        };
        expect(mediaRefs(c)).toEqual(["https://cdn.example/x.jpg"]);
    });

    it("survives shapes it has never seen", () => {
        expect(mediaRefs(null)).toEqual([]);
        expect(mediaRefs({ sections: "nope" })).toEqual([]);
        expect(mediaRefs({ sections: [null, { root: null }] })).toEqual([]);
    });
});

describe("mapMediaRefs", () => {
    it("rewrites every reference and nothing else", () => {
        const next = mapMediaRefs(content(), () => assetUrl(ASSET)) as ArtifactContent;
        expect(mediaRefs(next)).toEqual([assetUrl(ASSET)]);

        const kids = (
            next.sections[0]!.root.data as {
                children: { type: string; data: Record<string, unknown> }[];
            }
        ).children;
        expect(kids.find((k) => k.type === "embed")!.data.url).toBe("https://example.com/page");
        expect(kids.find((k) => k.type === "image")!.data.aspect).toBe(1.5); // siblings kept
    });

    it("returns the very same object when nothing changed", () => {
        const c = content();
        expect(mapMediaRefs(c, (url) => url)).toBe(c);
    });

    it("rebuilds only the branches that changed", () => {
        const c = content();
        const next = mapMediaRefs(c, (url) =>
            url === "https://cdn.example/a.jpg" ? assetUrl(ASSET) : url,
        ) as ArtifactContent;
        expect(next).not.toBe(c);
        expect(next.background).toBe(c.background); // untouched branch, same reference
        expect(next.sections[0]!.background).toBe(c.sections[0]!.background);
    });
});

// The AI resolves image phrases one section at a time (runGenerate, the section and relayout tools)
// and one element at a time (the element tool), never over a whole draft. Both walks take `unknown`,
// so a level they did not understand read as "no media here" rather than failing.
describe("the levels the AI resolves at", () => {
    const image = () => ({ type: "image", data: { src: "a quiet studio desk", aspect: 1.2 } });
    const section = () => ({
        id: "s1",
        background: { kind: "image", image: "a dark skyline" },
        root: { type: "container", data: { children: [image()] } },
    });

    it("reads a bare section's elements, not only its background", () => {
        expect(mediaRefs(section()).sort()).toEqual(["a dark skyline", "a quiet studio desk"]);
    });

    it("reads a bare element", () => {
        expect(mediaRefs(image())).toEqual(["a quiet studio desk"]);
    });

    it("rewrites a bare section and a bare element", () => {
        expect(mediaRefs(mapMediaRefs(section(), () => assetUrl(ASSET)))).toEqual([
            assetUrl(ASSET),
        ]);
        expect(mediaRefs(mapMediaRefs(image(), () => assetUrl(ASSET)))).toEqual([assetUrl(ASSET)]);
    });

    it("keeps the identity rule at those levels too", () => {
        const s = section();
        expect(mapMediaRefs(s, (url) => url)).toBe(s);
        const e = image();
        expect(mapMediaRefs(e, (url) => url)).toBe(e);
    });
});

describe("asset url identity", () => {
    it("round-trips an id", () => {
        expect(assetIdFromUrl(assetUrl(ASSET))).toBe(ASSET);
    });

    it("reads an id through a query string or a fragment", () => {
        expect(assetIdFromUrl(`${assetUrl(ASSET)}?v=2`)).toBe(ASSET);
        expect(assetIdFromUrl(`https://galleo.app${assetUrl(ASSET)}#x`)).toBe(ASSET);
    });

    it("rejects anything that is not one of ours", () => {
        expect(assetIdFromUrl("https://cdn.example/a.jpg")).toBeNull();
        expect(assetIdFromUrl("/api/media/asset/not-a-uuid")).toBeNull();
        expect(assetIdFromUrl(undefined)).toBeNull();
    });
});

describe("isEmbedVideoUrl", () => {
    it("knows a platform page from a media file", () => {
        for (const u of [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            "https://vimeo.com/76979871",
            "https://vimeo.com/video/76979871",
        ])
            expect(isEmbedVideoUrl(u)).toBe(true);
        for (const u of ["https://cdn.example/clip.mp4", assetUrl(ASSET), "https://vimeo.com/help"])
            expect(isEmbedVideoUrl(u)).toBe(false);
    });
});
