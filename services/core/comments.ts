import { and, asc, eq, type SQL } from "drizzle-orm";
import type { CommentCreateBody, CommentDto } from "@model/comments";
import { isCommentAnchor } from "@model/comments";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { WorkspaceRow } from "./accounts";
import { roleOf } from "./workspaces";
import { capture } from "@services/utils/analytics";
import { asRole } from "@model/workspace";

// Every decision about a comment lives here: who may write it, what it may point at, and how a
// thread reads back. Rows are workspace-scoped on their own column, so a comment id from another
// workspace is simply not found rather than refused.

export type CommentFailure = { status: 403 | 404 | 409; error: string };
export type CommentResult = { status: 200; comment: CommentDto } | CommentFailure;
export type CommentDeletion = { status: 200 } | CommentFailure;

// who is reading, so each row can carry what this person may do with it
interface Viewer {
    userId: string;
    moderator: boolean;
}

const viewerOf = async (ws: WorkspaceRow, userId: string): Promise<Viewer> => {
    const role = await roleOf(ws, userId);
    return { userId, moderator: role === "owner" || role === "admin" };
};

const owned = (id: string, workspaceId: string): SQL | undefined =>
    and(eq(schema.comments.id, id), eq(schema.comments.workspaceId, workspaceId));

const ownedArtifact = (id: string, workspaceId: string): SQL | undefined =>
    and(eq(schema.artifacts.id, id), eq(schema.artifacts.workspaceId, workspaceId));

async function read(where: SQL | undefined, viewer: Viewer): Promise<CommentDto[]> {
    const rows = await db
        .select({
            id: schema.comments.id,
            parentId: schema.comments.parentId,
            sectionId: schema.comments.sectionId,
            anchor: schema.comments.anchor,
            quote: schema.comments.quote,
            body: schema.comments.body,
            resolvedAt: schema.comments.resolvedAt,
            createdAt: schema.comments.createdAt,
            updatedAt: schema.comments.updatedAt,
            authorId: schema.comments.authorId,
            authorName: schema.users.name,
            authorAvatarUrl: schema.users.avatarUrl,
        })
        .from(schema.comments)
        .leftJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
        .where(where)
        .orderBy(asc(schema.comments.createdAt), asc(schema.comments.id));

    return rows.map((r) => {
        const mine = r.authorId === viewer.userId;
        return {
            id: r.id,
            parentId: r.parentId,
            sectionId: r.sectionId,
            // jsonb: a row written by a past shape reads as an anchor no element can match, so the
            // thread lands in the rail's removed-content group rather than reaching the canvas
            anchor: isCommentAnchor(r.anchor) ? r.anchor : { kind: "element", elementId: "" },
            quote: r.quote,
            body: r.body,
            resolvedAt: r.resolvedAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            author: r.authorId
                ? { id: r.authorId, name: r.authorName, avatarUrl: r.authorAvatarUrl }
                : null,
            mine,
            canDelete: mine || viewer.moderator,
        };
    });
}

const one = async (id: string, ws: WorkspaceRow, viewer: Viewer): Promise<CommentResult> => {
    const [comment] = await read(owned(id, ws.id), viewer);
    return comment ? { status: 200, comment } : { status: 404, error: "not found" };
};

/** Null when the artifact is not this workspace's, so the route answers 404 rather than an empty list. */
export async function listComments(
    ws: WorkspaceRow,
    artifactId: string,
    userId: string,
): Promise<CommentDto[] | null> {
    const [a] = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(ownedArtifact(artifactId, ws.id));
    if (!a) return null;
    return read(eq(schema.comments.artifactId, artifactId), await viewerOf(ws, userId));
}

export async function createComment(
    ws: WorkspaceRow,
    artifactId: string,
    userId: string,
    body: CommentCreateBody,
): Promise<CommentResult> {
    const [a] = await db
        .select({ digest: schema.artifacts.digest, createdBy: schema.artifacts.createdBy })
        .from(schema.artifacts)
        .where(ownedArtifact(artifactId, ws.id));
    if (!a) return { status: 404, error: "not found" };

    // A digest written before section ids cannot answer the question, so it does not get to refuse.
    const known = (a.digest?.sections ?? [])
        .map((s) => s.id)
        .filter((id): id is string => typeof id === "string");
    if (known.length && !known.includes(body.sectionId))
        return { status: 409, error: "unknown section" };

    if (body.parentId) {
        const [parent] = await db
            .select({
                parentId: schema.comments.parentId,
                artifactId: schema.comments.artifactId,
            })
            .from(schema.comments)
            .where(owned(body.parentId, ws.id));
        if (!parent || parent.artifactId !== artifactId)
            return { status: 409, error: "unknown parent comment" };
        if (parent.parentId) return { status: 409, error: "replies cannot be nested" };
    }

    const [made] = await db
        .insert(schema.comments)
        .values({
            workspaceId: ws.id,
            artifactId,
            sectionId: body.sectionId,
            anchor: body.anchor,
            quote: body.quote ?? null,
            parentId: body.parentId ?? null,
            authorId: userId,
            body: body.body,
        })
        .returning({ id: schema.comments.id });
    if (!made) return { status: 409, error: "could not post that comment" };
    // The body never travels; who left it and on whose work is the whole question here.
    capture({ userId, workspaceId: ws.id }, "comment_created", {
        by_role: asRole((await roleOf(ws, userId)) ?? "member"),
        on_own_artifact: a.createdBy === userId,
        is_reply: !!body.parentId,
    });
    return one(made.id, ws, await viewerOf(ws, userId));
}

// The artifact a comment hangs on, so a route can resolve the caller's access before acting. Not
// scoped to a workspace: the caller may be an invited collaborator with no membership there, and
// the artifact gate is what decides whether they may act on it.
export async function artifactOfCommentAnywhere(id: string): Promise<string | null> {
    const [row] = await db
        .select({ artifactId: schema.comments.artifactId })
        .from(schema.comments)
        .where(eq(schema.comments.id, id));
    return row?.artifactId ?? null;
}

export async function editComment(
    ws: WorkspaceRow,
    id: string,
    userId: string,
    body: string,
): Promise<CommentResult> {
    const [row] = await db
        .select({ authorId: schema.comments.authorId })
        .from(schema.comments)
        .where(owned(id, ws.id));
    if (!row) return { status: 404, error: "not found" };
    if (row.authorId !== userId)
        return { status: 403, error: "only the author can edit a comment" };
    await db.update(schema.comments).set({ body, updatedAt: new Date() }).where(owned(id, ws.id));
    return one(id, ws, await viewerOf(ws, userId));
}

/** Resolution is a property of the thread, so only its root carries it; any member may set it. */
export async function setResolved(
    ws: WorkspaceRow,
    id: string,
    userId: string,
    resolved: boolean,
): Promise<CommentResult> {
    const [row] = await db
        .select({ parentId: schema.comments.parentId, createdAt: schema.comments.createdAt })
        .from(schema.comments)
        .where(owned(id, ws.id));
    if (!row) return { status: 404, error: "not found" };
    if (row.parentId) return { status: 409, error: "only a thread can be resolved" };
    if (resolved)
        capture({ userId, workspaceId: ws.id }, "comment_resolved", {
            hours_open: Math.round((Date.now() - row.createdAt.getTime()) / 3_600_000),
        });
    await db
        .update(schema.comments)
        .set({
            resolvedAt: resolved ? new Date() : null,
            resolvedBy: resolved ? userId : null,
            updatedAt: new Date(),
        })
        .where(owned(id, ws.id));
    return one(id, ws, await viewerOf(ws, userId));
}

/** The author, or someone who can already administer the workspace. Replies cascade with their root. */
export async function deleteComment(
    ws: WorkspaceRow,
    id: string,
    userId: string,
): Promise<CommentDeletion> {
    const [row] = await db
        .select({ authorId: schema.comments.authorId })
        .from(schema.comments)
        .where(owned(id, ws.id));
    if (!row) return { status: 404, error: "not found" };
    if (row.authorId !== userId && !(await viewerOf(ws, userId)).moderator)
        return { status: 403, error: "only the author or a workspace admin can delete this" };
    await db.delete(schema.comments).where(owned(id, ws.id));
    return { status: 200 };
}
