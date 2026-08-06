import { describe, expect, it } from "vitest";
import { COST_MULTIPLIERS, costMultiplier, DEFAULT_MODELS, MODELS } from "../models";

describe("costMultiplier", () => {
    it("prices the default model at exactly the baseline, so an untouched run bills as before", () => {
        expect(costMultiplier(DEFAULT_MODELS.outline)).toBe(1);
    });

    it("prices every registered model", () => {
        for (const m of MODELS) expect(COST_MULTIPLIERS[m.id], m.id).toBeGreaterThan(0);
    });

    it("treats an unknown id as the baseline rather than free", () => {
        expect(costMultiplier("made:up")).toBe(1);
    });

    it("orders the Anthropic ladder the way their price list does", () => {
        const m = COST_MULTIPLIERS;
        expect(m["anthropic:claude-haiku-4-5"]!).toBeLessThan(m["anthropic:claude-sonnet-5"]!);
        expect(m["anthropic:claude-sonnet-5"]!).toBeLessThan(m["anthropic:claude-opus-5"]!);
        expect(m["anthropic:claude-opus-5"]!).toBeLessThan(m["anthropic:claude-fable-5"]!);
    });

    it("puts the cheap tiers below the baseline and the frontier tiers above it", () => {
        expect(COST_MULTIPLIERS["openai:gpt-5.4-nano"]!).toBeLessThan(1);
        expect(COST_MULTIPLIERS["google:gemini-3.1-flash-lite-preview"]!).toBeLessThan(1);
        expect(COST_MULTIPLIERS["openai:gpt-5.5"]!).toBeGreaterThan(1);
        expect(COST_MULTIPLIERS["anthropic:claude-fable-5"]!).toBeGreaterThan(4);
    });

    it("carries a published price for every model, so none is silently free", () => {
        for (const m of MODELS) {
            expect(m.usd[0], `${m.id} input`).toBeGreaterThan(0);
            expect(m.usd[1], `${m.id} output`).toBeGreaterThan(0);
        }
    });
});
