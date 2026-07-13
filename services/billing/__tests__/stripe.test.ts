import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { intervalForPrice, planForPrice, priceIdFor, stripeReady } from "../stripe";

const PRICE_ENV = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_PRO_MONTH",
    "STRIPE_PRICE_PRO_YEAR",
    "STRIPE_PRICE_PREMIUM_MONTH",
    "STRIPE_PRICE_PREMIUM_YEAR",
];

beforeEach(() => {
    for (const k of PRICE_ENV) vi.stubEnv(k, undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("stripeReady", () => {
    it("is true only once the secret + both paid monthly price ids are set", () => {
        vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTH", "price_premium_month");
        expect(stripeReady()).toBe(true);
    });

    it("is false when the secret is missing", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTH", "price_premium_month");
        expect(stripeReady()).toBe(false);
    });

    it("is false when a paid monthly price id is missing", () => {
        vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        // STRIPE_PRICE_PREMIUM_MONTH intentionally absent
        expect(stripeReady()).toBe(false);
    });
});

describe("priceIdFor", () => {
    it("maps each plan+interval to its configured price id", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        vi.stubEnv("STRIPE_PRICE_PRO_YEAR", "price_pro_year");
        vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTH", "price_premium_month");
        vi.stubEnv("STRIPE_PRICE_PREMIUM_YEAR", "price_premium_year");
        expect(priceIdFor("pro", "month")).toBe("price_pro_month");
        expect(priceIdFor("pro", "year")).toBe("price_pro_year");
        expect(priceIdFor("premium", "month")).toBe("price_premium_month");
        expect(priceIdFor("premium", "year")).toBe("price_premium_year");
    });

    it("defaults to the monthly interval when none is given", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        expect(priceIdFor("pro")).toBe("price_pro_month");
    });

    it("falls back to the monthly price when the annual id is missing", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        // STRIPE_PRICE_PRO_YEAR intentionally absent
        expect(priceIdFor("pro", "year")).toBe("price_pro_month");
    });

    it("returns undefined for the free plan (no price)", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        expect(priceIdFor("free", "month")).toBeUndefined();
        expect(priceIdFor("free", "year")).toBeUndefined();
    });

    it("returns undefined when the plan has no configured id at all", () => {
        expect(priceIdFor("pro", "month")).toBeUndefined();
    });
});

describe("planForPrice", () => {
    it("round-trips a configured price id back to its plan", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_YEAR", "price_pro_year");
        vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTH", "price_premium_month");
        expect(planForPrice("price_pro_year")).toBe("pro");
        expect(planForPrice("price_premium_month")).toBe("premium");
    });

    it("returns null for an unknown or empty price id", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        expect(planForPrice("price_unknown")).toBeNull();
        expect(planForPrice(null)).toBeNull();
        expect(planForPrice(undefined)).toBeNull();
    });
});

describe("intervalForPrice", () => {
    it("round-trips a configured price id back to its interval", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        vi.stubEnv("STRIPE_PRICE_PREMIUM_YEAR", "price_premium_year");
        expect(intervalForPrice("price_pro_month")).toBe("month");
        expect(intervalForPrice("price_premium_year")).toBe("year");
    });

    it("returns null for an unknown or empty price id", () => {
        vi.stubEnv("STRIPE_PRICE_PRO_MONTH", "price_pro_month");
        expect(intervalForPrice("price_unknown")).toBeNull();
        expect(intervalForPrice(null)).toBeNull();
        expect(intervalForPrice(undefined)).toBeNull();
    });
});
