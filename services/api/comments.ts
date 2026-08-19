import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { COMMENT_MAX_LENGTH, COMMENT_QUOTE_MAX_LENGTH } from "@model/comments";
import { BAD_BODY, readJson } from "@services/utils/http";
import type { WorkspaceRow } from "@services/core/accounts";
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
const gateComment = async (
    c: Context<AuthedEnv>,
    id: string,
    need: "view" | "comment",
): Promise<WorkspaceRow | Response> => {
    const artifactId = await artifactOfCommentAnywhere(id);
    if (!artifactId) return c.json({ error: "not found" }, 404);
    const gate = await gateShared(c, artifactId, need);
    return isResponse(gate) ? gate : gate.ws;
};

comments.get("/artifacts/:id/comments", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    const list = await listComments(gate.ws, c.req.param("id"), c.get("user").id);
    return list ? c.json({ comments: list }) : c.json({ error: "not found" }, 404);
});

comments.post("/artifacts/:id/comments", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "comment");
    if (isResponse(gate)) return gate;
    const body = await readJson(c, zCreate);
    if (!body) return c.json(BAD_BODY, 400);
    const r = await createComment(gate.ws, c.req.param("id"), c.get("user").id, body);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.patch("/comments/:id", requireUser, async (c) => {
    const ws = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(ws)) return ws;
    const body = await readJson(c, zEdit);
    if (!body) return c.json(BAD_BODY, 400);
    const r = await editComment(ws, c.req.param("id"), c.get("user").id, body.body);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.post("/comments/:id/resolve", requireUser, async (c) => {
    const ws = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(ws)) return ws;
    const r = await setResolved(ws, c.req.param("id"), c.get("user").id, true);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.post("/comments/:id/unresolve", requireUser, async (c) => {
    const ws = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(ws)) return ws;
    const r = await setResolved(ws, c.req.param("id"), c.get("user").id, false);
    return r.status === 200 ? c.json({ comment: r.comment }) : c.json({ error: r.error }, r.status);
});

comments.delete("/comments/:id", requireUser, async (c) => {
    const ws = await gateComment(c, c.req.param("id"), "comment");
    if (isResponse(ws)) return ws;
    const r = await deleteComment(ws, c.req.param("id"), c.get("user").id);
    return r.status === 200 ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
});
