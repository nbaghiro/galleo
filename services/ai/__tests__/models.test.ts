import { describe, expect, it } from "vitest";
import { sectionsForLength } from "@model/tools";
import { DEFAULT_MODELS, modelFor } from "../models";

describe("modelFor", () => {
    it("basic tier steps edit down to flash-class", () => {
        expect(modelFor("edit", "basic")).toBe("google:gemini-2.5-flash");
        expect(DEFAULT_MODELS.edit).toBe("google:gemini-2.5-pro");
    });

    it("basic tier keeps already-flash tasks on the tuned default", () => {
        expect(modelFor("generate", "basic")).toBe(DEFAULT_MODELS.generate);
        expect(modelFor("chat", "basic")).toBe(DEFAULT_MODELS.chat);
    });

    it("advanced and premium get the tuned defaults", () => {
        expect(modelFor("edit", "advanced")).toBe(DEFAULT_MODELS.edit);
        expect(modelFor("edit", "premium")).toBe(DEFAULT_MODELS.edit);
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
