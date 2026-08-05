import type { Context } from "hono";
import { parseOverrides, type ModelOverrides } from "../ai/models";

// Picking the model per step is a debugging affordance, not a product feature: a heavier model costs
// us more while the user is charged the same flat per-tool price. So the server only honours the
// header when an operator has switched it on, and the client only offers the panel when it's on.
export const modelDebugEnabled = (): boolean => process.env.AI_MODEL_DEBUG === "1";

export const MODEL_HEADER = "x-galleo-models";

export function overridesFrom(c: Context): ModelOverrides {
    if (!modelDebugEnabled()) return {};
    return parseOverrides(c.req.header(MODEL_HEADER));
}
