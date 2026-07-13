import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { User } from "@model/workspace";
import { db, schema } from "../schema";
import { readSession } from "../auth";

// Defaults to {} on missing/malformed body, so field checks see undefined.
export async function readJson<T>(c: Context): Promise<T> {
    return (await c.req.json().catch(() => ({}))) as T;
}

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
