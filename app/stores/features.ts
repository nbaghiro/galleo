import { createSignal } from "solid-js";
import type { BoolFeature, FeatureKey, FeatureStatus, NumFeature } from "@model/features";
import { featureStatus } from "@model/features";
import type { FeaturesState } from "../api";
import { api } from "../api";

// The workspace's resolved feature set + each capability's launch status, loaded on demand for gating UI
// (locks, "coming soon" badges) from the same source the backend enforces. Mirrors the billing store's
// shape; see @model/features. Defaults to "not granted" until loaded, so UI fails safe.
const [featuresState, setFeaturesState] = createSignal<FeaturesState | null>(null);
export { featuresState };

export async function loadFeatures(): Promise<void> {
    try {
        setFeaturesState(await api.getFeatures());
    } catch {
        // signed out / no workspace — leave null; callers treat missing as "not granted"
    }
}

// Gate readers over the loaded state.
export const can = (key: BoolFeature): boolean => featuresState()?.features[key] ?? false;
export const featureLimit = (key: NumFeature): number => featuresState()?.features[key] ?? 0;
// A feature's launch status — "planned" ⇒ show "coming soon". Falls back to the registry when unloaded.
export const statusOf = (key: FeatureKey): FeatureStatus =>
    featuresState()?.status[key] ?? featureStatus(key);
export const isComingSoon = (key: FeatureKey): boolean => statusOf(key) === "planned";
