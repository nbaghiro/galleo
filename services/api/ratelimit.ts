import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

// In-memory fixed-window limiter for the auth endpoints. Per-process (resets on restart, not shared across
// instances); a Redis-backed limiter would replace it if we run more than one API node.

interface RateWindow {
    count: number;
    resetAt: number; // epoch ms when the window rolls over
}

interface RateLimitOptions {
    name: string; // namespaces buckets so separate limiters don't collide
    limit: number;
    windowMs: number;
}

// Never key on `X-Forwarded-For` — it's client-settable, so anyone could rotate it for a fresh bucket. Use
// the platform's trusted client-IP header: Render's Cloudflare front overwrites CF-Connecting-IP with the
// real client. Dev buckets everything under the Vite proxy peer (fine). Override for a different proxy.
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER ?? "cf-connecting-ip").toLowerCase();

function clientIp(c: Context): string {
    const trusted = c.req.header(CLIENT_IP_HEADER)?.trim();
    if (trusted) return trusted;
    try {
        return getConnInfo(c).remote.address ?? "unknown";
    } catch {
        return "unknown";
    }
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
    const buckets = new Map<string, RateWindow>();

    return async (c, next) => {
        const now = Date.now();
        const key = `${options.name}:${clientIp(c)}`;
        let w = buckets.get(key);
        if (!w || now >= w.resetAt) {
            w = { count: 0, resetAt: now + options.windowMs };
            buckets.set(key, w);
        }
        w.count++;

        // opportunistic sweep so the map doesn't grow unbounded across many distinct client IPs
        if (buckets.size > 5000) {
            for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
        }

        if (w.count > options.limit) {
            c.header("Retry-After", String(Math.ceil((w.resetAt - now) / 1000)));
            return c.json({ error: "Too many attempts. Please wait a bit and try again." }, 429);
        }
        return next();
    };
}
