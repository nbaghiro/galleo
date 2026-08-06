import { describe, expect, it } from "vitest";
import { creditsForUsd } from "@model/credits";
import { recordTokens, totalTokens, usdOf, withMeter } from "../meter";

const FLASH = "google:gemini-3.5-flash"; // $1.50 in / $9.00 out per 1M

describe("the token meter", () => {
    it("collects what was recorded inside its scope", async () => {
        const uses = await withMeter(async (m) => {
            recordTokens(FLASH, 1000, 500);
            recordTokens(FLASH, 200, 100);
            return m.uses;
        });
        expect(uses).toHaveLength(2);
        expect(totalTokens(uses)).toEqual({ input: 1200, output: 600 });
    });

    it("keeps concurrent turns apart, so one run never bills another's tokens", async () => {
        const [a, b] = await Promise.all([
            withMeter(async (m) => {
                await new Promise((r) => setTimeout(r, 5));
                recordTokens(FLASH, 10, 10);
                return m.uses.length;
            }),
            withMeter(async (m) => {
                recordTokens(FLASH, 20, 20);
                recordTokens(FLASH, 30, 30);
                return m.uses.length;
            }),
        ]);
        expect(a).toBe(1);
        expect(b).toBe(2);
    });

    it("drops a record made outside any scope rather than misbilling it", () => {
        expect(() => recordTokens(FLASH, 100, 100)).not.toThrow();
    });

    it("ignores an empty call", async () => {
        const uses = await withMeter(async (m) => {
            recordTokens(FLASH, 0, 0);
            return m.uses;
        });
        expect(uses).toHaveLength(0);
    });
});

describe("usdOf", () => {
    it("prices input and output separately", () => {
        expect(usdOf([{ modelId: FLASH, input: 1e6, output: 0 }])).toBeCloseTo(1.5, 6);
        expect(usdOf([{ modelId: FLASH, input: 0, output: 1e6 }])).toBeCloseTo(9, 6);
    });

    it("sums across models, so a turn that switches mid-way still totals", () => {
        const usd = usdOf([
            { modelId: FLASH, input: 1e6, output: 0 },
            { modelId: "anthropic:claude-opus-5", input: 1e6, output: 0 }, // $5 in
        ]);
        expect(usd).toBeCloseTo(6.5, 6);
    });

    it("prices an unknown model at zero rather than guessing", () => {
        expect(usdOf([{ modelId: "made:up", input: 1e9, output: 1e9 }])).toBe(0);
    });
});

describe("creditsForUsd", () => {
    it("reproduces today's price for a default 12-section deck", () => {
        // measured: outline $0.0092 + 12 sections × $0.0312
        expect(creditsForUsd(0.0092 + 12 * 0.0312)).toBe(27);
    });

    it("never bills a real call as free", () => {
        expect(creditsForUsd(0.000001)).toBe(1);
    });
});
