import { createSignal } from "solid-js";
import type { BoolFeature, ExportFormat, FeatureKey, FeatureStatus } from "@model/billing";
import { featureStatus, PLANS } from "@model/billing";
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
export const exportFormatsOf = (): ExportFormat[] =>
    featuresState()?.features.exportFormats ?? PLANS.free.features.exportFormats;
export const statusOf = (key: FeatureKey): FeatureStatus =>
    featuresState()?.status[key] ?? featureStatus(key);
