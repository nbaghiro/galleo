import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { ArtifactAccess, Collaborator, SharedArtifact } from "@model/artifact";
import { accessFor } from "@model/artifact";
import { asRole, type WorkspaceRole } from "@model/workspace";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { appUrl } from "@services/utils/env";
import type { WorkspaceRow } from "./accounts";
import type { ArtifactRow } from "./artifacts";
import { sendCollabInvite } from "./mail";

// Per-artifact collaborator grants: who may open one artifact regardless of workspace membership,
// and how the caller's effective level on it is resolved. Acceptance is possession-based like the
// workspace invite, so only the token's hash is stored.

const hashToken = (raw: string): string => createHash("sha256").update(raw).digest("hex");
const newToken = (): string => randomBytes(24).toString("base64url");
const collabUrl = (token: string): string => appUrl(`/collab/${token}`);

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

// "This viewer holds a direct grant on that artifact." The readers of "what may this person see"
// (the library list, search, and shared-with-me) share this one predicate rather than each carrying
// its own answer: a grant that opens an artifact by URL but leaves it out of every list is an
// artifact only someone who already has the link can find. `artifactId` is the id expression in the
// caller's own query, since the raw-SQL readers alias `artifacts` as `a`.
export const grantedTo = (userId: string, artifactId: SQL | AnyPgColumn): SQL =>
    sql`exists (select 1 from ${schema.artifactGrants} g where g.artifact_id = ${artifactId} and g.user_id = ${userId})`;

/** The caller's standing on one artifact, resolved from the artifact's workspace rather than theirs. */
export interface ArtifactStanding {
    artifact: ArtifactRow;
    ws: WorkspaceRow;
    role: WorkspaceRole | null; // null = not a member of the artifact's workspace
    grant: ArtifactAccess | null;
    access: ArtifactAccess;
}

// Resolves the workspace FROM THE ARTIFACT ROW, not from the caller's active membership: a
// collaborator invited into someone else's workspace has no membership there to scope by, and the
// active-workspace form would 404 them out of the very artifact they were invited to.
export async function artifactStanding(
    userId: string,
    artifactId: string,
): Promise<ArtifactStanding | null> {
    const [row] = await db
        .select({
            artifact: schema.artifacts,
            ws: schema.workspaces,
            role: schema.members.role,
            grantAccess: schema.artifactGrants.access,
        })
        .from(schema.artifacts)
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.artifacts.workspaceId))
        .leftJoin(
            schema.members,
            and(
                eq(schema.members.workspaceId, schema.artifacts.workspaceId),
                eq(schema.members.userId, userId),
            ),
        )
        .leftJoin(
            schema.artifactGrants,
            and(
                eq(schema.artifactGrants.artifactId, schema.artifacts.id),
                eq(schema.artifactGrants.userId, userId),
            ),
        )
        .where(eq(schema.artifacts.id, artifactId));
    if (!row) return null;

    const role: WorkspaceRole | null =
        row.ws.ownerId === userId ? "owner" : row.role ? asRole(row.role) : null;
    const grant = row.grantAccess ?? null;
    return {
        artifact: row.artifact,
        ws: row.ws,
        role,
        grant,
        access: accessFor({
            role,
            userId,
            createdBy: row.artifact.createdBy,
            memberAccess: row.artifact.memberAccess,
            workspaceDefault: row.ws.defaultArtifactAccess,
            grant,
        }),
    };
}

export async function listCollaborators(artifactId: string): Promise<Collaborator[]> {
    const rows = await db
        .select({
            id: schema.artifactGrants.id,
            email: schema.artifactGrants.email,
            access: schema.artifactGrants.access,
            acceptedAt: schema.artifactGrants.acceptedAt,
            createdAt: schema.artifactGrants.createdAt,
            userId: schema.artifactGrants.userId,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
            memberId: schema.members.userId,
        })
        .from(schema.artifactGrants)
        .leftJoin(schema.users, eq(schema.users.id, schema.artifactGrants.userId))
        .leftJoin(
            schema.members,
            and(
                eq(schema.members.workspaceId, schema.artifactGrants.workspaceId),
                eq(schema.members.userId, schema.artifactGrants.userId),
            ),
        )
        .where(eq(schema.artifactGrants.artifactId, artifactId))
        .orderBy(schema.artifactGrants.createdAt);
    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        avatarUrl: r.avatarUrl,
        access: r.access,
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
        member: r.memberId !== null,
    }));
}

// The owning workspace's members with the level they hold on this artifact today, so inviting one
// of them by name can show what changes. A grant on a member is an explicit per-user level and may
// lower them, which should be a visible act rather than a surprise.
export async function membersWithAccess(
    artifact: ArtifactRow,
    ws: WorkspaceRow,
): Promise<Collaborator[]> {
    const rows = await db
        .select({
            userId: schema.members.userId,
            role: schema.members.role,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
            grant: schema.artifactGrants.access,
        })
        .from(schema.members)
        .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
        .leftJoin(
            schema.artifactGrants,
            and(
                eq(schema.artifactGrants.artifactId, artifact.id),
                eq(schema.artifactGrants.userId, schema.members.userId),
            ),
        )
        .where(eq(schema.members.workspaceId, ws.id))
        .orderBy(schema.members.createdAt);
    return rows.map((r) => ({
        id: r.userId,
        email: r.email,
        name: r.name,
        avatarUrl: r.avatarUrl,
        access: accessFor({
            role: r.userId === ws.ownerId ? "owner" : asRole(r.role),
            userId: r.userId,
            createdBy: artifact.createdBy,
            memberAccess: artifact.memberAccess,
            workspaceDefault: ws.defaultArtifactAccess,
            grant: r.grant,
        }),
        acceptedAt: null,
        member: true,
    }));
}

export type InviteResult =
    | { error: "self" | "failed" }
    | { collaborator: Collaborator; url: string | null; sent: boolean };

// Invites by email. An address that already has an account binds straight away, so nothing is
// emailed that a signed-in user could not already reach; an unknown one gets a hashed token and the
// link is the only place the raw value exists.
export async function inviteCollaborator(
    ws: WorkspaceRow,
    artifact: { id: string; title: string },
    inviter: { id: string; name: string | null },
    rawEmail: string,
    access: ArtifactAccess,
): Promise<InviteResult> {
    const email = normalizeEmail(rawEmail);
    const [existing] = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(sql`lower(${schema.users.email})`, email));
    if (existing?.id === inviter.id) return { error: "self" };

    const token = existing ? null : newToken();
    await db
        .insert(schema.artifactGrants)
        .values({
            artifactId: artifact.id,
            workspaceId: ws.id,
            email,
            userId: existing?.id ?? null,
            access,
            invitedBy: inviter.id,
            tokenHash: token ? hashToken(token) : null,
        })
        .onConflictDoUpdate({
            target: [schema.artifactGrants.artifactId, schema.artifactGrants.email],
            // re-inviting refreshes the level and the token rather than erroring
            set: {
                access,
                userId: existing?.id ?? null,
                invitedBy: inviter.id,
                tokenHash: token ? hashToken(token) : null,
            },
        });

    const url = token ? collabUrl(token) : appUrl(`/edit/${artifact.id}`);
    const sent = await sendCollabInvite({
        to: email,
        artifactTitle: artifact.title,
        workspaceName: ws.name,
        inviterName: inviter.name,
        access,
        url,
    });
    const collaborator = (await listCollaborators(artifact.id)).find((g) => g.email === email);
    if (!collaborator) return { error: "failed" };
    return { collaborator, url: token ? url : null, sent };
}

// Both of these answer with the account the grant was bound to (null while it is still an unopened
// invitation), because the caller has to push the new standing into any room that person is in.
export type GrantChange = { userId: string | null } | null; // null = no such grant

export async function setGrantAccess(
    artifactId: string,
    grantId: string,
    access: ArtifactAccess,
): Promise<GrantChange> {
    const [row] = await db
        .update(schema.artifactGrants)
        .set({ access })
        .where(
            and(
                eq(schema.artifactGrants.id, grantId),
                eq(schema.artifactGrants.artifactId, artifactId),
            ),
        )
        .returning({ userId: schema.artifactGrants.userId });
    return row ? { userId: row.userId } : null;
}

export async function revokeGrant(artifactId: string, grantId: string): Promise<GrantChange> {
    const [row] = await db
        .delete(schema.artifactGrants)
        .where(
            and(
                eq(schema.artifactGrants.id, grantId),
                eq(schema.artifactGrants.artifactId, artifactId),
            ),
        )
        .returning({ userId: schema.artifactGrants.userId });
    return row ? { userId: row.userId } : null;
}

export interface GrantPeek {
    artifactId: string;
    title: string;
    workspaceName: string;
    email: string;
    access: ArtifactAccess;
}

/** What the accept page shows before the caller commits to claiming the grant. */
export async function grantByToken(token: string): Promise<GrantPeek | null> {
    const [row] = await db
        .select({
            artifactId: schema.artifactGrants.artifactId,
            email: schema.artifactGrants.email,
            access: schema.artifactGrants.access,
            title: schema.artifacts.title,
            workspaceName: schema.workspaces.name,
        })
        .from(schema.artifactGrants)
        .innerJoin(schema.artifacts, eq(schema.artifacts.id, schema.artifactGrants.artifactId))
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.artifactGrants.workspaceId))
        .where(eq(schema.artifactGrants.tokenHash, hashToken(token)));
    return row ?? null;
}

/** Binds the grant to whoever holds the token; the token is spent so a forwarded link is inert. */
export async function acceptGrant(token: string, userId: string): Promise<string | null> {
    const [row] = await db
        .update(schema.artifactGrants)
        .set({ userId, acceptedAt: new Date(), tokenHash: null })
        .where(eq(schema.artifactGrants.tokenHash, hashToken(token)))
        .returning({ artifactId: schema.artifactGrants.artifactId });
    return row?.artifactId ?? null;
}

/** Records that a bound grantee has opened the artifact, so the tab can say "invited" vs "joined". */
export async function markGrantSeen(artifactId: string, userId: string): Promise<void> {
    await db
        .update(schema.artifactGrants)
        .set({ acceptedAt: new Date() })
        .where(
            and(
                eq(schema.artifactGrants.artifactId, artifactId),
                eq(schema.artifactGrants.userId, userId),
                isNull(schema.artifactGrants.acceptedAt),
            ),
        );
}

// "Shared with me": artifacts reached through a grant, never the caller's own workspace rows. Reads
// the digest, not the content, so this costs the same as the library list.
export async function sharedWithMe(
    userId: string,
    opts: { take: number; before?: Date | null },
): Promise<SharedArtifact[]> {
    const rows = await db
        .select({
            id: schema.artifacts.id,
            title: schema.artifacts.title,
            themeId: schema.artifacts.themeId,
            formatId: schema.artifacts.formatId,
            updatedAt: schema.artifacts.updatedAt,
            digest: schema.artifacts.digest,
            access: schema.artifactGrants.access,
            workspaceName: schema.workspaces.name,
            sharedByName: schema.users.name,
            sharedByAvatar: schema.users.avatarUrl,
        })
        .from(schema.artifactGrants)
        .innerJoin(schema.artifacts, eq(schema.artifacts.id, schema.artifactGrants.artifactId))
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.artifacts.workspaceId))
        .leftJoin(schema.users, eq(schema.users.id, schema.artifactGrants.invitedBy))
        .where(
            and(
                eq(schema.artifactGrants.userId, userId),
                isNull(schema.artifacts.trashedAt),
                // a member of the owning workspace already sees it in their own library
                sql`not exists (select 1 from ${schema.members} m where m.workspace_id = ${schema.artifacts.workspaceId} and m.user_id = ${userId})`,
                opts.before ? lt(schema.artifacts.updatedAt, opts.before) : undefined,
            ),
        )
        .orderBy(desc(schema.artifacts.updatedAt), desc(schema.artifacts.id))
        .limit(opts.take);
    return rows.map((r) => ({
        id: r.id,
        title: r.title,
        themeId: r.themeId,
        formatId: r.formatId,
        updatedAt: r.updatedAt.toISOString(),
        cover: r.digest?.cover ?? {},
        sections: r.digest?.sections ?? [],
        ...(r.digest?.page ? { page: r.digest.page } : {}),
        access: r.access,
        workspaceName: r.workspaceName,
        sharedBy: r.sharedByName ? { name: r.sharedByName, avatarUrl: r.sharedByAvatar } : null,
    }));
}
