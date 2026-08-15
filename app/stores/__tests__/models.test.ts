import { describe, expect, it } from "vitest";
import { pickModel, summarizeSteps } from "@app/stores/models";

const SERVED = ["google:gemini-3.5-flash", "anthropic:claude-opus-5"];
const DEFAULTS = { outline: "google:gemini-3.5-flash", section: "google:gemini-3.5-flash" };

describe("pickModel", () => {
    it("prefers a served override", () => {
        expect(pickModel("outline", { outline: "anthropic:claude-opus-5" }, SERVED, DEFAULTS)).toBe(
            "anthropic:claude-opus-5",
        );
    });

    it("falls back to the default when the registry does not serve the pick", () => {
        expect(pickModel("outline", { outline: "openai:gpt-4" }, SERVED, DEFAULTS)).toBe(
            DEFAULTS.outline,
        );
    });

    it("leaves untouched tasks on their default", () => {
        expect(pickModel("section", { outline: "anthropic:claude-opus-5" }, SERVED, DEFAULTS)).toBe(
            DEFAULTS.section,
        );
    });

    it("is empty for a task with neither an override nor a default", () => {
        expect(pickModel("theme", {}, SERVED, DEFAULTS)).toBe("");
    });
});

describe("summarizeSteps", () => {
    const label = (id: string): string => (id === "anthropic:claude-opus-5" ? "Claude Opus 5" : id);

    it("names each step in the order it ran", () => {
        expect(summarizeSteps({ outline: "anthropic:claude-opus-5", section: "x" }, label)).toBe(
            "outline · Claude Opus 5   section · x",
        );
    });

    it("is empty when nothing was recorded", () => {
        expect(summarizeSteps({}, label)).toBe("");
    });
});
