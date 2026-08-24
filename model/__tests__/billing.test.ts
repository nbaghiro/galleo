import { describe, expect, it } from "vitest";
import { CREDIT_USD } from "@model/credits";
import type { PlanId } from "@model/billing";
import {
    ADD_ONS,
    CREDITS_PER_GENERATION,
    CREDIT_PACKS,
    PLANS,
    PLAN_ORDER,
    ROLLOVER_CAP_MONTHS,
    can,
    canTopUp,
    canUpgradeFrom,
    clipGrant,
    featureStatus,
    featuresFor,
    limit,
    limitsFor,
    monthlyGrantFor,
    packFor,
    planFor,
    rolloverCapFor,
    sellsSeats,
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

describe("monthlyGrantFor", () => {
    const ws = (plan: string | null, seats: number) => ({ plan, seats });

    it("is the plan's own allowance when nothing is bought on top", () => {
        expect(monthlyGrantFor(ws("free", 1))).toBe(PLANS.free.ai.includedCredits);
        expect(monthlyGrantFor(ws("pro", 1))).toBe(PLANS.pro.ai.includedCredits);
        expect(monthlyGrantFor(ws("premium", PLANS.premium.billing.includedSeats))).toBe(
            PLANS.premium.ai.includedCredits,
        );
    });

    // the included seats are already paid for by the base price, so they add nothing on top
    it("only counts seats beyond the plan's included ones", () => {
        const incl = PLANS.premium.billing.includedSeats;
        expect(monthlyGrantFor(ws("premium", incl + 2))).toBe(
            PLANS.premium.ai.includedCredits + 2 * ADD_ONS.seat.credits,
        );
        expect(monthlyGrantFor(ws("premium", incl - 1))).toBe(PLANS.premium.ai.includedCredits);
    });

    it("ignores a seat count below the plan's own rather than subtracting", () => {
        expect(monthlyGrantFor(ws("pro", 0))).toBe(PLANS.pro.ai.includedCredits);
    });

    it("defaults unknown/null plans to free", () => {
        expect(monthlyGrantFor(ws(null, 4))).toBe(PLANS.free.ai.includedCredits);
    });

    it("applies an includedCredits override to the plan's own part only", () => {
        expect(
            monthlyGrantFor({
                plan: "premium",
                seats: PLANS.premium.billing.includedSeats + 1,
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

describe("add-on and pack pricing", () => {
    // per-credit rate of the plan itself, which neither may undercut
    const planRate = (id: PlanId): number =>
        PLANS[id].billing.priceMonthly / PLANS[id].ai.includedCredits;
    const cheapest = (): number =>
        Math.min(...PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0).map(planRate));

    it("sells the seat add-on above what its credits cost us", () => {
        expect(ADD_ONS.seat.priceUsd).toBeGreaterThan(ADD_ONS.seat.credits * CREDIT_USD);
    });

    it("gives a seat its own credits", () => {
        expect(ADD_ONS.seat.seats).toBe(1);
        expect(ADD_ONS.seat.credits).toBeGreaterThan(0);
    });

    it("sells every pack above what its credits cost us", () => {
        for (const pack of CREDIT_PACKS)
            expect(pack.priceUsd).toBeGreaterThan(pack.credits * CREDIT_USD);
    });

    // buying credits outright must never beat subscribing for them
    it("prices every pack above the cheapest plan's own per-credit rate", () => {
        for (const pack of CREDIT_PACKS)
            expect(pack.priceUsd / pack.credits).toBeGreaterThan(cheapest());
    });

    it("gives the larger pack the volume discount", () => {
        const rate = (p: (typeof CREDIT_PACKS)[number]): number => p.priceUsd / p.credits;
        const sorted = [...CREDIT_PACKS].sort((a, b) => a.credits - b.credits);
        for (let i = 1; i < sorted.length; i++)
            expect(rate(sorted[i]!)).toBeLessThan(rate(sorted[i - 1]!));
    });

    it("resolves a pack by id and rejects anything else", () => {
        expect(packFor("pack-500")).toBe(CREDIT_PACKS[0]);
        expect(packFor("seat")).toBeNull();
        expect(packFor(null)).toBeNull();
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

describe("the rollover cap", () => {
    const pro = { plan: "pro", seats: 1 };
    const cap = rolloverCapFor(pro); // 1400
    const grant = monthlyGrantFor(pro); // 700

    it("is a whole number of monthly grants", () => {
        expect(ROLLOVER_CAP_MONTHS).toBeGreaterThanOrEqual(1);
        expect(cap).toBe(ROLLOVER_CAP_MONTHS * grant);
    });

    it("scales with the seat add-on's credits", () => {
        const team = { plan: "premium", seats: 5 };
        expect(rolloverCapFor(team)).toBe(ROLLOVER_CAP_MONTHS * monthlyGrantFor(team));
    });

    it("grants in full under the cap", () => {
        expect(clipGrant(grant, 0, 0, cap)).toBe(grant);
        expect(clipGrant(grant, cap - grant, 0, cap)).toBe(grant);
    });

    it("clips to the remainder near the cap", () => {
        expect(clipGrant(grant, cap - 100, 0, cap)).toBe(100);
    });

    it("grants nothing at or beyond the cap", () => {
        expect(clipGrant(grant, cap, 0, cap)).toBe(0);
        expect(clipGrant(grant, cap + 500, 0, cap)).toBe(0);
    });

    it("keeps granting while the granted share is under the cap, pack banked or not", () => {
        // a 2,000-credit pack plus 300 granted: the pack lifts the ceiling, the grant lands
        expect(clipGrant(grant, 300 + 2000, 2000, cap)).toBe(grant);
        // pack partly spent: what is still banked shields, and the granted share is under cap
        expect(clipGrant(grant, 200 + 1000, 1000, cap)).toBe(grant);
        // pack mostly spent: the balance itself is below the purchase and shields entirely
        expect(clipGrant(grant, 200, 2000, cap)).toBe(grant);
    });

    it("clips once the granted share reaches the cap, pack or no pack", () => {
        expect(clipGrant(grant, cap + 2000, 2000, cap)).toBe(0);
        expect(clipGrant(grant, cap + 100, 100, cap)).toBe(0);
        // partial headroom grants exactly the remainder
        expect(clipGrant(grant, cap - 100 + 500, 500, cap)).toBe(100);
    });

    it("handles a zero grant and never returns a negative", () => {
        expect(clipGrant(0, 0, 0, cap)).toBe(0);
        expect(clipGrant(grant, cap * 3, 0, cap)).toBe(0);
    });
});
