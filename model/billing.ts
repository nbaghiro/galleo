// The plan catalog — one data-driven source of truth shared by the backend (which enforces the limits)
// and the app (which renders the pricing page from it). Pure data: no Stripe, no DB. Every lever a plan
// can vary on is a field, so prices/limits/tiers move by editing values, not code. Stripe price ids are
// NOT here — they live in server env (STRIPE_PRICE_{ID}_{INTERVAL}), so this file needs no account to
// exist. See .docs/billing.md for the full model; `model/features.ts` resolves these into the effective
// features every gate reads.
//
// Three tiers: Free (solo, flat) · Pro · Premium. Both paid tiers are PER SEAT — a solo user buys 1 seat,
// a team buys N — so tier (what you can do) and seats (how many of you) move independently.

import { typicalCost } from "@model/ai";

export type PlanId = "free" | "pro" | "premium";
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
// On a per-seat plan the workspace pool = seats × creditsPerMonth.
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
    maxMembers: number; // base seats included (per_seat: minSeats; real cap = workspace.seats)
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

// A typical AI generation's credit cost. Derived from the metered catalog (@model/ai +
// @model/credits): the real charge scales with the artifact's length, but this typical value stays for
// callers/copy that want one representative number. The catalog is the source of truth. 🔶 AI session.
export const CREDITS_PER_GENERATION = typicalCost("generate");

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
            "SSO · analytics · API (coming soon)",
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

// The plans shown/sold on the pricing page (staged tiers are hidden until they ship).
export const visiblePlans = (): Plan[] =>
    PLAN_ORDER.map((id) => PLANS[id]).filter((p) => p.visible);

// Paid tiers that bill per seat — the ones that show a seat picker + support inviting members.
export const isPerSeat = (id: string | null | undefined): boolean =>
    planFor(id).billing.model === "per_seat";

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
