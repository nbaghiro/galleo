import type { Context, MiddlewareHandler } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { BoolFeature, NumFeature, PlanBearer } from "@model/billing";
import { can, featuresFor, limit, withinLimit } from "@model/billing";
import { makeSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./auth";

// The HTTP toolkit: everything here is database-free, so it stays unit-testable. Anything that
// reads a row lives in domain/ (see domain/accounts.ts for the session/workspace readers).

// the one 402 body every metered route returns, so the client's upgrade prompt has a single shape
export const OUT_OF_CREDITS = (remaining: number) =>
    ({ error: "out of AI credits", upgrade: true, remaining }) as const;

// Defaults to {} on missing/malformed body, so field checks see undefined.
export async function readJson<T>(c: Context): Promise<T> {
    return (await c.req.json().catch(() => ({}))) as T;
}

// One place for the policy: SameSite=Lax lets the cookie ride the OAuth top-level redirect back, and
// secure is prod-only because dev is http.
export function setSessionCookie(c: Context, userId: string): void {
    setCookie(c, SESSION_COOKIE, makeSession(userId), {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
}

export function clearSessionCookie(c: Context): void {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// Route guards over the entitlement resolver: null = allowed, else the 402 response to return as-is.
export function requireFeature(
    c: Context,
    ws: PlanBearer,
    key: BoolFeature,
    message: string,
): Response | null {
    return can(featuresFor(ws), key) ? null : c.json({ error: message, upgrade: true }, 402);
}

export function checkLimit(
    c: Context,
    ws: PlanBearer,
    key: NumFeature,
    current: number,
    message?: (cap: number) => string,
): Response | null {
    const f = featuresFor(ws);
    if (withinLimit(f, key, current)) return null;
    const cap = limit(f, key);
    return c.json(
        {
            error: message?.(cap) ?? `Your plan is limited to ${cap} — upgrade for more.`,
            upgrade: true,
        },
        402,
    );
}

// Fixed-window and per-process: buckets reset on restart and aren't shared across instances.

interface RateWindow {
    count: number;
    resetAt: number; // epoch ms when the window rolls over
}

interface RateLimitOptions {
    name: string; // namespaces buckets so separate limiters don't collide
    limit: number;
    windowMs: number;
}

// Never key on `X-Forwarded-For`: it's client-settable, so anyone could rotate it for a fresh bucket.
// Render's Cloudflare front overwrites CF-Connecting-IP with the real client; override for other proxies.
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
