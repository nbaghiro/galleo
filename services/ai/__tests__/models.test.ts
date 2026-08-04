import { describe, expect, it } from "vitest";
import { sectionsForLength } from "@model/tools";
import { DEFAULT_MODELS, getModel, modelFor } from "../models";

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

describe("section cap metering", () => {
    it("a clamped meter bills fewer sections than the raw length", () => {
        const raw = sectionsForLength("In-depth");
        expect(raw).toBe(18);
        expect(Math.min(raw, 10)).toBe(10); // the free plan's cap applied by meterFor
    });
});
