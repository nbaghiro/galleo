import { Hono } from "hono";
import { clientIp } from "@services/utils/http";

// A first-party path for analytics ingest. Galleo is single-origin, so forwarding from our own
// host makes these look like any other request to the app, which is what keeps them alive through
// the ad blockers a meaningful share of this audience runs. The path is not named analytics,
// tracking, or posthog, because blockers match on those.
//
// The upstream is a constant, so this cannot be pointed at anything else.

const UPSTREAM = (): string => process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

// Our session cookie has no business at the ingest host, and it would ride along by default.
const STRIPPED = new Set(["cookie", "host", "authorization", "content-length"]);

export const ingest = new Hono();

ingest.all("/i/*", async (c) => {
    const url = new URL(c.req.url);
    const path = url.pathname.slice("/api/i".length);
    const headers = new Headers();
    for (const [k, v] of c.req.raw.headers) if (!STRIPPED.has(k.toLowerCase())) headers.set(k, v);
    // The ingest host derives geo from this. Without it every event would carry the server's
    // location, which is worse than no location at all.
    headers.set("x-forwarded-for", clientIp(c));

    const method = c.req.method;
    const body = method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer();
    const res = await fetch(`${UPSTREAM()}${path}${url.search}`, { method, headers, body });
    return new Response(res.body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
});
