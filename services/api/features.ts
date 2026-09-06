import { Hono } from "hono";
import { featuresFor } from "@model/billing";
import { modelCatalogue } from "@services/core/models";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

export const features = new Hono<WorkspaceEnv>();

// The client's boot read: what this workspace may do, and the model catalogue the picker renders.
features.get("/features", requireWorkspace, (c) =>
    c.json({ features: featuresFor(c.get("ws")), models: modelCatalogue() }),
);
