import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS, MODELS, textUnitPrice, unitPricesFor } from "@services/core/models";

// What a unit of text work costs on each model. The old multiplier table priced a model against a
// blended baseline; a unit price is the same question answered in dollars, per unit, with no blend.

describe("textUnitPrice", () => {
    it("prices a unit from the model's own token rates", () => {
        const m = MODELS.find((x) => x.id === DEFAULT_MODELS.outline)!;
        expect(textUnitPrice(m.id, "section")).toBeCloseTo(
            (8171 / 1e6) * m.usd[0] + (656 / 1e6) * m.usd[1],
            9,
        );
    });

    it("prices every model above nothing", () => {
        for (const m of MODELS) expect(textUnitPrice(m.id, "section"), m.id).toBeGreaterThan(0);
    });

    it("has no price for a model it does not serve", () => {
        expect(textUnitPrice("made:up", "section")).toBeUndefined();
    });

    it("has no text price for a media unit", () => {
        expect(textUnitPrice(DEFAULT_MODELS.outline, "image")).toBeUndefined();
    });

    it("orders the cheap models below the default and the dear ones above", () => {
        const base = textUnitPrice(DEFAULT_MODELS.outline, "section")!;
        const cheaper = ["openai:gpt-5.4-nano", "google:gemini-3.1-flash-lite-preview"];
        const dearer = ["openai:gpt-5.5", "anthropic:claude-fable-5"];
        for (const id of cheaper) expect(textUnitPrice(id, "section"), id).toBeLessThan(base);
        for (const id of dearer) expect(textUnitPrice(id, "section"), id).toBeGreaterThan(base);
    });

    it("puts Fable 5 several times above the default, as its token rates do", () => {
        const base = textUnitPrice(DEFAULT_MODELS.outline, "section")!;
        expect(textUnitPrice("anthropic:claude-fable-5", "section")!).toBeGreaterThan(base * 4);
    });
});

describe("unitPricesFor", () => {
    it("covers every unit the product can bill", () => {
        const p = unitPricesFor("premium");
        for (const unit of ["plan", "section", "text", "theme", "reply", "image", "video"] as const)
            expect(p[unit], unit).toBeGreaterThan(0);
    });
});
