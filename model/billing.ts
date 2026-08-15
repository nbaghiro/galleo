import { typicalCost } from "@model/tools";

// a plan/seat downgrade parked at period end via a Stripe subscription schedule
export interface ScheduledChange {
    plan: PlanId;
    interval: Interval;
    seats: number;
    creditBlocks: number;
    at: string; // ISO date the phase flips
}

export type PlanId = "free" | "pro" | "premium";
export type Interval = "month" | "year";
export type ModelTier = "basic" | "advanced" | "premium";
export type ExportFormat = "png" | "pdf" | "print" | "pptx" | "slides";

// The base price buys `includedSeats` seats and `includedCredits` credits a month. Anything beyond
// that is an add-on (see ADD_ONS), never a different base price, so one plan is one Stripe price.
export interface PlanBilling {
    priceMonthly: number; // USD for the whole base subscription; 0 = free
    priceAnnualMonthly: number; // USD; effective $/mo billed yearly
    includedSeats: number;
    sellsSeats: boolean; // may buy the seat add-on; only the team plan does
    sellsCredits: boolean; // may buy the credit add-on
    trialDays: number; // 0 = none
}

export interface PlanAi {
    includedCredits: number; // a month, covered by the base price
    maxSectionsPerGeneration: number;
    textModelTier: ModelTier;
    imageModelTier: ModelTier;
}

export interface PlanAccount {
    maxArtifacts: number; // -1 = unlimited
    storageMb: number; // -1 = unlimited
}

// a gate is granted only if features.ts also marks it launched
export interface PlanFeatures {
    removeBranding: boolean;
    customThemes: boolean;
    workspaceThemes: boolean; // shared team brand kit
    exportFormats: ExportFormat[];
    publicLinks: boolean;
    customDomains: number; // 0 = none
    analytics: boolean;
    apiAccess: boolean;
    sso: boolean;
    prioritySupport: boolean;
    earlyAccess: boolean;
}

export interface Plan {
    id: PlanId;
    name: string;
    tagline: string;
    badge?: string; // e.g. "Most popular"
    highlights: string[]; // the bullet list on the pricing card
    order: number;
    visible: boolean; // false = staged: not shown/sold yet
    contactSales: boolean; // "Talk to us" instead of Checkout
    billing: PlanBilling;
    ai: PlanAi;
    account: PlanAccount;
    features: PlanFeatures;
}

// representative cost; the real charge scales with length
export const CREDITS_PER_GENERATION = typicalCost("generate-artifact");

/**
 * The monthly allowance per plan, per seat on a per-seat plan. Declared here rather than inline in
 * PLANS so the pricing-card prose below is derived from it: the two are easy to drift apart, and a
 * credit is real provider spend (CREDIT_USD in model/credits.ts), so an allowance is a dollar
 * liability. Sanity-check any change against price: allowance × CREDIT_USD is the worst-case cost of
 * serving a fully-utilised seat, and it must stay well under what that seat pays.
 */
// the only plan that holds a team; Free and Pro are solo, so a seat add-on is Premium-only
const PREMIUM_SEATS = 3;

const CREDITS_PER_MONTH: Record<PlanId, number> = { free: 100, pro: 700, premium: 2400 };

/** What the allowance buys, for the pricing card. */
const gens = (n: number): number => Math.round(n / CREDITS_PER_GENERATION);

/**
 * What a workspace can buy on top of its plan. Both are recurring subscription items, never one-off
 * purchases: a credit bought once would have to survive the monthly reset, which is the only reason
 * a second credit balance ever needed to exist. Everything here resets with the plan's own window,
 * so a workspace has exactly one credit counter.
 *
 * Both are priced well above CREDIT_USD (model/credits.ts), what a credit costs us to serve, and a
 * bare credit costs more per credit than one bundled with a seat, so buying capacity never beats
 * buying a colleague.
 */
export type AddOnId = "seat" | "credits";

export interface AddOn {
    id: AddOnId;
    label: string;
    priceUsd: number; // per unit, per month
    seats: number; // seats one unit adds
    credits: number; // monthly credits one unit adds
}

export const ADD_ONS: Record<AddOnId, AddOn> = {
    seat: { id: "seat", label: "Extra seat", priceUsd: 30, seats: 1, credits: 800 },
    credits: { id: "credits", label: "Credit block", priceUsd: 20, seats: 0, credits: 500 },
};

export const ADD_ON_IDS: AddOnId[] = ["seat", "credits"];

export const addOnFor = (id: string | null | undefined): AddOn | null =>
    ADD_ON_IDS.includes(id as AddOnId) ? ADD_ONS[id as AddOnId] : null;

export const PLANS: Record<PlanId, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "Kick the tires.",
        highlights: [
            `≈${gens(CREDITS_PER_MONTH.free)} AI generations a month`,
            "Up to 10 artifacts",
            "All 52 built-in themes",
            "PNG · PDF export (with a Galleo mark)",
            "Just you",
        ],
        order: 0,
        visible: true,
        contactSales: false,
        billing: {
            priceMonthly: 0,
            priceAnnualMonthly: 0,
            includedSeats: 1,
            sellsSeats: false,
            sellsCredits: false,
            trialDays: 0,
        },
        ai: {
            includedCredits: CREDITS_PER_MONTH.free,
            maxSectionsPerGeneration: 10,
            textModelTier: "basic",
            imageModelTier: "basic",
        },
        account: { maxArtifacts: 10, storageMb: 500 },
        features: {
            removeBranding: false,
            customThemes: false,
            workspaceThemes: false,
            exportFormats: ["png", "pdf"],
            publicLinks: false,
            customDomains: 0,
            analytics: false,
            apiAccess: false,
            sso: false,
            prioritySupport: false,
            earlyAccess: false,
        },
    },
    pro: {
        id: "pro",
        name: "Pro",
        tagline: "For creators who ship — solo or as a team.",
        badge: "Most popular",
        highlights: [
            `≈${gens(CREDITS_PER_MONTH.pro)} AI generations a month`,
            "Unlimited artifacts",
            "Custom themes + every font",
            "Premium AI models · every export format · no watermark",
            "Top up with credit blocks any time",
        ],
        order: 1,
        visible: true,
        contactSales: false,
        billing: {
            priceMonthly: 20,
            priceAnnualMonthly: 16,
            includedSeats: 1,
            sellsSeats: false, // Pro is solo: more capacity is credits, not people
            sellsCredits: true,
            trialDays: 0,
        },
        ai: {
            includedCredits: CREDITS_PER_MONTH.pro,
            maxSectionsPerGeneration: 60,
            textModelTier: "premium",
            imageModelTier: "premium",
        },
        account: { maxArtifacts: -1, storageMb: 20000 },
        features: {
            removeBranding: true,
            customThemes: true,
            workspaceThemes: false,
            exportFormats: ["png", "pdf", "print", "pptx", "slides"],
            publicLinks: true,
            customDomains: 10,
            analytics: false,
            apiAccess: false,
            sso: false,
            prioritySupport: false,
            earlyAccess: false,
        },
    },
    premium: {
        id: "premium",
        name: "Premium",
        tagline: "For teams that need control.",
        highlights: [
            `${PREMIUM_SEATS} seats · ≈${gens(CREDITS_PER_MONTH.premium)} AI generations a month`,
            "Everything in Pro",
            "Admin controls + shared brand kit",
            "Link analytics: views, referrers, engagement",
            "SSO · API (coming soon)",
            "Priority support",
        ],
        order: 2,
        visible: true,
        contactSales: false,
        billing: {
            priceMonthly: 99,
            priceAnnualMonthly: 82,
            includedSeats: PREMIUM_SEATS,
            sellsSeats: true,
            sellsCredits: true,
            trialDays: 0,
        },
        ai: {
            includedCredits: CREDITS_PER_MONTH.premium,
            maxSectionsPerGeneration: 75,
            textModelTier: "premium",
            imageModelTier: "premium",
        },
        account: { maxArtifacts: -1, storageMb: -1 },
        features: {
            removeBranding: true,
            customThemes: true,
            workspaceThemes: true,
            exportFormats: ["png", "pdf", "print", "pptx", "slides"],
            publicLinks: true,
            customDomains: 100,
            analytics: true,
            apiAccess: true,
            sso: true,
            prioritySupport: true,
            earlyAccess: true,
        },
    },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "premium"];

export const visiblePlans = (): Plan[] =>
    PLAN_ORDER.map((id) => PLANS[id]).filter((p) => p.visible);

/** Whether the plan sells seats at all; Free and Pro are solo by design. */
export const sellsSeats = (id: string | null | undefined): boolean =>
    planFor(id).billing.sellsSeats;

/** Whether the plan may buy either add-on, which is what makes a workspace's limit adjustable. */
export const canBuyAddOns = (id: string | null | undefined): boolean => {
    const b = planFor(id).billing;
    return b.sellsSeats || b.sellsCredits;
};

/** The add-ons this plan may actually buy, in catalog order. */
export const addOnsFor = (id: string | null | undefined): AddOn[] => {
    const b = planFor(id).billing;
    return ADD_ON_IDS.filter((a) => (a === "seat" ? b.sellsSeats : b.sellsCredits)).map(
        (a) => ADD_ONS[a],
    );
};

/**
 * The cheapest plan on sale above `from` that actually grants `key`, or null when none does. Reads
 * the resolved set rather than the raw grant, so an unbuilt feature has no upgrade target and a
 * caller can say "coming soon" instead of selling a plan that would not deliver it. Callers derive
 * their copy from this, so "available on Pro" cannot drift from the catalog.
 */
export function upgradeFor(key: BoolFeature, from: string | null | undefined): Plan | null {
    const cur = planFor(from);
    return visiblePlans().find((p) => p.order > cur.order && resolveFeatures(p.id)[key]) ?? null;
}

/** Whether a higher plan is actually on sale, so "upgrade" is a remedy we can offer. */
export const canUpgradeFrom = (id: string | null | undefined): boolean => {
    const cur = planFor(id);
    return visiblePlans().some((p) => p.order > cur.order);
};

/** Whether the plan may buy add-ons, the only remedy left once there is nothing above it. */
export const canTopUp = (id: string | null | undefined): boolean => canBuyAddOns(id);

export const isUnlimited = (n: number): boolean => n < 0;

export function planFor(id: string | null | undefined): Plan {
    return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

// legacy flat shape; new code uses resolveFeatures(). `includedCredits` is the plan's own allowance,
// not the workspace's limit: add-ons only resolve through creditLimitFor.
export interface PlanLimits {
    maxArtifacts: number;
    includedCredits: number;
    customThemes: boolean;
    exportFormats: ExportFormat[];
    removeBranding: boolean;
    publicLinks: boolean;
    workspaceThemes: boolean;
    analytics: boolean;
}

export function limitsFor(id: string | null | undefined): PlanLimits {
    const p = planFor(id);
    return {
        maxArtifacts: p.account.maxArtifacts,
        includedCredits: p.ai.includedCredits,
        customThemes: p.features.customThemes,
        exportFormats: p.features.exportFormats,
        removeBranding: p.features.removeBranding,
        publicLinks: p.features.publicLinks,
        workspaceThemes: p.features.workspaceThemes,
        analytics: p.features.analytics,
    };
}

// effective(feature) = status !== "planned" && ( plan grants it || override grants it )

export type FeatureStatus = "live" | "beta" | "planned";

export type BoolFeature =
    | "removeBranding"
    | "customThemes"
    | "workspaceThemes"
    | "publicLinks"
    | "analytics"
    | "apiAccess"
    | "sso"
    | "prioritySupport"
    | "earlyAccess";

// -1 = unlimited, 0 = none
export type NumFeature =
    | "maxArtifacts"
    | "customDomains"
    | "storageMb"
    | "includedCredits"
    | "maxSectionsPerGeneration";

export type EnumFeature = "exportFormats" | "textModelTier" | "imageModelTier";

export type FeatureKey = BoolFeature | NumFeature | EnumFeature;

interface FeatureDef {
    label: string;
    status: FeatureStatus;
    description: string;
}

export const FEATURES: Record<FeatureKey, FeatureDef> = {
    removeBranding: {
        label: "Remove Galleo mark",
        status: "live",
        description: "Export without the watermark.",
    },
    customThemes: {
        label: "Custom themes",
        status: "live",
        description: "Create your own theme + fonts.",
    },
    exportFormats: {
        label: "Export formats",
        status: "live",
        description: "Which file formats an artifact can be exported to.",
    },
    maxArtifacts: {
        label: "Artifacts",
        status: "live",
        description: "How many live artifacts a workspace can hold.",
    },
    storageMb: {
        label: "Storage",
        status: "live",
        description: "Uploaded-media storage per workspace.",
    },
    includedCredits: {
        label: "Included AI credits",
        status: "live", // spend is enforced by the credit gate, not here
        description: "Monthly AI budget the plan covers, before any add-on.",
    },
    maxSectionsPerGeneration: {
        label: "Sections per generation",
        status: "beta",
        description: "Cap on how large one AI generation can be.",
    },
    textModelTier: {
        label: "AI text model",
        status: "beta",
        description: "Which text models the generator may use.",
    },
    imageModelTier: {
        label: "AI image model",
        status: "beta",
        description: "Which image models media generation may use.",
    },
    workspaceThemes: {
        label: "Shared brand kit",
        status: "planned",
        description: "Team-wide shared themes.",
    },
    publicLinks: {
        label: "Public share links",
        status: "live",
        description: "Publish an artifact to a public URL.",
    },
    customDomains: {
        label: "Custom domains",
        status: "planned",
        description: "Publish websites on your own domain.",
    },
    analytics: {
        label: "Analytics",
        status: "live",
        description: "View traffic + engagement on shared artifacts.",
    },
    apiAccess: {
        label: "API access",
        status: "planned",
        description: "Programmatic generation.",
    },
    sso: { label: "SSO", status: "planned", description: "SAML / OIDC single sign-on." },
    prioritySupport: {
        label: "Priority support",
        status: "planned",
        description: "Faster support response.",
    },
    earlyAccess: {
        label: "Early access",
        status: "planned",
        description: "Preview new features first.",
    },
};

export const featureStatus = (key: FeatureKey): FeatureStatus => FEATURES[key].status;
const launched = (key: FeatureKey): boolean => FEATURES[key].status !== "planned";

// produced by resolveFeatures(); read via can()/limit()
export interface Features {
    planId: PlanId;
    removeBranding: boolean;
    customThemes: boolean;
    workspaceThemes: boolean;
    publicLinks: boolean;
    analytics: boolean;
    apiAccess: boolean;
    sso: boolean;
    prioritySupport: boolean;
    earlyAccess: boolean;
    // -1 = unlimited, 0 = none
    maxArtifacts: number;
    customDomains: number;
    storageMb: number;
    includedCredits: number;
    maxSectionsPerGeneration: number;
    exportFormats: ExportFormat[];
    textModelTier: ModelTier;
    imageModelTier: ModelTier;
}

// per-workspace patch; can't grant a "planned" (unbuilt) feature
export type FeatureOverrides = Partial<Omit<Features, "planId">>;

export function resolveFeatures(planId: PlanId, overrides?: FeatureOverrides): Features {
    const p = planFor(planId);
    const pf = p.features;

    // gate by launch status, then let an override widen it
    const b = (key: BoolFeature, planValue: boolean): boolean => {
        if (!launched(key)) return false;
        const o = overrides?.[key];
        return o === undefined ? planValue : o;
    };
    const n = (key: NumFeature, planValue: number): number => {
        if (!launched(key)) return 0;
        const o = overrides?.[key];
        return o === undefined ? planValue : o;
    };

    return {
        planId,
        removeBranding: b("removeBranding", pf.removeBranding),
        customThemes: b("customThemes", pf.customThemes),
        workspaceThemes: b("workspaceThemes", pf.workspaceThemes),
        publicLinks: b("publicLinks", pf.publicLinks),
        analytics: b("analytics", pf.analytics),
        apiAccess: b("apiAccess", pf.apiAccess),
        sso: b("sso", pf.sso),
        prioritySupport: b("prioritySupport", pf.prioritySupport),
        earlyAccess: b("earlyAccess", pf.earlyAccess),
        maxArtifacts: n("maxArtifacts", p.account.maxArtifacts),
        customDomains: n("customDomains", pf.customDomains),
        storageMb: n("storageMb", p.account.storageMb),
        includedCredits: n("includedCredits", p.ai.includedCredits),
        maxSectionsPerGeneration: n("maxSectionsPerGeneration", p.ai.maxSectionsPerGeneration),
        exportFormats: launched("exportFormats")
            ? (overrides?.exportFormats ?? pf.exportFormats)
            : [],
        textModelTier: launched("textModelTier")
            ? (overrides?.textModelTier ?? p.ai.textModelTier)
            : "basic",
        imageModelTier: launched("imageModelTier")
            ? (overrides?.imageModelTier ?? p.ai.imageModelTier)
            : "basic",
    };
}

export const can = (f: Features, key: BoolFeature): boolean => f[key];
export const limit = (f: Features, key: NumFeature): number => f[key];
// within the numeric limit (-1 = unlimited)
export const withinLimit = (f: Features, key: NumFeature, current: number): boolean =>
    isUnlimited(f[key]) || current < f[key];

// A stored workspace row, narrowed to what entitlement resolution reads. Structural, so the backend
// can pass a drizzle row straight in without the contract knowing about the database.
export interface PlanBearer {
    plan: string | null;
    featureOverrides?: FeatureOverrides | null;
}

/** What a workspace bought on top of its plan; both are subscription quantities, never one-off. */
export interface AddOnBearer {
    seats: number; // total, including the plan's own
    creditBlocks: number;
}

/**
 * Seats bought beyond the plan's included ones, which is what the seat add-on is billed on. Zero on
 * a plan that does not sell seats: a workspace whose subscription lapsed keeps its `seats` count
 * until Stripe's webhook resets it, and must not draw seat credits it is no longer paying for.
 */
export const extraSeatsOf = (ws: PlanBearer & { seats: number }): number =>
    sellsSeats(ws.plan) ? Math.max(0, ws.seats - planFor(ws.plan).billing.includedSeats) : 0;

export function featuresFor(ws: PlanBearer): Features {
    return resolveFeatures((ws.plan ?? "free") as PlanId, ws.featureOverrides ?? undefined);
}

/**
 * The workspace's whole monthly allowance, and the only place add-ons fold in. One number against
 * one counter (`ai_credits_used`): every credit here arrives monthly and expires with the window, so
 * there is no second balance to track.
 */
export function creditLimitFor(ws: PlanBearer & AddOnBearer): number {
    return (
        featuresFor(ws).includedCredits +
        extraSeatsOf(ws) * ADD_ONS.seat.credits +
        Math.max(0, ws.creditBlocks) * ADD_ONS.credits.credits
    );
}

/** Total seats the subscription pays for: the plan's own plus any seat add-on. */
export const seatsFor = (planId: string | null | undefined, extraSeats: number): number =>
    planFor(planId).billing.includedSeats + Math.max(0, extraSeats);
