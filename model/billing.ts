import { THEME_LIST } from "@model/theme";
import { typicalCost } from "@model/tools";

// a plan/seat downgrade parked at period end via a Stripe subscription schedule
export interface ScheduledChange {
    plan: PlanId;
    interval: Interval;
    seats: number;
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
    voiceNarration: boolean; // a piece can read itself aloud
    voiceDesign: boolean; // generate a voice from a description; consumes a shared account slot
    backgroundMusic: boolean; // an instrumental bed under present and preview
    maxWorkspaceVoices: number; // how many voices a shelf holds; -1 = unlimited
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

/**
 * A one-time grant on top of the first monthly allowance, so exploring in the first session does not
 * spend the first month. Free is 100 credits and a generation costs ~42, which is 2.4 generations: a
 * new account cannot try the product twice and still have room after a bad result. This lifts month
 * one to roughly seven.
 *
 * It is a customer-acquisition cost, not a product cost: at CREDIT_USD it is real provider spend per
 * signup, so review it against conversion rather than against the plan's own margin. Released once,
 * on email verification, on a user's first workspace only (services/core/onboarding.ts).
 */
export const SIGNUP_GRANT_CREDITS = 200;

/** What the allowance buys, for the pricing card. */
const gens = (n: number): number => Math.round(n / CREDITS_PER_GENERATION);

/**
 * The seat add-on: a recurring subscription item, because a seat is an ongoing entitlement. It
 * carries credits because a colleague generates work.
 */
export type AddOnId = "seat";

export interface AddOn {
    id: AddOnId;
    label: string;
    priceUsd: number; // per unit, per month
    seats: number;
    credits: number; // added to the monthly grant
}

export const ADD_ONS: Record<AddOnId, AddOn> = {
    seat: { id: "seat", label: "Extra seat", priceUsd: 30, seats: 1, credits: 800 },
};

export const ADD_ON_IDS: AddOnId[] = ["seat"];

export const addOnFor = (id: string | null | undefined): AddOn | null =>
    id === "seat" ? ADD_ONS.seat : null;

/**
 * Credit packs: bought once, not subscribed to. They can share the single balance because unspent
 * credits roll over (see rollCreditWindow), so nothing is ever wiped and a purchase needs no pool of
 * its own. Priced above CREDIT_USD (model/credits.ts) and above every plan's own per-credit rate, so
 * buying capacity outright never undercuts subscribing to it.
 */
export type CreditPackId = "pack-500" | "pack-2k";

export interface CreditPack {
    id: CreditPackId;
    label: string;
    credits: number;
    priceUsd: number;
}

export const CREDIT_PACKS: CreditPack[] = [
    { id: "pack-500", label: "500 credits", credits: 500, priceUsd: 20 },
    { id: "pack-2k", label: "2,000 credits", credits: 2000, priceUsd: 72 },
];

export const packFor = (id: string | null | undefined): CreditPack | null =>
    CREDIT_PACKS.find((p) => p.id === id) ?? null;

export const PLANS: Record<PlanId, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "For trying it out.",
        highlights: [
            `About ${gens(CREDITS_PER_MONTH.free)} AI generations a month`,
            "Up to 10 artifacts",
            `All ${THEME_LIST.length} built-in themes`,
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
            voiceNarration: false,
            voiceDesign: false,
            backgroundMusic: false,
            maxWorkspaceVoices: 0,
        },
    },
    pro: {
        id: "pro",
        name: "Pro",
        tagline: "For creators who ship, solo or as a team.",
        badge: "Most popular",
        highlights: [
            `About ${gens(CREDITS_PER_MONTH.pro)} AI generations a month`,
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
            voiceNarration: true,
            voiceDesign: true,
            backgroundMusic: true,
            maxWorkspaceVoices: 12,
        },
    },
    premium: {
        id: "premium",
        name: "Premium",
        tagline: "For teams that need control.",
        highlights: [
            `${PREMIUM_SEATS} seats · about ${gens(CREDITS_PER_MONTH.premium)} AI generations a month`,
            "Everything in Pro",
            "Admin controls + shared brand kit",
            "Link analytics: views, referrers, engagement",
            "API access",
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
            voiceNarration: true,
            voiceDesign: true,
            backgroundMusic: true,
            maxWorkspaceVoices: -1,
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

/** The recurring add-ons this plan may buy. */
export const addOnsFor = (id: string | null | undefined): AddOn[] =>
    planFor(id).billing.sellsSeats ? [ADD_ONS.seat] : [];

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
/** Whether the plan may buy credit packs, the remedy that works even on the top plan. */
export const canTopUp = (id: string | null | undefined): boolean =>
    planFor(id).billing.sellsCredits;

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
    | "voiceNarration"
    | "voiceDesign"
    | "backgroundMusic"
    | "earlyAccess";

// -1 = unlimited, 0 = none
export type NumFeature =
    | "maxArtifacts"
    | "customDomains"
    | "storageMb"
    | "includedCredits"
    | "maxSectionsPerGeneration"
    | "maxWorkspaceVoices";

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
    voiceNarration: {
        label: "Voice narration",
        status: "live",
        description: "Read a piece aloud in a chosen voice.",
    },
    backgroundMusic: {
        label: "Background music",
        status: "live",
        description: "Play an instrumental bed while a piece is presented.",
    },
    voiceDesign: {
        label: "Designed voices",
        status: "live",
        description: "Generate a new voice from a written description.",
    },
    maxWorkspaceVoices: {
        label: "Saved voices",
        status: "live",
        description: "How many narration voices a workspace can keep.",
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
        status: "live",
        description: "Programmatic access with workspace API credentials.",
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
    voiceNarration: boolean;
    voiceDesign: boolean;
    backgroundMusic: boolean;
    // -1 = unlimited, 0 = none
    maxArtifacts: number;
    customDomains: number;
    storageMb: number;
    includedCredits: number;
    maxSectionsPerGeneration: number;
    maxWorkspaceVoices: number;
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
        voiceNarration: b("voiceNarration", pf.voiceNarration),
        voiceDesign: b("voiceDesign", pf.voiceDesign),
        backgroundMusic: b("backgroundMusic", pf.backgroundMusic),
        maxWorkspaceVoices: n("maxWorkspaceVoices", pf.maxWorkspaceVoices),
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

/** What the workspace pays for in seats; a credit pack is a purchase, not an entitlement. */
export interface AddOnBearer {
    seats: number; // total, including the plan's own
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
 * What the subscription grants each month: the plan's own allowance plus the seat add-on's credits
 * for every seat beyond the included ones. Added to `ai_credits_balance` at each roll rather than
 * replacing it, so leftovers carry. Credit packs are not here; they are a purchase, added to the
 * balance when Stripe confirms them.
 */
export function monthlyGrantFor(ws: PlanBearer & AddOnBearer): number {
    return featuresFor(ws).includedCredits + extraSeatsOf(ws) * ADD_ONS.seat.credits;
}

/** Total seats the subscription pays for: the plan's own plus any seat add-on. */
export const seatsFor = (planId: string | null | undefined, extraSeats: number): number =>
    planFor(planId).billing.includedSeats + Math.max(0, extraSeats);
