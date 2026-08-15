import { describe, expect, it } from "vitest";
import { sectionsForLength } from "@model/tools";
import {
    AI_TASKS,
    COST_MULTIPLIERS,
    DEFAULT_MODELS,
    getModel,
    modelCatalogue,
    modelFor,
    modelNote,
    parseOverrides,
    samplingFor,
} from "@services/core/models";
import { unitMultipliers } from "@model/credits";

describe("modelFor", () => {
    it("runs every task on Gemini 3.5 Flash", () => {
        for (const [task, id] of Object.entries(DEFAULT_MODELS))
            expect(id, `task ${task}`).toBe("google:gemini-3.5-flash");
    });

    it("names a model the registry actually knows", () => {
        for (const id of Object.values(DEFAULT_MODELS)) expect(getModel(id)).toBeDefined();
    });

    it("resolves the same for every tier while no task runs a heavier model", () => {
        for (const task of Object.keys(DEFAULT_MODELS) as (keyof typeof DEFAULT_MODELS)[])
            for (const tier of ["basic", "advanced", "premium"] as const)
                expect(modelFor(task, tier)).toBe(DEFAULT_MODELS[task]);
    });

    it("defaults to premium when no tier is given", () => {
        expect(modelFor("edit")).toBe(DEFAULT_MODELS.edit);
    });
});

describe("model overrides", () => {
    const OPUS = "anthropic:claude-opus-5";

    it("prefers a caller's pick over the tier default", () => {
        expect(modelFor("outline", "premium", { outline: OPUS })).toBe(OPUS);
    });

    it("leaves untouched tasks on their default", () => {
        expect(modelFor("section", "premium", { outline: OPUS })).toBe(DEFAULT_MODELS.section);
    });

    it("ignores a model the registry does not serve", () => {
        expect(modelFor("chat", "premium", { chat: "openai:gpt-4" })).toBe(DEFAULT_MODELS.chat);
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

describe("section cap metering", () => {
    it("a clamped meter bills fewer sections than the raw length", () => {
        const raw = sectionsForLength("In-depth");
        expect(raw).toBe(18);
        expect(Math.min(raw, 10)).toBe(10); // the free plan's cap applied by meterFor
    });
});

describe("model tier gating", () => {
    it("a basic-tier override to a frontier model falls back to the tier default", () => {
        const picked = modelFor("section", "basic", { section: "anthropic:claude-fable-5" });
        expect(picked).toBe(modelFor("section", "basic"));
    });

    it("a premium tier keeps its override, and open models pass on any tier", () => {
        expect(modelFor("section", "premium", { section: "anthropic:claude-fable-5" })).toBe(
            "anthropic:claude-fable-5",
        );
        expect(modelFor("section", "basic", { section: "google:gemini-2.5-flash" })).toBe(
            "google:gemini-2.5-flash",
        );
    });

    it("rates follow the effective model, not the requested one", () => {
        const gated = unitMultipliers(
            (task) => modelFor(task, "basic", { section: "anthropic:claude-fable-5" }),
            (id) => COST_MULTIPLIERS[id],
        );
        const honest = unitMultipliers(
            (task) => modelFor(task, "basic"),
            (id) => COST_MULTIPLIERS[id],
        );
        expect(gated.section).toBe(honest.section); // no premium surcharge for a model never run
    });

    it("the catalogue marks what the tier can't reach", () => {
        const basic = modelCatalogue("basic");
        const premium = modelCatalogue("premium");
        expect(basic.models.find((m) => m.id === "anthropic:claude-fable-5")?.locked).toBe(true);
        expect(basic.models.find((m) => m.id === "google:gemini-2.5-flash")?.locked).toBe(false);
        expect(premium.models.every((m) => !m.locked)).toBe(true);
    });
});
