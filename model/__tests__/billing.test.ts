import { describe, expect, it } from "vitest";
import { CREDIT_USD } from "@model/credits";
import type { AddOn, PlanId } from "@model/billing";
import {
    CREDITS_PER_GENERATION,
    ADD_ONS,
    ADD_ON_IDS,
    addOnFor,
    PLANS,
    PLAN_ORDER,
    can,
    canTopUp,
    canUpgradeFrom,
    creditLimitFor,
    featureStatus,
    featuresFor,
    sellsSeats,
    limit,
    limitsFor,
    planFor,
    resolveFeatures,
    visiblePlans,
    withinLimit,
} from "@model/billing";

describe("planFor", () => {
    it("falls back to Free for null / unknown ids", () => {
        expect(planFor(null)).toBe(PLANS.free);
        expect(planFor("bogus")).toBe(PLANS.free);
    });
    it("returns the plan for a known id", () => {
        expect(planFor("pro")).toBe(PLANS.pro);
    });
});

describe("limitsFor", () => {
    it("projects the legacy flat limits for Free", () => {
        const free = limitsFor("free");
        expect(free.maxArtifacts).toBe(10);
        expect(free.exportFormats).toEqual(["png", "pdf"]);
        expect(free.customThemes).toBe(false);
    });
});

describe("sellsSeats", () => {
    it("is true only for the plan that holds a team", () => {
        expect(sellsSeats("free")).toBe(false);
        expect(sellsSeats(null)).toBe(false);
        expect(sellsSeats("pro")).toBe(false);
        expect(sellsSeats("premium")).toBe(true);
    });
});

describe("catalog constants", () => {
    it("CREDITS_PER_GENERATION matches the metered generate cost", () => {
        expect(CREDITS_PER_GENERATION).toBe(42);
    });
    it("visiblePlans lists the three tiers in order", () => {
        const plans = visiblePlans();
        expect(plans).toHaveLength(3);
        expect(plans.map((p) => p.id)).toEqual(["free", "pro", "premium"]);
    });
});

describe("resolveFeatures · launch status gates plan grants", () => {
    it("keeps a premium plan's planned features OFF", () => {
        const premium = resolveFeatures("premium");
        expect(premium.sso).toBe(false);
        expect(premium.customDomains).toBe(0);
    });
    it("won't let an override enable a planned feature", () => {
        expect(resolveFeatures("free", { sso: true }).sso).toBe(false);
    });
    it("grants live analytics by plan and by override", () => {
        expect(resolveFeatures("premium").analytics).toBe(true);
        expect(resolveFeatures("pro").analytics).toBe(false);
        expect(resolveFeatures("free", { analytics: true }).analytics).toBe(true);
    });
    it("lets an override widen a live feature", () => {
        expect(resolveFeatures("free", { removeBranding: true }).removeBranding).toBe(true);
    });
    it("resolves the free baseline", () => {
        const free = resolveFeatures("free");
        expect(free.maxArtifacts).toBe(10);
        expect(free.exportFormats).toEqual(["png", "pdf"]);
    });
});

describe("enforcement accessors", () => {
    const free = resolveFeatures("free");
    const pro = resolveFeatures("pro");
    it("withinLimit treats -1 as unlimited", () => {
        expect(withinLimit(pro, "maxArtifacts", 999_999)).toBe(true);
    });
    it("withinLimit is strict against a finite cap", () => {
        expect(withinLimit(free, "maxArtifacts", 9)).toBe(true);
        expect(withinLimit(free, "maxArtifacts", 10)).toBe(false);
    });
    it("can / limit read the resolved set", () => {
        expect(can(free, "removeBranding")).toBe(false);
        expect(can(resolveFeatures("free", { removeBranding: true }), "removeBranding")).toBe(true);
        expect(limit(free, "maxArtifacts")).toBe(10);
    });
    it("featureStatus reports each feature's launch status", () => {
        expect(featureStatus("removeBranding")).toBe("live");
        expect(featureStatus("maxSectionsPerGeneration")).toBe("beta");
        expect(featureStatus("analytics")).toBe("live");
        expect(featureStatus("sso")).toBe("planned");
    });
});

describe("creditLimitFor", () => {
    const ws = (plan: string | null, seats: number, creditBlocks = 0) => ({
        plan,
        seats,
        creditBlocks,
    });

    it("is the plan's own allowance when nothing is bought on top", () => {
        expect(creditLimitFor(ws("free", 1))).toBe(PLANS.free.ai.includedCredits);
        expect(creditLimitFor(ws("pro", 1))).toBe(PLANS.pro.ai.includedCredits);
        expect(creditLimitFor(ws("premium", PLANS.premium.billing.includedSeats))).toBe(
            PLANS.premium.ai.includedCredits,
        );
    });

    // the included seats are already paid for by the base price, so they add nothing on top
    it("only counts seats beyond the plan's included ones", () => {
        const incl = PLANS.premium.billing.includedSeats;
        expect(creditLimitFor(ws("premium", incl + 2))).toBe(
            PLANS.premium.ai.includedCredits + 2 * ADD_ONS.seat.credits,
        );
        expect(creditLimitFor(ws("premium", incl - 1))).toBe(PLANS.premium.ai.includedCredits);
    });

    it("adds a credit block's credits per block", () => {
        expect(creditLimitFor(ws("pro", 1, 3))).toBe(
            PLANS.pro.ai.includedCredits + 3 * ADD_ONS.credits.credits,
        );
    });

    it("ignores negative quantities rather than subtracting", () => {
        expect(creditLimitFor(ws("pro", 0, -5))).toBe(PLANS.pro.ai.includedCredits);
    });

    it("defaults unknown/null plans to free", () => {
        expect(creditLimitFor(ws(null, 4))).toBe(PLANS.free.ai.includedCredits);
    });

    it("applies an includedCredits override to the plan's own part only", () => {
        expect(
            creditLimitFor({
                plan: "premium",
                seats: PLANS.premium.billing.includedSeats + 1,
                creditBlocks: 0,
                featureOverrides: { includedCredits: 100 },
            }),
        ).toBe(100 + ADD_ONS.seat.credits);
    });
});

describe("featuresFor", () => {
    it("resolves plan grants with overrides folded in", () => {
        expect(featuresFor({ plan: "free" }).customThemes).toBe(false);
        expect(
            featuresFor({ plan: "free", featureOverrides: { customThemes: true } }).customThemes,
        ).toBe(true);
    });
});

describe("credit remedies", () => {
    it("offers an upgrade from every plan but the top one", () => {
        expect(canUpgradeFrom("free")).toBe(true);
        expect(canUpgradeFrom("pro")).toBe(true);
        expect(canUpgradeFrom("premium")).toBe(false);
    });

    it("allows packs only on the paid plans, so the top plan still has a remedy", () => {
        expect(canTopUp("free")).toBe(false);
        expect(canTopUp("pro")).toBe(true);
        expect(canTopUp("premium")).toBe(true);
    });

    it("leaves no plan without a remedy when it runs dry", () => {
        for (const id of PLAN_ORDER) expect(canUpgradeFrom(id) || canTopUp(id)).toBe(true);
    });
});

describe("add-on pricing", () => {
    // per-credit rate of the plan itself, which an add-on must never undercut
    const planRate = (id: PlanId): number =>
        PLANS[id].billing.priceMonthly / PLANS[id].ai.includedCredits;

    // a bare credit must never be cheaper than one that arrives with a colleague attached
    it("prices a credit block above a seat's per-credit rate", () => {
        const rate = (a: AddOn): number => a.priceUsd / a.credits;
        expect(rate(ADD_ONS.credits)).toBeGreaterThan(rate(ADD_ONS.seat));
    });

    it("keeps every add-on above the cheapest plan's own per-credit rate", () => {
        const cheapest = Math.min(
            ...PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0).map(planRate),
        );
        for (const id of ADD_ON_IDS)
            expect(ADD_ONS[id].priceUsd / ADD_ONS[id].credits).toBeGreaterThan(cheapest);
    });

    it("sells every add-on above what its credits cost us", () => {
        for (const id of ADD_ON_IDS)
            expect(ADD_ONS[id].priceUsd).toBeGreaterThan(ADD_ONS[id].credits * CREDIT_USD);
    });

    it("gives a seat its own credits, and a credit block no seat", () => {
        expect(ADD_ONS.seat.seats).toBe(1);
        expect(ADD_ONS.seat.credits).toBeGreaterThan(0);
        expect(ADD_ONS.credits.seats).toBe(0);
    });

    it("resolves an add-on by id and rejects anything else", () => {
        expect(addOnFor("seat")).toBe(ADD_ONS.seat);
        expect(addOnFor("pack-500")).toBeNull();
        expect(addOnFor(null)).toBeNull();
    });
});

describe("plan credit allowances", () => {
    // the failure this guards: an allowance worth more in provider spend than the plan is paid
    it("keeps a fully-used plan well under what it charges", () => {
        for (const id of PLAN_ORDER) {
            const p = PLANS[id];
            if (!p.billing.priceMonthly) continue;
            const worstCase = p.ai.includedCredits * CREDIT_USD;
            expect(worstCase).toBeLessThan(p.billing.priceMonthly * 0.6);
        }
    });

    it("does not give a dearer plan thinner margin than a cheaper one", () => {
        const share = (id: PlanId): number =>
            (PLANS[id].ai.includedCredits * CREDIT_USD) / PLANS[id].billing.priceMonthly;
        expect(share("premium")).toBeLessThanOrEqual(share("pro"));
    });

    it("keeps a seat add-on profitable on its own", () => {
        expect(ADD_ONS.seat.credits * CREDIT_USD).toBeLessThan(ADD_ONS.seat.priceUsd * 0.6);
    });

    // only Premium holds a team, so a seat add-on has exactly one plan to attach to
    it("sells seats on exactly one plan", () => {
        expect(PLAN_ORDER.filter(sellsSeats)).toEqual(["premium"]);
    });
});
