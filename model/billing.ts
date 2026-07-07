// The plan catalog — one data-driven source of truth shared by the backend (which enforces the limits)
// and the app (which renders the pricing page from it). Pure data: no Stripe, no DB. Every lever a plan
// can vary on is a field, so prices/limits/tiers move by editing values, not code. Stripe price ids are
// NOT here — they live in server env (STRIPE_PRICE_{ID}_{INTERVAL}), so this file needs no account to
// exist. See .docs/billing.md for the full model; `model/features.ts` resolves these into the effective
// features every gate reads.

import { typicalCost } from "@model/ai-actions";

export type PlanId = "free" | "plus" | "pro" | "team" | "business";
export type Audience = "individual" | "team";
export type BillingModel = "flat" | "per_seat";
export type Interval = "month" | "year";
export type ModelTier = "basic" | "advanced" | "premium";
export type ExportFormat = "png" | "pdf" | "print" | "pptx" | "slides";

// How a plan is billed. `priceMonthly`/`priceAnnualMonthly` are per-unit (per seat when per_seat); the
// annual figure is the effective $/mo when billed yearly (the discount lever). Stripe treats per-seat as
// price × quantity — this `model` field is what tells our code to show a seat picker + send a quantity.
export interface PlanBilling {
    model: BillingModel;
    priceMonthly: number; // USD; 0 = free
    priceAnnualMonthly: number; // effective $/mo billed yearly; 0 = free
    minSeats: number;
    maxSeats: number | null; // null = unbounded / contact sales
    trialDays: number; // 0 = none
}

// AI limits. VALUES here are owned by the AI/credit session (the contract they read); we own the fields.
// The monthly credit budget lives here (a plan attribute); per-action cost lives in @model/credits.
export interface PlanAi {
    creditsPerMonth: number; // per seat when per_seat
    creditsRollover: boolean;
    maxSectionsPerGeneration: number; // ≈ Gamma "cards per prompt"
    textModelTier: ModelTier;
    imageModelTier: ModelTier;
    creditTopUpsAllowed: boolean;
}

// Account / workspace caps.
export interface PlanAccount {
    maxArtifacts: number; // -1 = unlimited
    maxMembers: number; // seats included at base (per_seat: min seats)
    storageMb: number; // -1 = unlimited
}

// Feature gates. Whether a listed gate is actually granted also depends on its launch status in
// `features.ts` — a `planned` feature stays off for everyone even if a plan lists it true.
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
    // identity / presentation
    id: PlanId;
    name: string;
    tagline: string;
    audience: Audience;
    badge?: string; // e.g. "Most popular"
    highlights: string[]; // the bullet list on the pricing card
    order: number;
    visible: boolean; // false = staged: in the model, not shown/sold yet
    contactSales: boolean; // "Talk to us" instead of Checkout
    // enforcement + billing
    billing: PlanBilling;
    ai: PlanAi; // 🔶 values owned by the AI/credit session
    account: PlanAccount;
    features: PlanFeatures;
}

// A typical AI generation's credit cost. Derived from the metered catalog (@model/ai-actions +
// @model/credits): the real charge scales with the artifact's length, but this typical value stays for
// callers/copy that want one representative number. The catalog is the source of truth. 🔶 AI session.
export const CREDITS_PER_GENERATION = typicalCost("generate");

export const PLANS: Record<PlanId, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "Kick the tires.",
        audience: "individual",
        highlights: [
            "≈7 AI generations a month",
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
            creditsPerMonth: 300,
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
    plus: {
        id: "plus",
        name: "Plus",
        tagline: "Extra AI power, no watermark.",
        audience: "individual",
        highlights: [
            "≈25 AI generations a month",
            "Unlimited artifacts",
            "No Galleo watermark",
            "PNG · PDF · print export",
            "Advanced AI image models",
        ],
        order: 1,
        visible: true,
        contactSales: false,
        billing: {
            model: "flat",
            priceMonthly: 12,
            priceAnnualMonthly: 10,
            minSeats: 1,
            maxSeats: 1,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 1000,
            creditsRollover: false,
            maxSectionsPerGeneration: 25,
            textModelTier: "advanced",
            imageModelTier: "advanced",
            creditTopUpsAllowed: false,
        },
        account: { maxArtifacts: -1, maxMembers: 1, storageMb: 5000 },
        features: {
            removeBranding: true,
            customThemes: false,
            workspaceThemes: false,
            exportFormats: ["png", "pdf", "print"],
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
        tagline: "For creators who ship.",
        audience: "individual",
        badge: "Most popular",
        highlights: [
            "≈100 AI generations a month",
            "Custom themes + every font",
            "Premium AI image models",
            "Every export format",
            "Public links · analytics · API (soon)",
        ],
        order: 2,
        visible: true,
        contactSales: false,
        billing: {
            model: "flat",
            priceMonthly: 24,
            priceAnnualMonthly: 20,
            minSeats: 1,
            maxSeats: 1,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 4000,
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
            analytics: true,
            apiAccess: true,
            sso: false,
            prioritySupport: false,
            earlyAccess: false,
        },
    },
    team: {
        id: "team",
        name: "Team",
        tagline: "For teams with a brand to hold.",
        audience: "team",
        highlights: [
            "Everything in Pro, per seat",
            "6,000 AI credits per seat",
            "Shared workspace brand kit",
            "Admin + shared folders",
            "Centralized billing",
        ],
        order: 3,
        visible: false, // staged until members / seats ship
        contactSales: true,
        billing: {
            model: "per_seat",
            priceMonthly: 30,
            priceAnnualMonthly: 25,
            minSeats: 2,
            maxSeats: null,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 6000,
            creditsRollover: false,
            maxSectionsPerGeneration: 60,
            textModelTier: "premium",
            imageModelTier: "premium",
            creditTopUpsAllowed: true,
        },
        account: { maxArtifacts: -1, maxMembers: 2, storageMb: 50000 },
        features: {
            removeBranding: true,
            customThemes: true,
            workspaceThemes: true,
            exportFormats: ["png", "pdf", "print", "pptx", "slides"],
            publicLinks: true,
            customDomains: 25,
            analytics: true,
            apiAccess: true,
            sso: false,
            prioritySupport: false,
            earlyAccess: false,
        },
    },
    business: {
        id: "business",
        name: "Business",
        tagline: "For orgs making it official.",
        audience: "team",
        highlights: [
            "Everything in Team, per seat",
            "10,000 AI credits per seat",
            "SSO authentication",
            "Advanced AI models",
            "Priority support",
        ],
        order: 4,
        visible: false, // staged until members / seats ship
        contactSales: true,
        billing: {
            model: "per_seat",
            priceMonthly: 60,
            priceAnnualMonthly: 50,
            minSeats: 2,
            maxSeats: null,
            trialDays: 0,
        },
        ai: {
            creditsPerMonth: 10000,
            creditsRollover: false,
            maxSectionsPerGeneration: 75,
            textModelTier: "premium",
            imageModelTier: "premium",
            creditTopUpsAllowed: true,
        },
        account: { maxArtifacts: -1, maxMembers: 2, storageMb: -1 },
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

export const PLAN_ORDER: PlanId[] = ["free", "plus", "pro", "team", "business"];

// The plans shown/sold on the pricing page (staged tiers are hidden until they ship).
export const visiblePlans = (): Plan[] =>
    PLAN_ORDER.map((id) => PLANS[id]).filter((p) => p.visible);

export const isUnlimited = (n: number): boolean => n < 0;

export function planFor(id: string | null | undefined): Plan {
    return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

// Per-unit price for a plan at an interval (monthly bill vs the effective monthly rate billed yearly).
export function priceFor(id: string | null | undefined, interval: Interval): number {
    const b = planFor(id).billing;
    return interval === "year" ? b.priceAnnualMonthly : b.priceMonthly;
}

// --- legacy flat bridge --------------------------------------------------------------------------
// The pre-refactor flat feature shape. Kept so the existing gates keep compiling until they migrate
// to the `features.ts` resolver in P1. New code should use resolveFeatures() instead. Only covers the
// `live` gates in use today; the resolver is the source of truth for launch status + overrides.
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
