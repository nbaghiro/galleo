import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { z, type ZodType } from "zod";
import { setCookie, deleteCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { BoolFeature, NumFeature, PlanBearer } from "@model/billing";
import { can, canTopUp, canUpgradeFrom, featuresFor, limit, withinLimit } from "@model/billing";
import { makeSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./auth";
import { capture } from "./analytics";

// The HTTP toolkit: everything here is database-free, so it stays unit-testable. Anything that
// reads a row lives in domain/ (see domain/accounts.ts for the session/workspace readers).

// The one 402 body every metered route returns. Which remedies apply depends on the plan and both
// can be false-y at once in neither direction: Premium has nothing above it to upgrade to, and Free
// may not buy packs, so a body that always said "upgrade" told a Premium workspace to do the one
// thing it cannot.
export const OUT_OF_CREDITS = (ws: PlanBearer, remaining: number) => ({
    error: "out of AI credits",
    remaining,
    upgrade: canUpgradeFrom(ws.plan),
    topUp: canTopUp(ws.plan),
});

// A member who hit their own ceiling, not the workspace's. Neither remedy applies: the pool may be
// full, and only an admin can raise the cap, so the body says who to ask instead of offering a sale.
export const OVER_MEMBER_CAP = (cap: number, remaining: number) => ({
    error: `You've used your ${cap.toLocaleString()} credit limit for this cycle. A workspace admin can raise it.`,
    remaining,
});

// A body is untrusted input, so a route states the shape it accepts and gets null when the body
// does not match. Null rather than a throw keeps the 400 in the route, beside its other failures.
//
// Schemas that carry stored content must not drop fields the route never enumerates, so use
// z.looseObject (or a guard via z.custom) there: a plain z.object strips unknown keys, which on a
// write path is silent data loss rather than validation.
// An absent body reads as {}, so a route whose fields are all optional still works when called with
// no body at all (POST /workspace/leave). The raw text is read first because c.req.json() fails the
// same way for "nothing was sent" and "what was sent is not JSON", and only the second is a 400.
export async function readJson<T>(c: Context, schema: ZodType<T>): Promise<T | null> {
    const raw = await c.req.text().catch(() => "");
    let value: unknown = {};
    if (raw.trim() !== "") {
        try {
            value = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

// The same rule one content type over. OAuth speaks form-encoded rather than JSON, and hono hands
// those back as `string | File`, so a route reading them by hand ends up coercing every field
// itself; this states the shape once instead. Repeated fields arrive as arrays (the consent screen's
// workspace checkboxes), so `all` is on and a schema asks for what it wants.
export async function readForm<T>(c: Context, schema: ZodType<T>): Promise<T | null> {
    const form = await c.req.parseBody({ all: true }).catch(() => null);
    if (!form) return null;
    const parsed = schema.safeParse(form);
    return parsed.success ? parsed.data : null;
}

/** A form field that must be a single string; anything else (a file, a repeat) reads as absent. */
export const zFormText = z
    .union([z.string(), z.instanceof(File), z.array(z.unknown())])
    .optional()
    .transform((v) => (typeof v === "string" ? v : ""));

/** A repeatable form field, as the list of its string values. */
export const zFormList = z
    .union([z.string(), z.instanceof(File), z.array(z.unknown())])
    .optional()
    .transform((v) =>
        typeof v === "string"
            ? [v]
            : Array.isArray(v)
              ? v.filter((x): x is string => typeof x === "string")
              : [],
    );

export const BAD_BODY = { error: "invalid request body" } as const;

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
    // What to count per. Defaults to the client address, which is right for anything a browser
    // reaches directly and wrong for a delegated caller: every user of one directory client arrives
    // from a handful of that vendor's egress addresses, so one bucket would hold all of them.
    by?: (c: Context) => string | null;
}

// Never key on `X-Forwarded-For`: it's client-settable, so anyone could rotate it for a fresh bucket.
// Render's Cloudflare front overwrites CF-Connecting-IP with the real client; override for other proxies.
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER ?? "cf-connecting-ip").toLowerCase();

/** A stable, non-reversible stand-in for an address, so a raw IP never leaves the process. */
export const anonId = (key: string): string =>
    createHash("sha256").update(key).digest("hex").slice(0, 32);

export function clientIp(c: Context): string {
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
    let sweepAt = 0; // next full sweep; once per window keeps the map bounded at O(live windows)

    return async (c, next) => {
        const now = Date.now();
        const by = options.by?.(c) ?? null;
        // a limiter that cannot identify its caller falls back to the address rather than to nothing
        const key = `${options.name}:${by ?? clientIp(c)}`;
        let w = buckets.get(key);
        if (!w || now >= w.resetAt) {
            w = { count: 0, resetAt: now + options.windowMs };
            buckets.set(key, w);
        }
        w.count++;

        // periodic sweep so the map doesn't grow unbounded across many distinct client IPs
        // (a size trigger would turn into an every-request O(n) scan once past its threshold)
        if (now >= sweepAt) {
            sweepAt = now + options.windowMs;
            for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
        }

        if (w.count > options.limit) {
            // Most limited routes have no session (signup, login, reset), so something has to stand
            // in for a person. It is a hash of the bucket key, never the address itself: a raw IP
            // is on the do-not-collect list, and this only has to be stable, not reversible.
            capture({ userId: anonId(key), anonymous: true }, "quota_rate_limited", {
                route: options.name,
                plan_id: "free",
            });
            c.header("Retry-After", String(Math.ceil((w.resetAt - now) / 1000)));
            return c.json({ error: "Too many attempts. Please wait a bit and try again." }, 429);
        }
        return next();
    };
}
