import type { Context } from "hono";
import { parseOverrides, type ModelOverrides } from "../ai/models";

// The client may pin any step to a specific model. Only ids the registry serves survive parsing, so
// a stale or hand-edited header degrades to the default rather than routing a call to nothing.
export const MODEL_HEADER = "x-galleo-models";

export const overridesFrom = (c: Context): ModelOverrides =>
    parseOverrides(c.req.header(MODEL_HEADER));
