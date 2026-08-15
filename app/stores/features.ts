import { createSignal } from "solid-js";
import type { BoolFeature, FeatureKey, FeatureStatus } from "@model/billing";
import { featureStatus } from "@model/billing";
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

export const can = (key: BoolFeature): boolean => featuresState()?.features[key] ?? false;
export const statusOf = (key: FeatureKey): FeatureStatus =>
    featuresState()?.status[key] ?? featureStatus(key);
export const isComingSoon = (key: FeatureKey): boolean => statusOf(key) === "planned";
