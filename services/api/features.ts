import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { FeatureKey, FeatureStatus } from "@model/features";
import { FEATURES } from "@model/features";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace } from "./context";
import { featuresFor } from "../features";
import { AI_TASKS, MODELS, modelFor, PROVIDER_LABEL, PROVIDER_ORDER } from "../ai/models";
import { modelDebugEnabled } from "./model-debug";

export const features = new Hono();

features.get("/features", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const status = {} as Record<FeatureKey, FeatureStatus>;
    for (const k of Object.keys(FEATURES) as FeatureKey[]) status[k] = FEATURES[k].status;
    // Overrides change our cost, not what the user is charged, so the client only offers them when
    // the server says it will honour them.
    return c.json({
        features: featuresFor(ws),
        status,
        modelDebug: modelDebugEnabled()
            ? {
                  tasks: AI_TASKS,
                  models: [...MODELS]
                      .sort(
                          (a, b) =>
                              PROVIDER_ORDER.indexOf(a.provider) -
                              PROVIDER_ORDER.indexOf(b.provider),
                      )
                      .map((m) => ({
                          id: m.id,
                          label: m.label,
                          provider: PROVIDER_LABEL[m.provider],
                      })),
                  defaults: Object.fromEntries(
                      AI_TASKS.map((t) => [t, modelFor(t, featuresFor(ws).textModelTier)]),
                  ),
              }
            : null,
    });
});
