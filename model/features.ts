// The feature registry — the single source of truth for what capabilities EXIST in the product,
// independent of any plan. Billing is only ONE input to "can this workspace do X"; the other two are a
// feature's global launch status and per-workspace overrides:
//
//   effective(feature) = status !== "planned"  &&  ( plan grants it || override grants it )
//
// `status` is the honesty layer: a `planned` feature is off for everyone (a pricing card may still
// advertise it as "coming soon"); `live` / `beta` features can be granted by a plan or an override.
// Enforcement never reads a plan directly — it reads a workspace's resolved Features via can() / limit().

import type { ExportFormat, ModelTier, PlanId } from "@model/billing";
import { isUnlimited, planFor } from "@model/billing";

export type FeatureStatus = "live" | "beta" | "planned";

// Boolean capabilities.
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

// Numeric capabilities (-1 = unlimited, 0 = none).
export type NumFeature =
    | "maxArtifacts"
    | "maxMembers"
    | "customDomains"
    | "storageMb"
    | "creditsPerMonth"
    | "maxSectionsPerGeneration";

// Enum / list capabilities.
export type EnumFeature = "exportFormats" | "textModelTier" | "imageModelTier";

export type FeatureKey = BoolFeature | NumFeature | EnumFeature;

interface FeatureDef {
    label: string; // human name for the UI
    status: FeatureStatus;
    description: string; // one line, for the pricing table + tooltips
}

// Every gateable capability + its launch status. Flip a `planned` → `live` here the day a feature ships
// and it starts being granted wherever a plan lists it (no other change). `🔶` = AI/credit session owns
// the value and, effectively, when it goes live.
export const FEATURES: Record<FeatureKey, FeatureDef> = {
    // live — built + enforced today
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
        status: "live", // 🔶 spend enforced by the AI/credit session
        description: "AI generation budget per month.",
    },
    // beta — the AI/credit session is building the enforcement
    maxSectionsPerGeneration: {
        label: "Sections per generation",
        status: "beta", // 🔶
        description: "Cap on how large one AI generation can be.",
    },
    textModelTier: {
        label: "AI text model",
        status: "beta", // 🔶
        description: "Which text models the generator may use.",
    },
    imageModelTier: {
        label: "AI image model",
        status: "beta", // 🔶
        description: "Which image models media generation may use.",
    },
    // planned — advertised on cards, off for everyone until built
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
        status: "planned",
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

// A workspace's resolved feature set: plan grants, narrowed by each feature's launch status and widened
// by per-workspace overrides. Read via can() / limit(); produced by resolveFeatures().
export interface Features {
    planId: PlanId;
    // booleans
    removeBranding: boolean;
    customThemes: boolean;
    workspaceThemes: boolean;
    publicLinks: boolean;
    analytics: boolean;
    apiAccess: boolean;
    sso: boolean;
    prioritySupport: boolean;
    earlyAccess: boolean;
    // numbers (-1 = unlimited, 0 = none)
    maxArtifacts: number;
    maxMembers: number;
    customDomains: number;
    storageMb: number;
    creditsPerMonth: number;
    maxSectionsPerGeneration: number;
    // enums / lists
    exportFormats: ExportFormat[];
    textModelTier: ModelTier;
    imageModelTier: ModelTier;
}

// A per-workspace patch (stored in workspaces.feature_overrides jsonb) — comps, grandfathering, beta
// grants. Applied on top of plan grants for LIVE/BETA features only; an override can't conjure a
// capability that isn't built (a `planned` feature stays off).
export type FeatureOverrides = Partial<Omit<Features, "planId">>;

// Resolve a plan (+ optional overrides) into the effective feature set. Pure — the single place the three
// inputs (plan grant · launch status · override) combine.
export function resolveFeatures(planId: PlanId, overrides?: FeatureOverrides): Features {
    const p = planFor(planId);
    const pf = p.features;

    // gate a plan value by launch status, then let an override widen it (only when launched).
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

// Enforcement accessors.
export const can = (f: Features, key: BoolFeature): boolean => f[key];
export const limit = (f: Features, key: NumFeature): number => f[key];
// true when `current` usage is within the feature's numeric limit (-1 = unlimited).
export const withinLimit = (f: Features, key: NumFeature, current: number): boolean =>
    isUnlimited(f[key]) || current < f[key];
