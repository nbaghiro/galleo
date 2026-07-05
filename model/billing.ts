// The plan catalog + entitlements — one source of truth shared by the backend (which enforces the
// limits) and the app (which renders the pricing page from it). Pure data: no Stripe, no DB. Change a
// price or a limit here and both the paywall and the pricing cards move together. Stripe price ids are
// NOT here — they live in server env (STRIPE_PRICE_*), so this file needs no account to exist.

export type PlanId = "free" | "pro" | "business";

export interface PlanLimits {
    maxArtifacts: number; // -1 = unlimited
    aiCreditsPerMonth: number;
    customThemes: boolean;
    exportFormats: ("png" | "pdf" | "print")[];
    removeBranding: boolean;
    maxMembers: number;
    publicLinks: boolean;
    workspaceThemes: boolean; // shared team brand kit
    analytics: boolean;
}

export interface Plan {
    id: PlanId;
    name: string;
    tagline: string;
    priceMonthly: number; // USD; 0 = free
    highlights: string[]; // the bullet list on the pricing card
    limits: PlanLimits;
}

// One AI generation spends this many credits; the only spender today, but credits leave room for
// per-action pricing later (an edit, a re-theme, an image) without changing the plan shape.
export const CREDITS_PER_GENERATION = 40;

export const PLANS: Record<PlanId, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "Kick the tires.",
        priceMonthly: 0,
        highlights: [
            "≈2 AI generations a month",
            "Up to 5 artifacts",
            "All 52 built-in themes",
            "PNG export (with a Galleo mark)",
            "Just you",
        ],
        limits: {
            maxArtifacts: 5,
            aiCreditsPerMonth: 100,
            customThemes: false,
            exportFormats: ["png"],
            removeBranding: false,
            maxMembers: 1,
            publicLinks: false,
            workspaceThemes: false,
            analytics: false,
        },
    },
    pro: {
        id: "pro",
        name: "Pro",
        tagline: "For creators who ship.",
        priceMonthly: 16,
        highlights: [
            "≈50 AI generations a month",
            "Unlimited artifacts",
            "Custom themes + every font",
            "PDF · PNG · print — no watermark",
            "Public share links",
        ],
        limits: {
            maxArtifacts: -1,
            aiCreditsPerMonth: 2000,
            customThemes: true,
            exportFormats: ["pdf", "png", "print"],
            removeBranding: true,
            maxMembers: 1,
            publicLinks: true,
            workspaceThemes: false,
            analytics: false,
        },
    },
    business: {
        id: "business",
        name: "Business",
        tagline: "For teams with a brand to hold.",
        priceMonthly: 40,
        highlights: [
            "≈250 AI generations a month",
            "Everything in Pro",
            "Up to 10 members",
            "Shared workspace themes + brand kit",
            "View analytics",
        ],
        limits: {
            maxArtifacts: -1,
            aiCreditsPerMonth: 10000,
            customThemes: true,
            exportFormats: ["pdf", "png", "print"],
            removeBranding: true,
            maxMembers: 10,
            publicLinks: true,
            workspaceThemes: true,
            analytics: true,
        },
    },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "business"];

export const isUnlimited = (n: number): boolean => n < 0;

export function planFor(id: string | null | undefined): Plan {
    return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

export function limitsFor(id: string | null | undefined): PlanLimits {
    return planFor(id).limits;
}
