import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { setCookie, deleteCookie } from "hono/cookie";
import type { User } from "@model/workspace";
import { db, schema } from "../schema";
import { readSessionPayload, makeSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../auth";

// Defaults to {} on missing/malformed body, so field checks see undefined.
export async function readJson<T>(c: Context): Promise<T> {
    return (await c.req.json().catch(() => ({}))) as T;
}

// DB user row → the public `User` wire shape (folds the nullable verified timestamp into a boolean).
// Single-sourced so currentUser + the auth routes project identically.
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

// Session cookie policy in one place — login, signup, reset, and the OAuth callbacks all set it the same
// way. httpOnly keeps it out of JS; SameSite=Lax lets it ride the OAuth top-level redirect back; secure
// is on in prod (HTTPS) and off in dev (http).
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
    // reject any session minted before the last password reset — a stolen cookie dies with the reset.
    // Compare at second granularity: makeSession floors iat to whole seconds, so the reset's OWN freshly
    // minted session (same second, but passwordChangedAt keeps sub-second ms) must not be rejected.
    if (u.passwordChangedAt && payload.iat < Math.floor(u.passwordChangedAt.getTime() / 1000))
        return null;
    return toUser(u);
}

export async function firstWorkspaceId(userId: string): Promise<string | null> {
    const ms = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(eq(schema.members.userId, userId));
    return ms[0]?.ws ?? null;
}

// Also lazily rolls the monthly credit window on read (no cron): past the reset date, zero used and push the window a month out.
export async function currentWorkspace(userId: string) {
    const wsId = await firstWorkspaceId(userId);
    if (!wsId) return null;
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, wsId));
    if (!ws) return null;
    if (ws.creditsResetAt.getTime() <= Date.now()) {
        const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 0, creditsResetAt: next })
            .where(eq(schema.workspaces.id, ws.id));
        ws.aiCreditsUsed = 0;
        ws.creditsResetAt = next;
    }
    return ws;
}
