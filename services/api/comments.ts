import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { COMMENT_MAX_LENGTH, COMMENT_QUOTE_MAX_LENGTH } from "@model/comments";
import { BAD_BODY, readJson } from "@services/utils/http";
import type { WorkspaceRow } from "@services/core/accounts";
import type { Viewer } from "@services/core/comments";
import {
    artifactOfCommentAnywhere,
    createComment,
    deleteComment,
    editComment,
    listComments,
    setResolved,
} from "@services/core/comments";
import { gateShared, isResponse, requireUser, type AuthedEnv } from "./middleware";

export const comments = new Hono<AuthedEnv>();

// The anchor shape is ours end to end, so an explicit union is the right schema here: nothing the
// client sends is stored beyond these fields, and an unknown kind is a bug rather than a new field.
const zAnchor = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("element"), elementId: z.string().min(1) }),
    z.object({ kind: z.literal("text"), elementId: z.string().min(1) }),
]);

const zBody = z.string().trim().min(1).max(COMMENT_MAX_LENGTH);

const zCreate = z.object({
    body: zBody,
    sectionId: z.string().min(1),
    anchor: zAnchor,
    quote: z.string().max(COMMENT_QUOTE_MAX_LENGTH).optional(),
    // a non-uuid would reach the uuid column as a query error, not a miss
    parentId: z.uuid().optional(),
});

const zEdit = z.object({ body: zBody });

// Acting on a comment needs the level on the artifact it hangs on, so a member dropped to view can
// no longer edit or resolve the threads they left behind. The artifact is looked up without a
// workspace filter and the gate applies the scoping, so an invited collaborator resolves too.
//
// The gate already resolved the caller's role in the artifact's workspace, so it is handed on as the
// viewer rather than re-read: `mine` and `canDelete` are answers to a question this has just settled.
interface CommentGate {
    ws: WorkspaceRow;
    viewer: Viewer;
}

const gateComment = async (
    c: Context<AuthedEnv>,
    id: string,
    need: "view" | "comment",
): Promise<CommentGate | Response> => {
    const artifactId = await artifactOfCommentAnywhere(id);
    if (!artifactId) return c.json({ error: "not found" }, 404);
    const gate = await gateShared(c, artifactId, need);
    return isResponse(gate)
        ? gate
        : { ws: gate.ws, viewer: { userId: c.get("user").id, role: gate.role } };
};

comments.get("/artifacts/:id/comments", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    const list = await listComments(gate.ws, c.req.param("id"), {
        userId: c.get("user").id,
        role: gate.role,
    });
    return list ? c.json({ comments: list }) : c.json({ error: "not found" }, 404);
});

comments.post("/artifacts/:id/comments", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "comment");
    if (isResponse(gate)) return gate;
    const body = await readJson(c, zCreate);
    if (!body) return c.json(BAD_BODY, 400);
    const r = await createComment(
        gate.ws,
        c.req.param("id"),
        { userId: c.get("user").id, role: gate.role },
        body,
    );
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.patch("/comments/:id", requireUser, async (c) => {
    const gate = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(gate)) return gate;
    const body = await readJson(c, zEdit);
    if (!body) return c.json(BAD_BODY, 400);
    const r = await editComment(gate.ws, c.req.param("id"), gate.viewer, body.body);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.post("/comments/:id/resolve", requireUser, async (c) => {
    const gate = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(gate)) return gate;
    const r = await setResolved(gate.ws, c.req.param("id"), gate.viewer, true);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.post("/comments/:id/unresolve", requireUser, async (c) => {
    const gate = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(gate)) return gate;
    const r = await setResolved(gate.ws, c.req.param("id"), gate.viewer, false);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.delete("/comments/:id", requireUser, async (c) => {
    const gate = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(gate)) return gate;
    const r = await deleteComment(gate.ws, c.req.param("id"), gate.viewer);
    return r.status === 200 ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
});
