import { Hono } from "hono";
import { asRole } from "@model/workspace";
import { readJson } from "../utils/http";
import {
    acceptInvite,
    inviteByToken,
    inviteMember,
    liveMembers,
    membershipsOf,
    pendingInvites,
    removeMember,
    renameWorkspace,
    revokeInvite,
    roleOf,
    setMemberRole,
    switchWorkspace,
    transferOwnership,
} from "../core/workspaces";
import { requireRole, requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const workspace = new Hono<WorkspaceEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const grantable = (raw: unknown): raw is "admin" | "member" => raw === "admin" || raw === "member";

workspace.get("/workspace", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const role = (await roleOf(ws, user.id)) ?? "member";
    const [members, invites, memberships] = await Promise.all([
        liveMembers(ws.id),
        role === "member" ? Promise.resolve([]) : pendingInvites(ws.id),
        membershipsOf(user.id),
    ]);
    return c.json({
        workspace: { id: ws.id, name: ws.name, plan: ws.plan, seats: ws.seats },
        role,
        members: members.map((m) => ({
            ...m,
            role: m.userId === ws.ownerId ? "owner" : asRole(m.role),
            isOwner: m.userId === ws.ownerId,
        })),
        invites,
        memberships: memberships.map((m) => ({ ...m, active: m.id === ws.id })),
    });
});

workspace.patch("/workspace", requireWorkspace, requireRole("admin"), async (c) => {
    const { name } = await readJson<{ name?: string }>(c);
    const trimmed = name?.trim();
    if (!trimmed) return c.json({ error: "a name is required" }, 400);
    await renameWorkspace(c.get("ws").id, trimmed.slice(0, 80));
    return c.json({ ok: true });
});

workspace.post("/workspace/invites", requireWorkspace, requireRole("admin"), async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const { email, role } = await readJson<{ email?: string; role?: string }>(c);
    const target = email?.trim().toLowerCase();
    if (!target || !EMAIL_RE.test(target))
        return c.json({ error: "a valid email is required" }, 400);

    const result = await inviteMember(ws, user, target, grantable(role) ? role : "member");
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

workspace.delete("/workspace/invites/:id", requireWorkspace, requireRole("admin"), async (c) => {
    await revokeInvite(c.get("ws").id, c.req.param("id"));
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

workspace.delete(
    "/workspace/members/:userId",
    requireWorkspace,
    requireRole("admin"),
    async (c) => {
        const [user, ws] = [c.get("user"), c.get("ws")];
        const target = c.req.param("userId");
        if (target === ws.ownerId) return c.json({ error: "the owner can't be removed" }, 400);
        // removing a fellow admin is an owner call, not a peer one
        const targetRole = await roleOf(ws, target);
        if (targetRole === "admin" && ws.ownerId !== user.id)
            return c.json({ error: "only the workspace owner can remove an admin" }, 403);
        await removeMember(ws.id, target);
        return c.json({ ok: true });
    },
);

workspace.patch("/workspace/members/:userId", requireWorkspace, requireRole("owner"), async (c) => {
    const ws = c.get("ws");
    const target = c.req.param("userId");
    if (target === ws.ownerId)
        return c.json({ error: "the owner's role can't be changed — transfer instead" }, 400);
    const { role } = await readJson<{ role?: string }>(c);
    if (!grantable(role)) return c.json({ error: "role must be admin or member" }, 400);
    const ok = await setMemberRole(ws.id, target, role);
    return ok ? c.json({ ok: true }) : c.json({ error: "not a member" }, 404);
});

workspace.post("/workspace/leave", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    if (ws.ownerId === user.id)
        return c.json({ error: "the owner can't leave — transfer ownership first" }, 400);
    await removeMember(ws.id, user.id);
    return c.json({ ok: true });
});

workspace.post("/workspace/transfer", requireWorkspace, requireRole("owner"), async (c) => {
    const { userId } = await readJson<{ userId?: string }>(c);
    if (!userId) return c.json({ error: "userId required" }, 400);
    const ok = await transferOwnership(c.get("ws"), userId);
    return ok
        ? c.json({ ok: true })
        : c.json({ error: "the new owner must already be a member" }, 400);
});

workspace.post("/workspace/switch", requireUser, async (c) => {
    const { workspaceId } = await readJson<{ workspaceId?: string }>(c);
    if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
    const ok = await switchWorkspace(c.get("user").id, workspaceId);
    return ok ? c.json({ ok: true }) : c.json({ error: "not a member of that workspace" }, 403);
});
