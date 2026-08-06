import { Hono } from "hono";
import type { SearchResponse } from "@model/artifact";
import { rateLimit } from "../utils/http";
import { currentWorkspace } from "../core/accounts";
import { recentArtifacts, searchArtifacts } from "../core/search";
import { requireUser, type AuthedEnv } from "./middleware";

export const search = new Hono<AuthedEnv>();

// The client debounces, so the ceiling only has to stop a runaway loop.
const searchLimiter = rateLimit({ name: "search", limit: 240, windowMs: 60_000 });

const MAX_QUERY = 200; // longer than any real jump-to query; keeps the tsquery bounded

// Empty q is the ⌘K landing state (recents), not an error; so is having no workspace yet.
search.get("/search", searchLimiter, requireUser, async (c) => {
    const user = c.get("user");
    const ws = await currentWorkspace(user.id);
    if (!ws) return c.json({ artifacts: [], took: 0 } satisfies SearchResponse);
    const q = (c.req.query("q") ?? "").trim().slice(0, MAX_QUERY);
    const limit = Number(c.req.query("limit"));
    const offset = Number(c.req.query("offset"));
    const started = Date.now();
    const artifacts = q
        ? await searchArtifacts({ workspaceId: ws.id, userId: user.id, query: q, limit, offset })
        : await recentArtifacts({ workspaceId: ws.id, userId: user.id, limit });
    return c.json({ artifacts, took: Date.now() - started } satisfies SearchResponse);
});
