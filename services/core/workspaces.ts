import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    asRole,
    type Membership,
    type WorkspaceRole,
    type WorkspaceSettings,
} from "@model/workspace";
import { appUrl } from "@services/utils/env";
import { capture } from "@services/utils/analytics";
import { planFor } from "@model/billing";
import { sendWorkspaceInvite } from "./mail";
import type { WorkspaceRow } from "./accounts";

/** Whole hours between then and now, the unit every "how long did this take" property uses. */
const hoursSince = (at: Date): number => Math.round((Date.now() - at.getTime()) / 3_600_000);

// Members, seats, and invites. Invite acceptance is possession-based: the raw token lives only in
// the emailed link, so only its hash is stored.

const INVITE_TTL_DAYS = 14;

const hashToken = (raw: string): string => createHash("sha256").update(raw).digest("hex");
const newToken = (): string => randomBytes(24).toString("base64url");
const inviteUrl = (token: string): string => appUrl(`/invite/${token}`);

/** The caller's effective role, or null when they are not a member at all. */
export async function roleOf(ws: WorkspaceRow, userId: string): Promise<WorkspaceRole | null> {
    if (ws.ownerId === userId) return "owner";
    const [row] = await db
        .select({ role: schema.members.role })
        .from(schema.members)
        .where(and(eq(schema.members.workspaceId, ws.id), eq(schema.members.userId, userId)));
    return row ? asRole(row.role) : null;
}

export async function setMemberRole(
    workspaceId: string,
    userId: string,
    role: "admin" | "member",
): Promise<boolean> {
    const [row] = await db
        .update(schema.members)
        .set({ role })
        .where(and(eq(schema.members.workspaceId, workspaceId), eq(schema.members.userId, userId)))
        .returning({ userId: schema.members.userId });
    return !!row;
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
    await updateWorkspace(workspaceId, { name });
}

export type WorkspaceSettingsPatch = Partial<WorkspaceSettings> & { name?: string };

export async function updateWorkspace(
    workspaceId: string,
    patch: WorkspaceSettingsPatch,
): Promise<void> {
    await db.update(schema.workspaces).set(patch).where(eq(schema.workspaces.id, workspaceId));
}

/** Hand the workspace to an existing member; the old owner stays on as an admin. */
export async function transferOwnership(ws: WorkspaceRow, targetUserId: string): Promise<boolean> {
    const [target] = await db
        .select({ userId: schema.members.userId })
        .from(schema.members)
        .where(and(eq(schema.members.workspaceId, ws.id), eq(schema.members.userId, targetUserId)));
    if (!target || targetUserId === ws.ownerId) return false;
    await db.transaction(async (tx) => {
        await tx
            .update(schema.workspaces)
            .set({ ownerId: targetUserId })
            .where(eq(schema.workspaces.id, ws.id));
        await tx
            .update(schema.members)
            .set({ role: "admin" })
            .where(
                and(eq(schema.members.workspaceId, ws.id), eq(schema.members.userId, ws.ownerId)),
            );
    });
    return true;
}

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

export async function membershipsOf(userId: string): Promise<Membership[]> {
    const rows = await db
        .select({
            id: schema.workspaces.id,
            name: schema.workspaces.name,
            ownerId: schema.workspaces.ownerId,
            role: schema.members.role,
        })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .where(eq(schema.members.userId, userId))
        .orderBy(schema.members.createdAt);
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.ownerId === userId ? "owner" : asRole(r.role),
    }));
}

export type LeaveResult = "ok" | "not-member" | "owner";

// Leaving is an account action, so it names its workspace rather than assuming the active one: the
// account page lists every membership, including the ones the user is not currently working in.
export async function leaveWorkspace(userId: string, workspaceId: string): Promise<LeaveResult> {
    const [row] = await db
        .select({
            ownerId: schema.workspaces.ownerId,
            role: schema.members.role,
            joinedAt: schema.members.createdAt,
        })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .where(and(eq(schema.members.userId, userId), eq(schema.members.workspaceId, workspaceId)));
    if (!row) return "not-member";
    if (row.ownerId === userId) return "owner";
    capture({ userId, workspaceId }, "member_left", {
        role: asRole(row.role),
        days_as_member: Math.round(hoursSince(row.joinedAt) / 24),
    });
    await removeMember(workspaceId, userId);
    return "ok";
}

export type InviteResult =
    | { error: "already-member" }
    | { error: "no-seats"; seats: number }
    | {
          invite: Awaited<ReturnType<typeof pendingInvites>>[number];
          url: string;
          sent: boolean;
          seatsUsed: number;
          seatsTotal: number;
          atSeatLimit: boolean;
      };

// Returns the accept URL as well as mailing it, so an unconfigured-mail dev setup stays usable.
export async function inviteMember(
    ws: WorkspaceRow,
    inviter: { id: string; name: string | null },
    email: string,
    role: "admin" | "member" = "member",
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
            role,
            tokenHash: hashToken(token),
            invitedBy: inviter.id,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: [schema.invites.workspaceId, schema.invites.email],
            // re-inviting refreshes the token + window (and revives an expired/accepted row)
            set: {
                role,
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
    return {
        invite: invite!,
        url,
        sent,
        seatsUsed: members.length,
        seatsTotal: ws.seats,
        atSeatLimit: members.length + pending.length + 1 >= ws.seats,
    };
}

/** Returns how long the invite had been outstanding, or null when there was nothing to revoke. */
export async function revokeInvite(workspaceId: string, inviteId: string): Promise<number | null> {
    const [row] = await db
        .delete(schema.invites)
        .where(and(eq(schema.invites.id, inviteId), eq(schema.invites.workspaceId, workspaceId)))
        .returning({ createdAt: schema.invites.createdAt });
    return row ? hoursSince(row.createdAt) : null;
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

    if (!already) {
        await db
            .insert(schema.members)
            .values({ workspaceId: row.ws.id, userId, role: row.invite.role })
            .onConflictDoNothing();
        capture({ userId, workspaceId: row.ws.id }, "invite_accepted", {
            role: asRole(row.invite.role),
            hours_to_accept: hoursSince(row.invite.createdAt),
        });
    }
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
    // Every membership rather than just the target one, because naming the plan on both sides of
    // the switch is what makes the event answerable, and a person has a handful of these.
    const memberships = await db
        .select({ id: schema.members.workspaceId, plan: schema.workspaces.plan })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.members.workspaceId))
        .where(eq(schema.members.userId, userId));
    const target = memberships.find((m) => m.id === workspaceId);
    if (!target) return false;
    const [me] = await db
        .select({ active: schema.users.activeWorkspaceId })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: workspaceId })
        .where(eq(schema.users.id, userId));
    capture({ userId, workspaceId }, "workspace_switched", {
        from_plan: planFor(memberships.find((m) => m.id === me?.active)?.plan).id,
        to_plan: planFor(target.plan).id,
        workspaces_available: memberships.length,
    });
    return true;
}
