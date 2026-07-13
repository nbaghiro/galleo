import { typicalCost } from "@model/tools";

export type PlanId = "free" | "pro" | "premium";
export type BillingModel = "flat" | "per_seat";
export type Interval = "month" | "year";
export type ModelTier = "basic" | "advanced" | "premium";
export type ExportFormat = "png" | "pdf" | "print" | "pptx" | "slides";

// prices are per-unit (per seat when per_seat); annual = effective $/mo billed yearly
export interface PlanBilling {
    model: BillingModel;
    priceMonthly: number; // USD; 0 = free
    priceAnnualMonthly: number; // effective $/mo billed yearly; 0 = free
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
    ai: PlanAi; // 🔶 values owned by the AI/credit session
    account: PlanAccount;
    features: PlanFeatures;
}

// representative cost; real charge scales with length 🔶
export const CREDITS_PER_GENERATION = typicalCost("generate-artifact");

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

export const visiblePlans = (): Plan[] =>
    PLAN_ORDER.map((id) => PLANS[id]).filter((p) => p.visible);

export const isPerSeat = (id: string | null | undefined): boolean =>
    planFor(id).billing.model === "per_seat";

export const isUnlimited = (n: number): boolean => n < 0;

export function planFor(id: string | null | undefined): Plan {
    return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

// year = effective monthly rate billed yearly
export function priceFor(id: string | null | undefined, interval: Interval): number {
    const b = planFor(id).billing;
    return interval === "year" ? b.priceAnnualMonthly : b.priceMonthly;
}

// legacy flat shape — new code uses resolveFeatures()
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
