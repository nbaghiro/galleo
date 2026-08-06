import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { appUrl } from "../utils/env";
import { sendWorkspaceInvite } from "./mail";
import type { WorkspaceRow } from "./accounts";

// Members, seats, and invites. Invite acceptance is possession-based: the raw token lives only in
// the emailed link, so only its hash is stored.

const INVITE_TTL_DAYS = 14;

const hashToken = (raw: string): string => createHash("sha256").update(raw).digest("hex");
const newToken = (): string => randomBytes(24).toString("base64url");
const inviteUrl = (token: string): string => appUrl(`/invite/${token}`);

export function liveMembers(workspaceId: string) {
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
        .where(eq(schema.members.workspaceId, workspaceId))
        .orderBy(schema.members.createdAt);
}

export function pendingInvites(workspaceId: string) {
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
                eq(schema.invites.workspaceId, workspaceId),
                isNull(schema.invites.acceptedAt),
                gt(schema.invites.expiresAt, new Date()),
            ),
        )
        .orderBy(schema.invites.createdAt);
}

export function membershipsOf(userId: string) {
    return db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .where(eq(schema.members.userId, userId))
        .orderBy(schema.members.createdAt);
}

export type InviteResult =
    | { error: "already-member" }
    | { error: "no-seats"; seats: number }
    | { invite: Awaited<ReturnType<typeof pendingInvites>>[number]; url: string; sent: boolean };

// Returns the accept URL as well as mailing it, so an unconfigured-mail dev setup stays usable.
export async function inviteMember(
    ws: WorkspaceRow,
    inviter: { id: string; name: string | null },
    email: string,
): Promise<InviteResult> {
    const members = await liveMembers(ws.id);
    if (members.some((m) => m.email.toLowerCase() === email)) return { error: "already-member" };
    const pending = await pendingInvites(ws.id);
    const existing = pending.find((i) => i.email.toLowerCase() === email);
    // seat cap = members + outstanding invites (an unexpired invite holds its seat)
    if (!existing && members.length + pending.length >= ws.seats)
        return { error: "no-seats", seats: ws.seats };

    const token = newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const [invite] = await db
        .insert(schema.invites)
        .values({
            workspaceId: ws.id,
            email,
            tokenHash: hashToken(token),
            invitedBy: inviter.id,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: [schema.invites.workspaceId, schema.invites.email],
            // re-inviting refreshes the token + window (and revives an expired/accepted row)
            set: {
                tokenHash: hashToken(token),
                invitedBy: inviter.id,
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
        to: email,
        workspaceName: ws.name,
        inviterName: inviter.name,
        url,
    });
    return { invite: invite!, url, sent };
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
    await db
        .delete(schema.invites)
        .where(and(eq(schema.invites.id, inviteId), eq(schema.invites.workspaceId, workspaceId)));
}

export async function inviteByToken(token: string) {
    const [row] = await db
        .select({ invite: schema.invites, ws: schema.workspaces })
        .from(schema.invites)
        .innerJoin(schema.workspaces, eq(schema.invites.workspaceId, schema.workspaces.id))
        .where(eq(schema.invites.tokenHash, hashToken(token)));
    if (!row || row.invite.acceptedAt || row.invite.expiresAt.getTime() <= Date.now()) return null;
    return row;
}

export type AcceptResult = { error: "no-seats" } | { workspaceId: string; name: string };

// Seats may have shrunk since the invite went out, so the cap is rechecked at the door.
export async function acceptInvite(token: string, userId: string): Promise<AcceptResult | null> {
    const row = await inviteByToken(token);
    if (!row) return null;
    const members = await liveMembers(row.ws.id);
    const already = members.some((m) => m.userId === userId);
    if (!already && members.length >= row.ws.seats) return { error: "no-seats" };

    if (!already)
        await db
            .insert(schema.members)
            .values({ workspaceId: row.ws.id, userId, role: row.invite.role })
            .onConflictDoNothing();
    await db
        .update(schema.invites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.invites.id, row.invite.id));
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: row.ws.id })
        .where(eq(schema.users.id, userId));
    return { workspaceId: row.ws.id, name: row.ws.name };
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
    await db
        .delete(schema.members)
        .where(and(eq(schema.members.workspaceId, workspaceId), eq(schema.members.userId, userId)));
    // if they were working in this workspace, drop them back to their own on next read
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: null })
        .where(and(eq(schema.users.id, userId), eq(schema.users.activeWorkspaceId, workspaceId)));
}

export async function switchWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const [membership] = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(and(eq(schema.members.userId, userId), eq(schema.members.workspaceId, workspaceId)));
    if (!membership) return false;
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: workspaceId })
        .where(eq(schema.users.id, userId));
    return true;
}
