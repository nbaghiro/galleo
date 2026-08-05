import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, readJson } from "./context";
import { sendWorkspaceInvite } from "../mail/send";

// Invite acceptance is possession-based: the raw token lives only in the emailed link.

export const workspace = new Hono();

const APP_URL = process.env.APP_URL ?? "http://localhost:8600";
const INVITE_TTL_DAYS = 14;

const hashToken = (raw: string): string => createHash("sha256").update(raw).digest("hex");
const newToken = (): string => randomBytes(24).toString("base64url");
const inviteUrl = (token: string): string => `${APP_URL}/invite/${token}`;

async function liveMembers(wsId: string) {
    return db
        .select({
            userId: schema.members.userId,
            role: schema.members.role,
            joinedAt: schema.members.createdAt,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
        .where(eq(schema.members.workspaceId, wsId))
        .orderBy(schema.members.createdAt);
}

async function pendingInvites(wsId: string) {
    return db
        .select({
            id: schema.invites.id,
            email: schema.invites.email,
            createdAt: schema.invites.createdAt,
            expiresAt: schema.invites.expiresAt,
        })
        .from(schema.invites)
        .where(
            and(
                eq(schema.invites.workspaceId, wsId),
                isNull(schema.invites.acceptedAt),
                gt(schema.invites.expiresAt, new Date()),
            ),
        )
        .orderBy(schema.invites.createdAt);
}

workspace.get("/workspace", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const isOwner = ws.ownerId === u.id;
    const [members, invites, memberships] = await Promise.all([
        liveMembers(ws.id),
        isOwner ? pendingInvites(ws.id) : Promise.resolve([]),
        db
            .select({ id: schema.workspaces.id, name: schema.workspaces.name })
            .from(schema.members)
            .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
            .where(eq(schema.members.userId, u.id))
            .orderBy(schema.members.createdAt),
    ]);
    return c.json({
        workspace: { id: ws.id, name: ws.name, plan: ws.plan, seats: ws.seats },
        role: isOwner ? "owner" : "member",
        members: members.map((m) => ({ ...m, isOwner: m.userId === ws.ownerId })),
        invites,
        memberships: memberships.map((m) => ({ ...m, active: m.id === ws.id })),
    });
});

// Returns the accept URL as well as mailing it, so an unconfigured-mail dev setup stays usable.
workspace.post("/workspace/invites", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (ws.ownerId !== u.id)
        return c.json({ error: "only the workspace owner can invite members" }, 403);
    const { email } = await readJson<{ email?: string }>(c);
    const target = email?.trim().toLowerCase();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))
        return c.json({ error: "a valid email is required" }, 400);

    const members = await liveMembers(ws.id);
    if (members.some((m) => m.email.toLowerCase() === target))
        return c.json({ error: "already a member" }, 409);
    const pending = await pendingInvites(ws.id);
    const existing = pending.find((i) => i.email.toLowerCase() === target);
    // seat cap = members + outstanding invites (an unexpired invite holds its seat)
    if (!existing && members.length + pending.length >= ws.seats)
        return c.json(
            {
                error: `All ${ws.seats} seats are taken — add seats to invite more people.`,
                upgrade: true,
            },
            402,
        );

    const token = newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const [invite] = await db
        .insert(schema.invites)
        .values({
            workspaceId: ws.id,
            email: target,
            tokenHash: hashToken(token),
            invitedBy: u.id,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: [schema.invites.workspaceId, schema.invites.email],
            // re-inviting refreshes the token + window (and revives an expired/accepted row)
            set: {
                tokenHash: hashToken(token),
                invitedBy: u.id,
                expiresAt,
                acceptedAt: null,
                createdAt: sql`now()`,
            },
        })
        .returning({
            id: schema.invites.id,
            email: schema.invites.email,
            createdAt: schema.invites.createdAt,
            expiresAt: schema.invites.expiresAt,
        });
    const url = inviteUrl(token);
    const sent = await sendWorkspaceInvite({
        to: target,
        workspaceName: ws.name,
        inviterName: u.name,
        url,
    });
    return c.json({ invite, url, sent });
});

workspace.delete("/workspace/invites/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (ws.ownerId !== u.id)
        return c.json({ error: "only the workspace owner can revoke invites" }, 403);
    await db
        .delete(schema.invites)
        .where(
            and(eq(schema.invites.id, c.req.param("id")), eq(schema.invites.workspaceId, ws.id)),
        );
    return c.json({ ok: true });
});

async function inviteByToken(token: string) {
    const [row] = await db
        .select({ invite: schema.invites, ws: schema.workspaces })
        .from(schema.invites)
        .innerJoin(schema.workspaces, eq(schema.invites.workspaceId, schema.workspaces.id))
        .where(eq(schema.invites.tokenHash, hashToken(token)));
    if (!row || row.invite.acceptedAt || row.invite.expiresAt.getTime() <= Date.now()) return null;
    return row;
}

// Auth required: the accept page sits behind the app's sign-in gate.
workspace.get("/invites/:token", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const row = await inviteByToken(c.req.param("token"));
    if (!row) return c.json({ error: "invite not found or expired" }, 404);
    return c.json({ workspace: row.ws.name, email: row.invite.email });
});

workspace.post("/invites/accept", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { token } = await readJson<{ token?: string }>(c);
    if (!token) return c.json({ error: "token required" }, 400);
    const row = await inviteByToken(token);
    if (!row) return c.json({ error: "invite not found or expired" }, 404);

    // seats may have shrunk since the invite went out — recheck at the door
    const members = await liveMembers(row.ws.id);
    const already = members.some((m) => m.userId === u.id);
    if (!already && members.length >= row.ws.seats)
        return c.json({ error: "this workspace is out of seats" }, 402);

    if (!already)
        await db
            .insert(schema.members)
            .values({ workspaceId: row.ws.id, userId: u.id, role: row.invite.role })
            .onConflictDoNothing();
    await db
        .update(schema.invites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.invites.id, row.invite.id));
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: row.ws.id })
        .where(eq(schema.users.id, u.id));
    return c.json({ ok: true, workspaceId: row.ws.id, name: row.ws.name });
});

workspace.delete("/workspace/members/:userId", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (ws.ownerId !== u.id)
        return c.json({ error: "only the workspace owner can remove members" }, 403);
    const target = c.req.param("userId");
    if (target === ws.ownerId) return c.json({ error: "the owner can't be removed" }, 400);
    await db
        .delete(schema.members)
        .where(and(eq(schema.members.workspaceId, ws.id), eq(schema.members.userId, target)));
    // if they were working in this workspace, drop them back to their own on next read
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: null })
        .where(and(eq(schema.users.id, target), eq(schema.users.activeWorkspaceId, ws.id)));
    return c.json({ ok: true });
});

workspace.post("/workspace/switch", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { workspaceId } = await readJson<{ workspaceId?: string }>(c);
    if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
    const [membership] = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(and(eq(schema.members.userId, u.id), eq(schema.members.workspaceId, workspaceId)));
    if (!membership) return c.json({ error: "not a member of that workspace" }, 403);
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: workspaceId })
        .where(eq(schema.users.id, u.id));
    return c.json({ ok: true });
});
