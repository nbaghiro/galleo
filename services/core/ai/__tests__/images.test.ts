import { describe, expect, it } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { mediaRefs } from "@model/artifact";
import { resolveElement, resolveImages } from "@services/core/ai/images";

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
