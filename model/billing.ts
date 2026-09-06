import { THEME_LIST } from "@model/theme";

export type PlanId = "free" | "pro" | "premium";
export type Interval = "month" | "year";

// Every 402 body names its wall, because one status covers several walls whose remedies differ and
// telling them apart by parsing the prose picked the wrong one.
export type PaywallReason = "credits" | "storage" | "seats" | "feature";

// What a plan change did, as the route reports it back.
export type ChangeEffect = "cancel_at_period_end" | "upgraded" | "changed";
export type ExportFormat = "png" | "pdf" | "print" | "pptx" | "slides";

// Every price is per seat and the subscription is one Stripe line at quantity = seats, so a plan is
// one price per interval and a seat carries the same credits whether it is the first or the tenth.
export interface PlanBilling {
    priceMonthly: number; // USD per seat; 0 = free
    priceAnnualMonthly: number; // USD per seat; effective $/mo billed yearly
    minSeats: number;
    maxSeats: number; // 1 = solo
}

export interface PlanAi {
    creditsPerSeat: number; // a month
}

export interface PlanAccount {
    maxArtifacts: number; // -1 = unlimited
    storageMb: number; // -1 = unlimited
}

export interface PlanFeatures {
    removeBranding: boolean;
    customThemes: boolean;
    exportFormats: ExportFormat[];
    publicLinks: boolean;
    analytics: boolean;
    apiAccess: boolean;
    audio: boolean; // narration, designed voices, and a music bed
}

export interface Plan {
    id: PlanId;
    name: string;
    tagline: string;
    badge?: string;
    highlights: string[]; // the bullet list on the pricing card
    billing: PlanBilling;
    ai: PlanAi;
    account: PlanAccount;
    features: PlanFeatures;
}

/**
 * The monthly allowance per seat. A credit is real provider spend (CREDIT_USD in model/credits.ts),
 * so an allowance is a dollar liability; sized against the YEARLY price, the thinnest way to pay,
 * so every route clears an 80% margin floor. model/__tests__/billing.test.ts holds the invariants.
 */
const CREDITS: Record<PlanId, number> = { free: 300, pro: 1_200, premium: 2_100 };

const credits = (n: number): string => n.toLocaleString("en-US");

/**
 * Bought credits: any preset quantity, one flat rate, no volume break. They share the single
 * balance because unspent credits roll over (see rollIfLapsed), and `purchased_credits` keeps them
 * out of the rollover clip so a bought credit never expires. The rate sits above CREDIT_USD and
 * above EVERY plan's own per-credit rate, so buying outright never undercuts subscribing.
 */
export const CREDIT_PRICE_USD = 0.02;

export const CREDIT_PRESETS: readonly number[] = [500, 2000, 5000];

export const isCreditPreset = (n: number): boolean => CREDIT_PRESETS.includes(n);

export const PLANS: Record<PlanId, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "For trying it out.",
        highlights: [
            `${credits(CREDITS.free)} credits a month`,
            "Up to 10 artifacts",
            `All ${THEME_LIST.length} built-in themes`,
            "PNG · PDF export (with a Galleo mark)",
            "Just you",
        ],
        billing: { priceMonthly: 0, priceAnnualMonthly: 0, minSeats: 1, maxSeats: 1 },
        ai: { creditsPerSeat: CREDITS.free },
        account: { maxArtifacts: 10, storageMb: 500 },
        features: {
            removeBranding: false,
            customThemes: false,
            exportFormats: ["png", "pdf"],
            publicLinks: false,
            analytics: false,
            apiAccess: false,
            audio: false,
        },
    },
    pro: {
        id: "pro",
        name: "Pro",
        tagline: "For creators who ship.",
        badge: "Most popular",
        highlights: [
            `${credits(CREDITS.pro)} credits a month`,
            "Unlimited artifacts",
            "Custom themes + every font",
            "Every export format, no watermark",
            "Voice narration and background music",
            "Buy extra credits any time",
        ],
        billing: { priceMonthly: 20, priceAnnualMonthly: 16, minSeats: 1, maxSeats: 1 },
        ai: { creditsPerSeat: CREDITS.pro },
        account: { maxArtifacts: -1, storageMb: 20000 },
        features: {
            removeBranding: true,
            customThemes: true,
            exportFormats: ["png", "pdf", "print", "pptx", "slides"],
            publicLinks: true,
            analytics: false,
            apiAccess: false,
            audio: true,
        },
    },
    premium: {
        id: "premium",
        name: "Premium",
        tagline: "For teams that need control.",
        highlights: [
            `${credits(CREDITS.premium)} credits per seat each month`,
            "Everything in Pro",
            "3 seats to start, add more any time",
            "Roles and admin controls",
            "Link analytics: views, referrers, engagement",
            "API and MCP access",
        ],
        billing: { priceMonthly: 33, priceAnnualMonthly: 27, minSeats: 3, maxSeats: 100 },
        ai: { creditsPerSeat: CREDITS.premium },
        account: { maxArtifacts: -1, storageMb: -1 },
        features: {
            removeBranding: true,
            customThemes: true,
            exportFormats: ["png", "pdf", "print", "pptx", "slides"],
            publicLinks: true,
            analytics: true,
            apiAccess: true,
            audio: true,
        },
    },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "premium"];

export function planFor(id: string | null | undefined): Plan {
    return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

export const planRank = (id: string | null | undefined): number =>
    PLAN_ORDER.indexOf(planFor(id).id);

/** Whether the plan holds a team; Free and Pro are solo by design. */
export const sellsSeats = (id: string | null | undefined): boolean =>
    planFor(id).billing.maxSeats > 1;

export const clampSeats = (id: string | null | undefined, seats: number): number => {
    const b = planFor(id).billing;
    return Math.min(b.maxSeats, Math.max(b.minSeats, Math.floor(seats)));
};

/** Whether a higher plan is on sale, so "upgrade" is a remedy we can offer. */
export const canUpgradeFrom = (id: string | null | undefined): boolean =>
    planRank(id) < PLAN_ORDER.length - 1;

/** Whether the plan may buy credits, the remedy that works even on the top plan. */
export const canTopUp = (id: string | null | undefined): boolean =>
    planFor(id).billing.priceMonthly > 0;

export const isUnlimited = (n: number): boolean => n < 0;

export type BoolFeature =
    | "removeBranding"
    | "customThemes"
    | "publicLinks"
    | "analytics"
    | "apiAccess"
    | "audio";

// -1 = unlimited
export type NumFeature = "maxArtifacts" | "storageMb";

export type EnumFeature = "exportFormats";

export type FeatureKey = BoolFeature | NumFeature | EnumFeature;

// what a wall calls the gate it hit
export const FEATURES: Record<FeatureKey, { label: string; description: string }> = {
    removeBranding: { label: "Remove Galleo mark", description: "Export without the watermark." },
    customThemes: { label: "Custom themes", description: "Create your own theme + fonts." },
    exportFormats: {
        label: "Export formats",
        description: "Which file formats an artifact can be exported to.",
    },
    maxArtifacts: {
        label: "Artifacts",
        description: "How many live artifacts a workspace can hold.",
    },
    storageMb: { label: "Storage", description: "Uploaded-media storage per workspace." },
    publicLinks: {
        label: "Public share links",
        description: "Publish an artifact to a public URL.",
    },
    analytics: {
        label: "Analytics",
        description: "View traffic + engagement on shared artifacts.",
    },
    apiAccess: {
        label: "API access",
        description: "Programmatic access with workspace API credentials.",
    },
    audio: {
        label: "Narration and music",
        description: "Read a piece aloud, design a voice, and play a bed under it.",
    },
};

// produced by resolveFeatures(); read via can()/limit()
export interface Features {
    planId: PlanId;
    removeBranding: boolean;
    customThemes: boolean;
    publicLinks: boolean;
    analytics: boolean;
    apiAccess: boolean;
    audio: boolean;
    maxArtifacts: number;
    storageMb: number;
    exportFormats: ExportFormat[];
}

// per-workspace patch over the plan. `includedCredits` replaces the whole monthly grant rather than
// the per-seat rate, since it is a support lever ("this workspace gets 5,000 a month").
export type FeatureOverrides = Partial<Omit<Features, "planId">> & { includedCredits?: number };

export function resolveFeatures(planId: PlanId, overrides?: FeatureOverrides): Features {
    const p = planFor(planId);
    const f = p.features;
    return {
        planId,
        removeBranding: overrides?.removeBranding ?? f.removeBranding,
        customThemes: overrides?.customThemes ?? f.customThemes,
        publicLinks: overrides?.publicLinks ?? f.publicLinks,
        analytics: overrides?.analytics ?? f.analytics,
        apiAccess: overrides?.apiAccess ?? f.apiAccess,
        audio: overrides?.audio ?? f.audio,
        maxArtifacts: overrides?.maxArtifacts ?? p.account.maxArtifacts,
        storageMb: overrides?.storageMb ?? p.account.storageMb,
        exportFormats: overrides?.exportFormats ?? f.exportFormats,
    };
}

export const can = (f: Features, key: BoolFeature): boolean => f[key];
export const limit = (f: Features, key: NumFeature): number => f[key];
export const withinLimit = (f: Features, key: NumFeature, current: number): boolean =>
    isUnlimited(f[key]) || current < f[key];

/**
 * The cheapest plan above `from` that grants more of `key`, or null when none does. Callers derive
 * their copy from this, so "available on Pro" cannot drift from the catalog.
 */
export function upgradeFor(key: FeatureKey, from: string | null | undefined): Plan | null {
    const have = resolveFeatures(planFor(from).id);
    const better = (f: Features): boolean => {
        const a = have[key];
        const b = f[key];
        if (typeof a === "boolean") return !a && b === true;
        if (typeof a === "number")
            return (
                typeof b === "number" &&
                (isUnlimited(b) ? !isUnlimited(a) : !isUnlimited(a) && b > a)
            );
        return (b as ExportFormat[]).length > a.length;
    };
    return (
        PLAN_ORDER.slice(planRank(from) + 1)
            .map((id) => PLANS[id])
            .find((p) => better(resolveFeatures(p.id))) ?? null
    );
}

// A stored workspace row, narrowed to what entitlement resolution reads. Structural, so the backend
// can pass a drizzle row straight in without the contract knowing about the database.
export interface PlanBearer {
    plan: string | null;
    featureOverrides?: FeatureOverrides | null;
}

export function featuresFor(ws: PlanBearer): Features {
    return resolveFeatures(planFor(ws.plan).id, ws.featureOverrides ?? undefined);
}

/**
 * What the subscription grants each month. Added to `ai_credits_balance` at each window rather
 * than replacing it, so leftovers carry. Bought credits are a purchase, not a grant.
 */
export function grantFor(ws: PlanBearer & { seats: number }): number {
    return (
        ws.featureOverrides?.includedCredits ??
        planFor(ws.plan).ai.creditsPerSeat * clampSeats(ws.plan, ws.seats)
    );
}

/**
 * How many months of the grant the balance may bank. A granted credit is a dollar liability at
 * CREDIT_USD, so the cap holds the worst case near one month's revenue per plan while keeping the
 * promise that a quiet month funds a busy one, at exactly one quiet month.
 */
export const ROLLOVER_CAP_MONTHS = 2;

export const rolloverCapFor = (ws: PlanBearer & { seats: number }): number =>
    ROLLOVER_CAP_MONTHS * grantFor(ws);

/**
 * What a grant may add given what is already banked. Clips the grant, never the balance, so a
 * purchased credit can never be taken back; the pack credits still in the bank lift the ceiling,
 * so a large pack cannot eat the monthly grant either.
 */
export function clipGrant(grant: number, balance: number, purchased: number, cap: number): number {
    const packHeld = Math.min(Math.max(0, purchased), Math.max(0, balance));
    return Math.min(grant, Math.max(0, cap + packHeld - balance));
}
