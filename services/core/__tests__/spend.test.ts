import { describe, expect, it } from "vitest";
import type { UnitPrices } from "@model/credits";
import { CREDIT_USD, creditsForUsd, usdOfUsage } from "@model/credits";
import { owed } from "@services/core/spend";

const FLASH = "google:gemini-3.5-flash";
// the default models' unit prices as of 2026-08-30, fixed here so the figures below stay readable
const P: UnitPrices = {
    plan: 0.0190455,
    section: 0.0181605,
    text: 0.00735,
    theme: 0.01875,
    reply: 0.0192,
    image: 0.071,
    video: 1.42,
    speech: 0.1,
    music: 0.15,
};
const use = (input: number, output: number) => [{ modelId: FLASH, input, output }];

describe("what a run owes", () => {
    it("bills nothing when it burned nothing and produced nothing", () => {
        expect(owed([], {}, 0, P)).toBe(0);
    });

    it("still bills nothing when an asset count came back zero", () => {
        expect(owed([], { image: 0 }, 0, P)).toBe(0);
    });

    it("prices tokens at the provider's list rate", () => {
        const usd = (1e6 / 1e6) * 1.5 + (1e6 / 1e6) * 9;
        expect(owed(use(1e6, 1e6), {}, 0, P)).toBe(creditsForUsd(usd));
    });

    it("charges a real but tiny call the one-credit floor rather than zero", () => {
        expect(owed(use(10, 10), {}, 0, P)).toBe(1);
    });

    it("adds produced assets to the token bill, converting the whole sum once", () => {
        const usd = 1.5 + 9 + 3 * P.image!;
        expect(owed(use(1e6, 1e6), { image: 3 }, 0, P)).toBe(creditsForUsd(usd));
    });

    it("bills assets on their own when no model was called", () => {
        expect(owed([], { video: 1 }, 0, P)).toBe(creditsForUsd(P.video!));
        expect(owed([], { image: 3 }, 0, P)).toBe(85); // 3 x $0.071 of pictures, converted once
    });

    // the point of pricing the settle: the model that served an asset is what its credits reflect
    it("prices a produced asset by the media model that served it", () => {
        const lite = owed([], { image: 4 }, 0, { ...P, image: 0.0336 });
        const pro = owed([], { image: 4 }, 0, { ...P, image: 0.134 });
        const base = owed([], { image: 4 }, 0, P);
        expect(lite).toBeLessThan(base);
        expect(pro).toBeGreaterThan(base);
        expect(lite).toBe(creditsForUsd(4 * 0.0336));
    });

    it("bills nothing for an asset the caller supplied no price for", () => {
        expect(owed([], { image: 2 }, 0, {})).toBe(0);
    });

    it("charges an estimate and its settle the same for identical units", () => {
        const usage = { plan: 1, section: 12 };
        expect(owed([], usage, 0, P)).toBe(creditsForUsd(usdOfUsage(usage, P)));
    });

    it("ignores models it cannot price rather than guessing", () => {
        expect(owed([{ modelId: "made-up:model", input: 1e9, output: 1e9 }], {}, 0, P)).toBe(0);
    });

    // cached input is a tenth of standard on this model; billing it at the full rate would charge
    // the customer for a discount the provider gave us
    it("charges cached input at the cached rate", () => {
        const fresh = owed([{ modelId: FLASH, input: 1e6, output: 0 }], {}, 0, P);
        const cached = owed([{ modelId: FLASH, input: 1e6, output: 0, cached: 1e6 }], {}, 0, P);
        expect(cached).toBeLessThan(fresh);
        expect(cached).toBe(creditsForUsd(0.15));
        expect(fresh).toBe(creditsForUsd(1.5));
    });

    it("prices a model with no cached rate exactly as it did before", () => {
        const opus = "anthropic:claude-opus-5";
        const plain = owed([{ modelId: opus, input: 1e6, output: 0 }], {}, 0, P);
        expect(owed([{ modelId: opus, input: 1e6, output: 0, cached: 1e6 }], {}, 0, P)).toBe(plain);
    });

    it("adds spend that was priced at the call site, like embeddings", () => {
        expect(owed([], {}, CREDIT_USD * 4, P)).toBe(4);
    });

    it("bills call-site spend and token spend as one sum, not two floors", () => {
        const tiny = CREDIT_USD / 4;
        expect(owed(use(10, 10), {}, tiny, P)).toBe(1);
    });

    it("keeps one credit worth the same as the anchor", () => {
        expect(creditsForUsd(CREDIT_USD)).toBe(1);
    });
});
