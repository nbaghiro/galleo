import { createSignal } from "solid-js";
import type {
    BoolFeature,
    ExportFormat,
    FeatureKey,
    FeatureStatus,
    NumFeature,
} from "@model/billing";
import type { PlanId } from "@model/billing";
import { featureStatus, PLANS, resolveFeatures } from "@model/billing";
import { capture } from "@ui/analytics";
import { billing } from "./billing";
import type { FeaturesState } from "@app/api";
import { api } from "@app/api";

const [featuresState, setFeaturesState] = createSignal<FeaturesState | null>(null);
export { featuresState };

export async function loadFeatures(): Promise<void> {
    try {
        setFeaturesState(await api.getFeatures());
    } catch {
        // signed out / no workspace — callers treat missing as "not granted"
    }
}

// Read through these, never through limitsFor(plan): only the resolved set carries the workspace's
// featureOverrides and each feature's launch status. Before /features loads, Free is the safe answer.
export const can = (key: BoolFeature): boolean => featuresState()?.features[key] ?? false;
export const limitOf = (key: NumFeature): number =>
    featuresState()?.features[key] ?? resolveFeatures("free")[key];
export const exportFormatsOf = (): ExportFormat[] =>
    featuresState()?.features.exportFormats ?? PLANS.free.features.exportFormats;
export const statusOf = (key: FeatureKey): FeatureStatus =>
    featuresState()?.status[key] ?? featureStatus(key);

/**
 * Report a wall the product just showed someone.
 *
 * Deliberately silent until `/features` has landed: before it does, `can()` reads false for every
 * feature, so a gate rendered during load would report a paywall for a workspace that has the
 * feature. That is not a rare race, it is the default path for any surface that loads its own
 * features (the share modal does exactly this).
 *
 * Safe to call from anywhere, including repeatedly: a caller that fires before we know simply says
 * nothing, so a wall moving to a new surface keeps working without carrying the guard with it.
 *
 * Returns whether it reported, so a caller that wants to try again once the plan is known can.
 */
export function reportPaywall(feature: FeatureKey, upgradeTarget?: PlanId): boolean {
    if (!featuresState()) return false;
    capture("paywall_hit", {
        feature,
        plan_id: billing()?.plan ?? "free",
        upgrade_offered: !!upgradeTarget,
        ...(upgradeTarget ? { upgrade_target: upgradeTarget } : {}),
    });
    return true;
}
