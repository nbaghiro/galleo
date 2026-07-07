import type { PlanId } from "@model/billing";
import type { Features } from "@model/features";
import { resolveFeatures } from "@model/features";

// The single backend accessor for a workspace's resolved feature set — plan grants narrowed by each
// feature's launch status (and, once the feature_overrides column ships, per-workspace overrides). Every
// gate reads this instead of the plan directly, so enforcement asks "can this workspace do X?" rather
// than "what plan is it on?". The monthly credit window is rolled in currentWorkspace() on read.
export function featuresFor(ws: { plan: string | null }): Features {
    return resolveFeatures((ws.plan ?? "free") as PlanId);
}
