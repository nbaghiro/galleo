import { typicalCost } from "@model/tools";

// a plan/seat downgrade parked at period end via a Stripe subscription schedule
export interface ScheduledChange {
    plan: PlanId;
    interval: Interval;
    seats: number;
    at: string; // ISO date the phase flips
}

export type PlanId = "free" | "pro" | "premium";
export type BillingModel = "flat" | "per_seat";
export type Interval = "month" | "year";
export type ModelTier = "basic" | "advanced" | "premium";
export type ExportFormat = "png" | "pdf" | "print" | "pptx" | "slides";

// prices are per-unit (per seat when per_seat); annual = effective $/mo billed yearly
export interface PlanBilling {
    model: BillingModel;
    priceMonthly: number; // USD; 0 = free
    priceAnnualMonthly: number; // USD; 0 = free
    minSeats: number;
    maxSeats: number | null; // null = unbounded / contact sales
    trialDays: number; // 0 = none
}

// per-seat pool = seats × creditsPerMonth
export interface PlanAi {
    creditsPerMonth: number; // per seat when per_seat
    creditsRollover: boolean;
    maxSectionsPerGeneration: number;
    textModelTier: ModelTier;
    imageModelTier: ModelTier;
    creditTopUpsAllowed: boolean;
}

export interface PlanAccount {
    maxArtifacts: number; // -1 = unlimited
    maxMembers: number; // base seats included; real cap = workspace.seats
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

// gated by plan.ai.creditTopUpsAllowed; pack credits sit outside the monthly window, spent after it
// prices resolve from STRIPE_PRICE_PACK_1K / STRIPE_PRICE_PACK_5K, like the plan prices
export type CreditPackId = "pack-1k" | "pack-5k";

export interface CreditPack {
    id: CreditPackId;
    credits: number;
    priceUsd: number;
}

export const CREDIT_PACKS: CreditPack[] = [
    { id: "pack-1k", credits: 1000, priceUsd: 10 },
    { id: "pack-5k", credits: 5000, priceUsd: 40 },
];

export const packFor = (id: string | null | undefined): CreditPack | null =>
    CREDIT_PACKS.find((p) => p.id === id) ?? null;

export const PLANS: Record<PlanId, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "Kick the tires.",
        highlights: [
            "≈3 AI generations a month",
            "Up to 10 artifacts",
            "All 52 built-in themes",
            "PNG · PDF export (with a Galleo mark)",
            "Just you",
        ],
        order: 0,
        visible: true,
        contactSales: false,
        billing: {
            model: "flat",
            priceMonthly: 0,
            priceAnnualMonthly: 0,
            minSeats: 1,
            maxSeats: 1,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 150,
            creditsRollover: false,
            maxSectionsPerGeneration: 10,
            textModelTier: "basic",
            imageModelTier: "basic",
            creditTopUpsAllowed: false,
        },
        account: { maxArtifacts: 10, maxMembers: 1, storageMb: 500 },
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
            "≈60 AI generations / seat / month",
            "Unlimited artifacts",
            "Custom themes + every font",
            "Premium AI models · every export format · no watermark",
            "Invite your team — billed per seat",
        ],
        order: 1,
        visible: true,
        contactSales: false,
        billing: {
            model: "per_seat",
            priceMonthly: 20,
            priceAnnualMonthly: 16,
            minSeats: 1,
            maxSeats: null,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 2500,
            creditsRollover: false,
            maxSectionsPerGeneration: 60,
            textModelTier: "premium",
            imageModelTier: "premium",
            creditTopUpsAllowed: true,
        },
        account: { maxArtifacts: -1, maxMembers: 1, storageMb: 20000 },
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
            "≈140 AI generations / seat / month",
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
            model: "per_seat",
            priceMonthly: 40,
            priceAnnualMonthly: 33,
            minSeats: 1,
            maxSeats: null,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 6000,
            creditsRollover: false,
            maxSectionsPerGeneration: 75,
            textModelTier: "premium",
            imageModelTier: "premium",
            creditTopUpsAllowed: true,
        },
        account: { maxArtifacts: -1, maxMembers: 1, storageMb: -1 },
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

export const isPerSeat = (id: string | null | undefined): boolean =>
    planFor(id).billing.model === "per_seat";

export const isUnlimited = (n: number): boolean => n < 0;

export function planFor(id: string | null | undefined): Plan {
    return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

// legacy flat shape; new code uses resolveFeatures()
export interface PlanLimits {
    maxArtifacts: number;
    aiCreditsPerMonth: number;
    customThemes: boolean;
    exportFormats: ExportFormat[];
    removeBranding: boolean;
    maxMembers: number;
    publicLinks: boolean;
    workspaceThemes: boolean;
    analytics: boolean;
}

export function limitsFor(id: string | null | undefined): PlanLimits {
    const p = planFor(id);
    return {
        maxArtifacts: p.account.maxArtifacts,
        aiCreditsPerMonth: p.ai.creditsPerMonth,
        customThemes: p.features.customThemes,
        exportFormats: p.features.exportFormats,
        removeBranding: p.features.removeBranding,
        maxMembers: p.account.maxMembers,
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
    | "maxMembers"
    | "customDomains"
    | "storageMb"
    | "creditsPerMonth"
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
    maxMembers: {
        label: "Members / seats",
        status: "live",
        description: "How many members a workspace can have (1 = solo).",
    },
    storageMb: {
        label: "Storage",
        status: "live",
        description: "Uploaded-media storage per workspace.",
    },
    creditsPerMonth: {
        label: "Monthly AI credits",
        status: "live", // spend is enforced by the credit gate, not here
        description: "AI generation budget per month.",
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
    maxMembers: number;
    customDomains: number;
    storageMb: number;
    creditsPerMonth: number;
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
        maxMembers: n("maxMembers", p.account.maxMembers),
        customDomains: n("customDomains", pf.customDomains),
        storageMb: n("storageMb", p.account.storageMb),
        creditsPerMonth: n("creditsPerMonth", p.ai.creditsPerMonth),
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

export function featuresFor(ws: PlanBearer): Features {
    return resolveFeatures((ws.plan ?? "free") as PlanId, ws.featureOverrides ?? undefined);
}

// creditsPerMonth is per seat on per-seat plans, so the pool scales with purchased seats
export function creditLimitFor(ws: PlanBearer & { seats: number }): number {
    const perSeat = featuresFor(ws).creditsPerMonth;
    return isPerSeat(ws.plan) ? perSeat * Math.max(1, ws.seats) : perSeat;
}
