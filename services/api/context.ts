import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { User } from "@model/workspace";
import { db, schema } from "../schema";
import { readSession } from "../auth";

// Shared route helpers: request-body parsing + the auth / workspace lookups every router needs.

// Parse a JSON request body, defaulting to `{}` on missing/malformed input (so field checks just see
// undefined). The generic is the caller's declared body shape.
export async function readJson<T>(c: Context): Promise<T> {
    return (await c.req.json().catch(() => ({}))) as T;
}

// The signed-in user for a session token, or null. Used at the top of every authenticated route.
export async function currentUser(token: string | undefined): Promise<User | null> {
    const uid = readSession(token);
    if (!uid) return null;
    const [u] = await db
        .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(eq(schema.users.id, uid));
    return u ?? null;
}

// A user's (single, for now) workspace id — the scope every artifact/folder/theme query filters on.
export async function firstWorkspaceId(userId: string): Promise<string | null> {
    const ms = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(eq(schema.members.userId, userId));
    return ms[0]?.ws ?? null;
}

// The full workspace row (plan + billing + credits) — for the routes that gate on features, not just
// scope by id. Also rolls the monthly credit window over lazily on read: once the reset date passes,
// zero the used counter and push the window a month out, so free/paid allowances refill without a cron.
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
