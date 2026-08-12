import { describe, expect, it } from "vitest";
import { COST_UNITS, CREDIT_USD, creditsForUsd } from "@model/credits";
import { owed } from "../spend";

const FLASH = "google:gemini-3.5-flash";
const use = (input: number, output: number) => [{ modelId: FLASH, input, output }];

describe("what a run owes", () => {
    it("bills nothing when it burned nothing and produced nothing", () => {
        expect(owed([], {})).toBe(0);
    });

    it("still bills nothing when an asset count came back zero", () => {
        expect(owed([], { image: 0 })).toBe(0);
    });

    it("prices tokens at the provider's list rate", () => {
        const usd = (1e6 / 1e6) * 1.5 + (1e6 / 1e6) * 9;
        expect(owed(use(1e6, 1e6), {})).toBe(creditsForUsd(usd));
    });

    it("charges a real but tiny call the one-credit floor rather than zero", () => {
        expect(owed(use(10, 10), {})).toBe(1);
    });

    it("adds flat-priced assets to the token bill", () => {
        const tokens = owed(use(1e6, 1e6), {});
        expect(owed(use(1e6, 1e6), { image: 3 })).toBe(tokens + 3 * COST_UNITS.image);
    });

    it("bills assets on their own when no model was called", () => {
        expect(owed([], { video: 1 })).toBe(COST_UNITS.video);
    });

    it("ignores models it cannot price rather than guessing", () => {
        expect(owed([{ modelId: "made-up:model", input: 1e9, output: 1e9 }], {})).toBe(0);
    });

    it("adds spend that was priced at the call site, like embeddings", () => {
        expect(owed([], {}, CREDIT_USD * 4)).toBe(4);
    });

    it("bills call-site spend and token spend as one sum, not two floors", () => {
        const tiny = CREDIT_USD / 4;
        expect(owed(use(10, 10), {}, tiny)).toBe(1);
    });

    it("keeps one credit worth the same as the anchor", () => {
        expect(creditsForUsd(CREDIT_USD)).toBe(1);
    });
});
