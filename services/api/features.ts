import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { FeatureKey, FeatureStatus } from "@model/features";
import { FEATURES } from "@model/features";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace } from "./context";
import { featuresFor } from "../features";

export const features = new Hono();

features.get("/features", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const status = {} as Record<FeatureKey, FeatureStatus>;
    for (const k of Object.keys(FEATURES) as FeatureKey[]) status[k] = FEATURES[k].status;
    return c.json({ features: featuresFor(ws), status });
});
