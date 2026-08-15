import { Hono } from "hono";
import type { FeatureKey, FeatureStatus } from "@model/billing";
import { FEATURES, featuresFor } from "@model/billing";
import { modelCatalogue } from "@services/core/models";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

export const features = new Hono<WorkspaceEnv>();

// The client's boot read: what this workspace may do, how far each feature has shipped, and the
// model catalogue the picker renders.
features.get("/features", requireWorkspace, (c) => {
    const resolved = featuresFor(c.get("ws"));
    const status = {} as Record<FeatureKey, FeatureStatus>;
    for (const k of Object.keys(FEATURES) as FeatureKey[]) status[k] = FEATURES[k].status;
    return c.json({
        features: resolved,
        status,
        models: modelCatalogue(resolved.textModelTier),
    });
});
