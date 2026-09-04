import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { mediaRefs } from "@model/artifact";
import { resolveElement, resolveImages } from "@services/core/ai/images";
import { searchStock } from "@services/core/media";

// the stock half, whose only observable is the query it asks a provider for
vi.mock("@services/core/media", () => ({
    stockReady: () => ({ unsplash: true, pexels: false, pixabay: false, openverse: false }),
    searchStock: vi.fn(),
}));

// The model writes a phrase where a url belongs, and these two entry points are the only thing that
// turns it into a picture. They are handed one section or one element, never a whole draft, so they
// are also the reason the media walk has to understand those levels.

// `source: "ai"` with a generator short-circuits stock search, so nothing here touches the network
const opts = {
    source: "ai" as const,
    generate: async (prompt: string, orientation: string): Promise<string> =>
        `https://cdn.test/${orientation}/${prompt.replace(/\s+/g, "_")}`,
};

const image = (src: string, aspect = 1.4): ElementInstance => ({
    type: "image",
    data: { src, aspect },
});

const section = (): Section => ({
    id: "s1",
    background: { kind: "image", image: "a dark city skyline", scrim: 0.5 },
    root: {
        type: "container",
        data: {
            direction: "row",
            children: [
                { type: "text", data: { text: "Capital flows", style: "h2" } },
                image("a quiet design studio desk"),
            ],
        },
    },
});

const srcs = (v: unknown): string[] => mediaRefs(v).sort();

describe("resolveImages", () => {
    it("resolves an image nested in the section tree, not just the background", async () => {
        expect(srcs(await resolveImages(section(), opts))).toEqual([
            "https://cdn.test/landscape/a_dark_city_skyline",
            "https://cdn.test/landscape/a_quiet_design_studio_desk",
        ]);
    });

    it("searches at the orientation the element asks for", async () => {
        const portrait: Section = { id: "s", root: image("a confident founder", 0.8) };
        expect(srcs(await resolveImages(portrait, opts))).toEqual([
            "https://cdn.test/portrait/a_confident_founder",
        ]);
    });

    it("leaves a real url alone and returns the same object", async () => {
        const s: Section = { id: "s", root: image("https://cdn.example/a.jpg") };
        expect(await resolveImages(s, opts)).toBe(s);
    });
});

// A face slot is the one place the tree knows a picture is a person, and both halves of the
// resolver have to be told: an avatar renders as a fixed square masked to a circle, so a landscape
// scene dropped into one is a crop of somebody's shoulder.
describe("a face slot", () => {
    const person = (src: string): ElementInstance => ({ type: "avatar", data: { size: 88, src } });
    const team = (...kids: ElementInstance[]): Section => ({
        id: "team",
        root: { type: "profile", data: { children: kids } },
    });

    it("resolves square, whatever the default aspect would have said", async () => {
        const out = srcs(await resolveImages(team(person("a smiling founder")), opts));
        expect(out[0]).toMatch(/^https:\/\/cdn\.test\/square\//);
    });

    it("asks the generator for a portrait rather than for the phrase alone", async () => {
        const out = srcs(await resolveImages(team(person("a smiling founder")), opts));
        expect(out[0]).toContain("Head-and-shoulders_portrait");
        expect(out[0]).toContain("a_smiling_founder");
    });

    it("frames the person as fictional, so a phrase that slipped a name through asks for nobody real", async () => {
        const out = srcs(await resolveImages(team(person("a founder")), opts));
        expect(out[0]).toContain("fictional_person");
    });

    it("treats a circle-cropped media photo as the same person: the merged avatar", async () => {
        const merged: ElementInstance = {
            type: "media",
            data: { kind: "photo", shape: "circle", size: 88, src: "a smiling founder" },
        };
        const out = srcs(await resolveImages(team(merged), opts));
        expect(out[0]).toMatch(/^https:\/\/cdn\.test\/square\//);
        expect(out[0]).toContain("Head-and-shoulders_portrait");
    });

    it("leaves an uncropped media photo alone, same as a plain image", async () => {
        const framed: ElementInstance = {
            type: "media",
            data: { kind: "photo", src: "a founder at her desk", aspect: 1.4 },
        };
        const out = srcs(await resolveImages({ id: "s", root: framed }, opts));
        expect(out).toEqual(["https://cdn.test/landscape/a_founder_at_her_desk"]);
    });

    it("leaves a plain image alone: a person in one is the writer's phrase to get right", async () => {
        const s: Section = { id: "s", root: image("a founder at her desk") };
        const out = srcs(await resolveImages(s, opts));
        expect(out).toEqual(["https://cdn.test/landscape/a_founder_at_her_desk"]);
    });
});

describe("the stock query a face slot asks for", () => {
    beforeEach(() => {
        vi.mocked(searchStock).mockReset();
        vi.mocked(searchStock).mockResolvedValue({
            items: [
                {
                    id: "1",
                    source: "stock",
                    url: "https://cdn.stock/face.jpg",
                    thumbUrl: "https://cdn.stock/face-thumb.jpg",
                    width: 800,
                    height: 800,
                },
            ],
            hasMore: false,
        });
    });

    const queries = (): string[] => vi.mocked(searchStock).mock.calls.map((c) => c[1]);

    it("carries the shape of the picture as a keyword, since stock search matches keywords", async () => {
        const face: Section = {
            id: "s",
            root: { type: "avatar", data: { size: 72, src: "a smiling founder" } },
        };
        await resolveImages(face, { source: "stock" });
        expect(queries()[0]).toBe("smiling founder portrait headshot");
    });

    it("keeps the person in the short fallback query, which is why the shape terms trail", async () => {
        const face: Section = {
            id: "s",
            root: { type: "avatar", data: { size: 72, src: "a smiling founder" } },
        };
        await resolveImages(face, { source: "stock" });
        // the two phrasings race; the trimmed one still has to be about somebody
        expect(queries().every((q) => q.includes("smiling"))).toBe(true);
    });

    it("searches at square, so the crop into a circle lands on the face", async () => {
        const face: Section = {
            id: "s",
            root: { type: "avatar", data: { size: 72, src: "a smiling founder" } },
        };
        await resolveImages(face, { source: "stock" });
        expect(vi.mocked(searchStock).mock.calls[0]![3]).toBe("square");
    });

    it("leaves a plain image's query as the writer wrote it", async () => {
        await resolveImages({ id: "s", root: image("a wind farm at dusk") }, { source: "stock" });
        expect(queries().every((q) => !q.includes("portrait"))).toBe(true);
    });
});

describe("resolveElement", () => {
    it("resolves a bare element, and one nested in a container", async () => {
        expect(srcs(await resolveElement(image("a wind farm at dusk"), opts))).toEqual([
            "https://cdn.test/landscape/a_wind_farm_at_dusk",
        ]);
        const wrapped: ElementInstance = {
            type: "container",
            data: { children: [image("a wind farm at dusk")] },
        };
        expect(srcs(await resolveElement(wrapped, opts))).toEqual([
            "https://cdn.test/landscape/a_wind_farm_at_dusk",
        ]);
    });
});
