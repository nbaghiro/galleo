import { describe, expect, it } from "vitest";
import { CREDIT_USD } from "@model/credits";
import type { PlanId } from "@model/billing";
import {
    ADD_ONS,
    CREDITS_PER_GENERATION,
    CREDIT_PRESETS,
    CREDIT_PRICE_USD,
    creditPurchaseUsd,
    isCreditQuantity,
    MAX_CREDIT_PURCHASE,
    MIN_CREDIT_PURCHASE,
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
    planFor,
    rolloverCapFor,
    sellsSeats,
    resolveFeatures,
    upgradeFor,
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
    // the stock-photo default: a plan plus twelve sections, with no AI images unless asked for
    it("CREDITS_PER_GENERATION matches the metered generate cost", () => {
        expect(CREDITS_PER_GENERATION).toBe(95);
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

describe("add-on and bought-credit pricing", () => {
    // per-credit rate of the plan itself, which neither may undercut
    const planRate = (id: PlanId): number =>
        PLANS[id].billing.priceMonthly / PLANS[id].ai.includedCredits;
    const paidPlans = (): PlanId[] => PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0);

    it("sells the seat add-on above what its credits cost us", () => {
        expect(ADD_ONS.seat.priceUsd).toBeGreaterThan(ADD_ONS.seat.credits * CREDIT_USD);
    });

    it("gives a seat its own credits", () => {
        expect(ADD_ONS.seat.seats).toBe(1);
        expect(ADD_ONS.seat.credits).toBeGreaterThan(0);
    });

    it("sells a credit above what it costs us", () => {
        expect(CREDIT_PRICE_USD).toBeGreaterThan(CREDIT_USD);
    });

    /**
     * Buying outright must never beat subscribing, on ANY plan. Checking only the cheapest let the
     * old tiered packs undercut Premium's own per-credit rate, so a workspace paying the most got
     * its marginal credit cheaper than its average one.
     */
    it("prices a bought credit above every visible plan's own per-credit rate", () => {
        for (const id of paidPlans()) expect(CREDIT_PRICE_USD).toBeGreaterThan(planRate(id));
    });

    it("charges one flat rate, with no volume break", () => {
        const rates = CREDIT_PRESETS.map((n) => creditPurchaseUsd(n) / n);
        for (const r of rates) expect(r).toBeCloseTo(CREDIT_PRICE_USD, 10);
    });

    it("accepts a quantity inside the bounds and rejects anything else", () => {
        expect(isCreditQuantity(MIN_CREDIT_PURCHASE)).toBe(true);
        expect(isCreditQuantity(MAX_CREDIT_PURCHASE)).toBe(true);
        expect(isCreditQuantity(MIN_CREDIT_PURCHASE - 1)).toBe(false);
        expect(isCreditQuantity(MAX_CREDIT_PURCHASE + 1)).toBe(false);
        expect(isCreditQuantity(500.5)).toBe(false);
        expect(isCreditQuantity(Number.NaN)).toBe(false);
    });

    it("prices a purchase at the flat rate", () => {
        expect(creditPurchaseUsd(500)).toBe(10);
        expect(creditPurchaseUsd(2000)).toBe(40);
    });

    it("offers presets that are all buyable", () => {
        for (const n of CREDIT_PRESETS) expect(isCreditQuantity(n)).toBe(true);
    });
});

describe("plan credit allowances", () => {
    // The floor the allowances were sized to. Checked against the YEARLY price because that is the
    // thinnest way to pay: clearing it there clears it on every route.
    const FLOOR = 0.8;

    it("leaves a fifth of the yearly price to serve a fully-used plan", () => {
        for (const id of PLAN_ORDER) {
            const p = PLANS[id];
            if (!p.billing.priceAnnualMonthly) continue;
            const worstCase = p.ai.includedCredits * CREDIT_USD;
            expect(worstCase).toBeLessThanOrEqual(p.billing.priceAnnualMonthly * (1 - FLOOR));
        }
    });

    /**
     * This used to demand that a dearer plan never had thinner margin at all. That held only while
     * plans were priced per credit by accident, and near-parity is now the goal: a credit should
     * cost about the same wherever it comes from, so the plans sit within a point of each other and
     * which one is fractionally ahead is noise. The guard is here to catch a plan drifting
     * materially out of line, not to police the last decimal.
     */
    const INVERSION_TOLERANCE = 0.02;

    it("keeps no plan's margin more than two points below a cheaper plan's", () => {
        const margin = (id: PlanId): number =>
            1 - (PLANS[id].ai.includedCredits * CREDIT_USD) / PLANS[id].billing.priceMonthly;
        const paid = PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0);
        for (const dearer of paid)
            for (const cheaper of paid)
                if (PLANS[dearer].billing.priceMonthly > PLANS[cheaper].billing.priceMonthly)
                    expect(margin(dearer)).toBeGreaterThan(margin(cheaper) - INVERSION_TOLERANCE);
    });

    /**
     * The property the allowances were sized for: a credit costs about the same however it is
     * bought. Compared on a monthly basis, seat included, because mixing in the annual prices would
     * measure the yearly discount rather than credit pricing. A future edit to any allowance or
     * price that re-opens a wide spread fails here.
     */
    it("prices a credit within a tight band across every way of buying one", () => {
        const rates = [
            ...PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0).map(
                (id) => PLANS[id].billing.priceMonthly / PLANS[id].ai.includedCredits,
            ),
            ADD_ONS.seat.priceUsd / ADD_ONS.seat.credits,
        ];
        expect(Math.max(...rates) / Math.min(...rates)).toBeLessThanOrEqual(1.2);
    });

    // a seat is a seat: what a bought one carries is what an included one is worth
    it("gives an included seat the same credits as a bought one", () => {
        expect(PLANS.premium.ai.includedCredits).toBe(
            PLANS.premium.billing.includedSeats * ADD_ONS.seat.credits,
        );
    });

    it("keeps a seat add-on profitable on its own", () => {
        expect(ADD_ONS.seat.credits * CREDIT_USD).toBeLessThanOrEqual(
            ADD_ONS.seat.priceUsd * (1 - FLOOR),
        );
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

describe("upgradeFor across feature kinds", () => {
    it("finds the cheapest plan that turns a boolean on", () => {
        expect(upgradeFor("publicLinks", "free")?.id).toBe("pro");
        expect(upgradeFor("analytics", "free")?.id).toBe("premium");
        expect(upgradeFor("analytics", "premium")).toBeNull();
    });

    it("treats a bigger or unlimited number as an upgrade", () => {
        expect(upgradeFor("maxSectionsPerGeneration", "free")?.id).toBe("pro");
        expect(upgradeFor("maxArtifacts", "free")?.id).toBe("pro"); // 10 -> unlimited
        expect(upgradeFor("maxArtifacts", "pro")).toBeNull(); // already unlimited
        expect(upgradeFor("maxWorkspaceVoices", "pro")?.id).toBe("premium"); // 12 -> unlimited
    });

    it("ranks model tiers and export formats", () => {
        expect(upgradeFor("textModelTier", "free")?.id).toBe("pro");
        expect(upgradeFor("textModelTier", "pro")).toBeNull();
        expect(upgradeFor("exportFormats", "free")?.id).toBe("pro");
        expect(upgradeFor("exportFormats", "pro")).toBeNull();
    });

    it("never offers a plan for an unbuilt feature", () => {
        expect(upgradeFor("sso", "free")).toBeNull();
        expect(upgradeFor("customDomains", "free")).toBeNull(); // planned resolves to 0 everywhere
    });
});
