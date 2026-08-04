import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { SearchResponse } from "@model/artifact";
import { SESSION_COOKIE } from "../auth";
import { recentArtifacts, searchArtifacts } from "../search/query";
import { currentUser, firstWorkspaceId } from "./context";
import { rateLimit } from "./ratelimit";

export const search = new Hono();

// One request per keystroke burst (the client debounces), so the ceiling only has to stop a runaway loop.
const searchLimiter = rateLimit({ name: "search", limit: 240, windowMs: 60_000 });

const MAX_QUERY = 200; // longer than any real jump-to query; keeps the tsquery bounded

// Empty q is the ⌘K landing state (recents), not an error.
search.get("/search", searchLimiter, async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ artifacts: [], took: 0 } satisfies SearchResponse);
    const q = (c.req.query("q") ?? "").trim().slice(0, MAX_QUERY);
    const limit = Number(c.req.query("limit"));
    const offset = Number(c.req.query("offset"));
    const started = Date.now();
    const artifacts = q
        ? await searchArtifacts({ workspaceId: ws, userId: u.id, query: q, limit, offset })
        : await recentArtifacts({ workspaceId: ws, userId: u.id, limit });
    return c.json({ artifacts, took: Date.now() - started } satisfies SearchResponse);
});
