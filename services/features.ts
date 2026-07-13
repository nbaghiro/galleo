import type { PlanId } from "@model/billing";
import type { FeatureOverrides, Features } from "@model/features";
import { resolveFeatures } from "@model/features";

export function featuresFor(ws: {
    plan: string | null;
    featureOverrides?: FeatureOverrides | null;
}): Features {
    return resolveFeatures((ws.plan ?? "free") as PlanId, ws.featureOverrides ?? undefined);
}
