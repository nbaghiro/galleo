import { describe, expect, it } from "vitest";
import { libraryParams, toLibraryVoices } from "@services/core/voices";

describe("libraryParams", () => {
    it("defaults to trending narration voices, which is what this picker is for", () => {
        const p = libraryParams({});
        expect(p.get("use_cases")).toBe("narrative_story");
        expect(p.get("sort")).toBe("trending");
        expect(p.get("page_size")).toBe("24");
    });

    it("passes each filter through under the provider's own name", () => {
        const p = libraryParams({
            search: "warm",
            gender: "female",
            age: "middle_aged",
            accent: "british",
            language: "en",
            descriptive: "calm",
        });
        expect(p.get("search")).toBe("warm");
        expect(p.get("gender")).toBe("female");
        expect(p.get("age")).toBe("middle_aged");
        expect(p.get("accent")).toBe("british");
        expect(p.get("language")).toBe("en");
        expect(p.get("descriptives")).toBe("calm");
    });

    it("omits a filter that was not set, rather than sending an empty one", () => {
        const p = libraryParams({ search: "warm" });
        expect(p.has("gender")).toBe(false);
        expect(p.has("page")).toBe(false);
    });

    it("lets a use case override the narration default", () => {
        expect(libraryParams({ useCase: "informative_educational" }).get("use_cases")).toBe(
            "informative_educational",
        );
    });

    it("only paginates from page one upward", () => {
        expect(libraryParams({ page: 2 }).get("page")).toBe("2");
        expect(libraryParams({ page: 0 }).has("page")).toBe(false);
        expect(libraryParams({ page: -1 }).has("page")).toBe(false);
    });
});

describe("toLibraryVoices", () => {
    const full = {
        voice_id: "v1",
        public_owner_id: "o1",
        name: "Marlow",
        description: "warm, unhurried",
        preview_url: "https://example.test/marlow.mp3",
        gender: "male",
        age: "middle_aged",
        accent: "british",
        use_case: "narrative_story",
        descriptive: "calm",
    };

    it("carries the ids adoption needs and the labels the picker filters on", () => {
        expect(toLibraryVoices([full])[0]).toEqual({
            externalId: "v1",
            ownerId: "o1",
            name: "Marlow",
            description: "warm, unhurried",
            previewUrl: "https://example.test/marlow.mp3",
            labels: {
                gender: "male",
                age: "middle_aged",
                accent: "british",
                useCase: "narrative_story",
                descriptive: "calm",
            },
        });
    });

    it("drops a row missing anything adoption needs, since it could never be added", () => {
        expect(toLibraryVoices([{ ...full, voice_id: undefined }])).toEqual([]);
        expect(toLibraryVoices([{ ...full, public_owner_id: undefined }])).toEqual([]);
        expect(toLibraryVoices([{ ...full, name: undefined }])).toEqual([]);
    });

    it("omits the label bag entirely when the provider sent no labels", () => {
        const bare = toLibraryVoices([{ voice_id: "v", public_owner_id: "o", name: "Plain" }])[0];
        expect(bare).not.toHaveProperty("labels");
        expect(bare).not.toHaveProperty("previewUrl");
    });
});
