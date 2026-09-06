import { describe, expect, it, vi } from "vitest";
import {
    AI_TASKS,
    DEFAULT_MODELS,
    getModel,
    modelCatalogue,
    modelFor,
    modelMap,
    MEDIA_MODELS,
    mediaModelFor,
    mediaUnitPrice,
    unitPricesFor,
    modelNote,
    parseOverrides,
    samplingFor,
} from "@services/core/models";
import { MUSIC_MODEL } from "@services/core/ai/music";
import { NARRATION_MODEL } from "@services/core/ai/speech";

describe("modelFor", () => {
    it("runs every task on Gemini 3.5 Flash", () => {
        for (const [task, id] of Object.entries(DEFAULT_MODELS))
            expect(id, `task ${task}`).toBe("google:gemini-3.5-flash");
    });

    it("names a model the registry actually knows", () => {
        for (const id of Object.values(DEFAULT_MODELS)) expect(getModel(id)).toBeDefined();
    });

    it("resolves the default with nothing pinned", () => {
        expect(modelFor("edit")).toBe(DEFAULT_MODELS.edit);
        expect(modelMap()).toEqual(DEFAULT_MODELS);
    });
});

describe("model overrides", () => {
    const OPUS = "anthropic:claude-opus-5";

    it("prefers a caller's pick over the default", () => {
        expect(modelFor("outline", { outline: OPUS })).toBe(OPUS);
    });

    it("leaves untouched tasks on their default", () => {
        expect(modelFor("section", { outline: OPUS })).toBe(DEFAULT_MODELS.section);
    });

    it("ignores a model the registry does not serve", () => {
        expect(modelFor("chat", { chat: "openai:gpt-4" })).toBe(DEFAULT_MODELS.chat);
    });

    // any plan may pin any model: the run is priced at that model's rate, so the pick moves the
    // bill rather than the margin
    it("honours a frontier pick on every plan", () => {
        expect(modelFor("section", { section: "anthropic:claude-fable-5" })).toBe(
            "anthropic:claude-fable-5",
        );
    });

    it("lists every task the type declares", () => {
        expect([...AI_TASKS].sort()).toEqual(Object.keys(DEFAULT_MODELS).sort());
    });
});

describe("parseOverrides", () => {
    it("keeps known task/model pairs", () => {
        expect(parseOverrides('{"outline":"anthropic:claude-opus-5"}')).toEqual({
            outline: "anthropic:claude-opus-5",
        });
    });

    it("drops unknown tasks and unknown models", () => {
        expect(parseOverrides('{"nope":"anthropic:claude-opus-5","chat":"openai:gpt-4"}')).toEqual(
            {},
        );
    });

    it("returns nothing for absent or malformed headers", () => {
        expect(parseOverrides(undefined)).toEqual({});
        expect(parseOverrides("not json")).toEqual({});
        expect(parseOverrides('"a string"')).toEqual({});
    });
});

describe("samplingFor", () => {
    it("omits temperature on models that reject it", () => {
        expect(samplingFor("anthropic:claude-opus-5", 0.9)).toEqual({});
    });

    it("passes it through everywhere else", () => {
        expect(samplingFor(DEFAULT_MODELS.outline, 0.9)).toEqual({ temperature: 0.9 });
    });

    it("passes it through for an id the registry does not know", () => {
        expect(samplingFor("made:up", 0.5)).toEqual({ temperature: 0.5 });
    });
});

describe("modelNote", () => {
    it("names only the overridden tasks, by label", () => {
        expect(modelNote({ outline: "anthropic:claude-opus-5" }, ["outline", "section"])).toBe(
            "outline → Claude Opus 5",
        );
    });

    it("is empty when nothing was overridden", () => {
        expect(modelNote(undefined, ["outline"])).toBe("");
        expect(modelNote({}, ["outline"])).toBe("");
    });
});

describe("media unit pricing", () => {
    it("prices each unit from the model that will serve it", () => {
        expect(mediaUnitPrice("image")).toBe(0.071);
        expect(mediaUnitPrice("video")).toBe(1.42);
        expect(mediaUnitPrice("speech")).toBe(0.1);
        expect(mediaUnitPrice("music")).toBe(0.15);
    });

    it("charges less for a lite image model and more for a pro one", () => {
        const price = (id: string): number => MEDIA_MODELS.find((m) => m.id === id)!.usdPerUnit;
        expect(price("gemini-3.1-flash-lite-image")).toBeLessThan(price("gemini-3.1-flash-image"));
        expect(price("gemini-3-pro-image")).toBeGreaterThan(price("gemini-3.1-flash-image"));
        expect(price("veo-3.1-lite-generate-preview")).toBeLessThan(
            price("veo-3.1-fast-generate-preview"),
        );
        expect(price("veo-3.1-generate-preview")).toBeGreaterThan(
            price("veo-3.1-fast-generate-preview"),
        );
    });

    it("resolves the unit's live model", () => {
        expect(mediaModelFor("image")).toBe("gemini-3.1-flash-image");
        expect(mediaModelFor("speech")).toBe(NARRATION_MODEL);
        expect(mediaModelFor("music")).toBe(MUSIC_MODEL);
    });

    it("has no price for a unit that is token work rather than media", () => {
        expect(mediaUnitPrice("section")).toBeUndefined();
        expect(mediaUnitPrice("plan")).toBeUndefined();
    });

    it("prices every media model above nothing", () => {
        for (const m of MEDIA_MODELS) expect(m.usdPerUnit, m.id).toBeGreaterThan(0);
    });

    // The media routes once reserved without passing prices, so they billed the base model's rate
    // while running whatever the env pointed at: a 65% under-bill on Veo standard. Prices are
    // required everywhere now, and they follow the env.
    it("follows an env override to a dearer model", () => {
        vi.stubEnv("GEMINI_VIDEO_MODEL", "veo-3.1-generate-preview");
        vi.stubEnv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image");
        try {
            expect(unitPricesFor().video).toBe(4.0);
            expect(unitPricesFor().image).toBe(0.134);
        } finally {
            vi.unstubAllEnvs();
        }
    });
});

describe("unitPricesFor", () => {
    it("prices a section from the measured token profile of the model that writes it", () => {
        const p = unitPricesFor();
        // 8,171 in / 656 out on gemini-3.5-flash at $1.50 / $9.00 per 1M
        expect(p.section).toBeCloseTo((8171 / 1e6) * 1.5 + (656 / 1e6) * 9, 9);
    });

    it("moves every text unit when the caller pins a dearer model", () => {
        const flash = unitPricesFor();
        const fable = unitPricesFor({ section: "anthropic:claude-fable-5" });
        expect(fable.section!).toBeGreaterThan(flash.section! * 5);
        expect(fable.plan).toBe(flash.plan); // only the pinned task moves
    });

    it("leaves media units alone when a text model is pinned", () => {
        const fable = unitPricesFor({ section: "anthropic:claude-fable-5" });
        expect(fable.image).toBe(0.071);
    });

    it("hands the client a price for every model it may pin", () => {
        const cat = modelCatalogue();
        for (const m of cat.models) expect(cat.unitPrices[m.id]?.section, m.id).toBeGreaterThan(0);
        expect(cat.mediaPrices.image).toBe(0.071);
        expect(cat.defaults).toEqual(DEFAULT_MODELS);
    });
});
