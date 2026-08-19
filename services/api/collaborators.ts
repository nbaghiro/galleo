import { Hono } from "hono";
import { z } from "zod";
import { isGrantable } from "@model/artifact";
import { BAD_BODY, readJson } from "@services/utils/http";
import {
    acceptGrant,
    grantByToken,
    inviteCollaborator,
    listCollaborators,
    membersWithAccess,
    revokeGrant,
    setGrantAccess,
    sharedWithMe,
} from "@services/core/collaborators";
import { gateShared, isResponse, requireUser, type AuthedEnv } from "./middleware";

export const collaborators = new Hono<AuthedEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const zInvite = z.object({ email: z.string().optional(), access: z.string().optional() });
const zLevel = z.object({ access: z.string().optional() });
const zToken = z.object({ token: z.string().optional() });

const SHARED_LIMIT = 60;

// `members` is the owning workspace's roster with the level each of them holds on this artifact
// today, so inviting one of them shows what would change. It stays out of an outsider's response:
// their grant opens one document, not the roster of a workspace they are not in.
collaborators.get("/artifacts/:id/collaborators", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    return c.json({
        collaborators: await listCollaborators(c.req.param("id")),
        members: gate.role ? await membersWithAccess(gate.artifact, gate.ws) : [],
    });
});

// Inviting takes edit on the artifact and membership of the workspace that owns it. Membership is
// the extra gate because a grant is the owning workspace handing out access to its own content: an
// invited editor may change the document, not widen who else can reach it.
collaborators.post("/artifacts/:id/collaborators", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    if (!gate.role)
        return c.json({ error: "Only the workspace that owns this can invite people." }, 403);
    const body = await readJson(c, zInvite);
    if (!body) return c.json(BAD_BODY, 400);
    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return c.json({ error: "a valid email is required" }, 400);
    const access = isGrantable(body.access) ? body.access : "edit";

    const result = await inviteCollaborator(
        gate.ws,
        { id: gate.artifact.id, title: gate.artifact.title },
        c.get("user"),
        email,
        access,
    );
    if ("error" in result)
        return result.error === "self"
            ? c.json({ error: "you already have access to this" }, 409)
            : c.json({ error: "could not invite that person" }, 500);
    return c.json(result);
});

collaborators.patch("/artifacts/:id/collaborators/:grantId", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    if (!gate.role)
        return c.json({ error: "Only the workspace that owns this can change access." }, 403);
    const body = await readJson(c, zLevel);
    if (!body) return c.json(BAD_BODY, 400);
    if (!isGrantable(body.access)) return c.json({ error: "that is not an access level" }, 400);
    const ok = await setGrantAccess(c.req.param("id"), c.req.param("grantId"), body.access);
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

collaborators.delete("/artifacts/:id/collaborators/:grantId", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    if (!gate.role)
        return c.json({ error: "Only the workspace that owns this can change access." }, 403);
    const ok = await revokeGrant(c.req.param("id"), c.req.param("grantId"));
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

// Reached from the emailed link; possession of the token is the credential, as with workspace invites.
collaborators.get("/collab/invites/:token", requireUser, async (c) => {
    const peek = await grantByToken(c.req.param("token"));
    return peek ? c.json(peek) : c.json({ error: "invite not found or already used" }, 404);
});

collaborators.post("/collab/invites/accept", requireUser, async (c) => {
    const body = await readJson(c, zToken);
    if (!body) return c.json(BAD_BODY, 400);
    if (!body.token) return c.json({ error: "token required" }, 400);
    const artifactId = await acceptGrant(body.token, c.get("user").id);
    return artifactId
        ? c.json({ ok: true, artifactId })
        : c.json({ error: "invite not found or already used" }, 404);
});

collaborators.get("/shared-with-me", requireUser, async (c) => {
    const before = c.req.query("before");
    const at = before ? new Date(before) : null;
    return c.json({
        artifacts: await sharedWithMe(c.get("user").id, {
            take: SHARED_LIMIT,
            before: at && !Number.isNaN(at.getTime()) ? at : null,
        }),
    });
});
