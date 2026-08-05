import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { setCookie, deleteCookie } from "hono/cookie";
import type { User } from "@model/workspace";
import { db, schema } from "../schema";
import { readSessionPayload, makeSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../auth";
import { creditLimitFor } from "../features";

// Defaults to {} on missing/malformed body, so field checks see undefined.
export async function readJson<T>(c: Context): Promise<T> {
    return (await c.req.json().catch(() => ({}))) as T;
}

// Single-sourced so currentUser and the auth routes project identically.
export function toUser(u: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    emailVerifiedAt: Date | null;
}): User {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        emailVerified: u.emailVerifiedAt !== null,
    };
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

export async function currentUser(token: string | undefined): Promise<User | null> {
    const payload = readSessionPayload(token);
    if (!payload) return null;
    const [u] = await db
        .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
            emailVerifiedAt: schema.users.emailVerifiedAt,
            passwordChangedAt: schema.users.passwordChangedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, payload.uid));
    if (!u) return null;
    // Reject any session minted before the last password reset. Second granularity: makeSession floors
    // iat, so the reset's own freshly minted session (same second) must not be rejected.
    if (u.passwordChangedAt && payload.iat < Math.floor(u.passwordChangedAt.getTime() / 1000))
        return null;
    return toUser(u);
}

export async function firstWorkspaceId(userId: string): Promise<string | null> {
    const ws = await currentWorkspace(userId);
    return ws?.id ?? null;
}

// The user's chosen membership when it's still real, else the oldest (their own, created at signup).
// Also lazily rolls the monthly credit window on read, since there is no cron.
export async function currentWorkspace(userId: string) {
    const rows = await db
        .select({ ws: schema.workspaces, active: schema.users.activeWorkspaceId })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
        .where(eq(schema.members.userId, userId))
        .orderBy(schema.members.createdAt);
    const ws = rows.find((r) => r.ws.id === r.active)?.ws ?? rows[0]?.ws;
    if (!ws) return null;
    if (ws.creditsResetAt.getTime() <= Date.now()) {
        const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 0, creditsResetAt: next })
            .where(eq(schema.workspaces.id, ws.id));
        if (ws.aiCreditsUsed > 0)
            await db.insert(schema.credits).values({
                workspaceId: ws.id,
                delta: ws.aiCreditsUsed,
                reason: "monthly-reset",
                balanceAfter: creditLimitFor(ws),
            });
        ws.aiCreditsUsed = 0;
        ws.creditsResetAt = next;
    }
    return ws;
}
