import { Hono } from "hono";
import { readJson } from "../utils/http";
import {
    acceptInvite,
    inviteByToken,
    inviteMember,
    liveMembers,
    membershipsOf,
    pendingInvites,
    removeMember,
    revokeInvite,
    switchWorkspace,
} from "../core/workspaces";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const workspace = new Hono<WorkspaceEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ownerOnly = (ws: { ownerId: string }, userId: string): boolean => ws.ownerId === userId;

workspace.get("/workspace", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const isOwner = ownerOnly(ws, user.id);
    const [members, invites, memberships] = await Promise.all([
        liveMembers(ws.id),
        isOwner ? pendingInvites(ws.id) : Promise.resolve([]),
        membershipsOf(user.id),
    ]);
    return c.json({
        workspace: { id: ws.id, name: ws.name, plan: ws.plan, seats: ws.seats },
        role: isOwner ? "owner" : "member",
        members: members.map((m) => ({ ...m, isOwner: m.userId === ws.ownerId })),
        invites,
        memberships: memberships.map((m) => ({ ...m, active: m.id === ws.id })),
    });
});

workspace.post("/workspace/invites", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    if (!ownerOnly(ws, user.id))
        return c.json({ error: "only the workspace owner can invite members" }, 403);
    const { email } = await readJson<{ email?: string }>(c);
    const target = email?.trim().toLowerCase();
    if (!target || !EMAIL_RE.test(target))
        return c.json({ error: "a valid email is required" }, 400);

    const result = await inviteMember(ws, user, target);
    if ("error" in result) {
        if (result.error === "already-member") return c.json({ error: "already a member" }, 409);
        return c.json(
            {
                error: `All ${result.seats} seats are taken — add seats to invite more people.`,
                upgrade: true,
            },
            402,
        );
    }
    return c.json(result);
});

workspace.delete("/workspace/invites/:id", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    if (!ownerOnly(ws, user.id))
        return c.json({ error: "only the workspace owner can revoke invites" }, 403);
    await revokeInvite(ws.id, c.req.param("id"));
    return c.json({ ok: true });
});

// Auth required: the accept page sits behind the app's sign-in gate.
workspace.get("/invites/:token", requireUser, async (c) => {
    const row = await inviteByToken(c.req.param("token"));
    if (!row) return c.json({ error: "invite not found or expired" }, 404);
    return c.json({ workspace: row.ws.name, email: row.invite.email });
});

workspace.post("/invites/accept", requireUser, async (c) => {
    const { token } = await readJson<{ token?: string }>(c);
    if (!token) return c.json({ error: "token required" }, 400);
    const result = await acceptInvite(token, c.get("user").id);
    if (!result) return c.json({ error: "invite not found or expired" }, 404);
    if ("error" in result) return c.json({ error: "this workspace is out of seats" }, 402);
    return c.json({ ok: true, workspaceId: result.workspaceId, name: result.name });
});

workspace.delete("/workspace/members/:userId", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    if (!ownerOnly(ws, user.id))
        return c.json({ error: "only the workspace owner can remove members" }, 403);
    const target = c.req.param("userId");
    if (target === ws.ownerId) return c.json({ error: "the owner can't be removed" }, 400);
    await removeMember(ws.id, target);
    return c.json({ ok: true });
});

workspace.post("/workspace/switch", requireUser, async (c) => {
    const { workspaceId } = await readJson<{ workspaceId?: string }>(c);
    if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
    const ok = await switchWorkspace(c.get("user").id, workspaceId);
    return ok ? c.json({ ok: true }) : c.json({ error: "not a member of that workspace" }, 403);
});
