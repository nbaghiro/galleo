import { Hono } from "hono";
import { asRole, isPublishPolicy } from "@model/workspace";
import { isAccess } from "@model/artifact";
import { z } from "zod";
import { BAD_BODY, readJson } from "@services/utils/http";
import { featuresFor, sellsSeats } from "@model/billing";
import { spendByMember } from "@services/core/ledger";
import {
    createMachineClient,
    machineClientsFor,
    revokeMachineClient,
} from "@services/core/authorization";
import { capture } from "@services/utils/analytics";
import {
    acceptInvite,
    inviteByToken,
    inviteMember,
    leaveWorkspace,
    liveMembers,
    membershipsOf,
    pendingInvites,
    removeMember,
    updateWorkspace,
    type WorkspaceSettingsPatch,
    revokeInvite,
    roleOf,
    setMemberRole,
    switchWorkspace,
    transferOwnership,
} from "@services/core/workspaces";
import { syncWorkspaceAccess } from "@services/core/collab";
import { requireRole, requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const workspace = new Hono<WorkspaceEnv>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const grantable = (raw: unknown): raw is "admin" | "member" => raw === "admin" || raw === "member";

workspace.get("/workspace", requireWorkspace, async (c) => {
    const [user, ws, role] = [c.get("user"), c.get("ws"), c.get("role")];
    // the ledger aggregation is priced work; only the settings roster asks for it
    const withSpend = c.req.query("spend") === "1";
    const [members, invites, memberships, spend] = await Promise.all([
        liveMembers(ws.id),
        role === "member" ? Promise.resolve([]) : pendingInvites(ws.id),
        membershipsOf(user.id),
        withSpend ? spendByMember(ws) : Promise.resolve(null),
    ]);
    return c.json({
        workspace: {
            id: ws.id,
            name: ws.name,
            plan: ws.plan,
            seats: ws.seats,
            defaultArtifactAccess: ws.defaultArtifactAccess,
            publishPolicy: ws.publishPolicy,
            prepareAudio: ws.prepareAudio,
            memberCreditCap: ws.memberCreditCap,
        },
        role,
        members: members.map((m) => ({
            ...m,
            role: m.userId === ws.ownerId ? "owner" : asRole(m.role),
            isOwner: m.userId === ws.ownerId,
            ...(spend ? { spend: spend.get(m.userId) ?? 0 } : {}),
        })),
        invites,
        memberships: memberships.map((m) => ({ ...m, active: m.id === ws.id })),
    });
});

const zSettings = z.object({
    name: z.string().optional(),
    defaultArtifactAccess: z.string().optional(),
    publishPolicy: z.string().optional(),
    // null clears the cap back to uncapped, which is why this is nullish rather than optional
    memberCreditCap: z.number().nullish(),
    prepareAudio: z.boolean().optional(),
});
const zInvite = z.object({ email: z.string().optional(), role: z.string().optional() });
const zToken = z.object({ token: z.string().optional() });
const zRole = z.object({ role: z.string().optional() });
const zWorkspaceId = z.object({ workspaceId: z.string().optional() });
const zUserId = z.object({ userId: z.string().optional() });

// One admin-gated patch for the whole workspace: the name and the three policy settings.
workspace.patch("/workspace", requireWorkspace, requireRole("admin"), async (c) => {
    const body = await readJson(c, zSettings);
    if (!body) return c.json(BAD_BODY, 400);
    const patch: WorkspaceSettingsPatch = {};

    if (body.name !== undefined) {
        const trimmed = body.name.trim();
        if (!trimmed) return c.json({ error: "a name is required" }, 400);
        patch.name = trimmed.slice(0, 80);
    }
    if (body.defaultArtifactAccess !== undefined) {
        if (!isAccess(body.defaultArtifactAccess))
            return c.json({ error: "that is not an access level" }, 400);
        patch.defaultArtifactAccess = body.defaultArtifactAccess;
    }
    if (body.publishPolicy !== undefined) {
        if (!isPublishPolicy(body.publishPolicy))
            return c.json({ error: "that is not a publish policy" }, 400);
        patch.publishPolicy = body.publishPolicy;
    }
    if (body.prepareAudio !== undefined) patch.prepareAudio = body.prepareAudio;
    if (body.memberCreditCap !== undefined) {
        const cap = body.memberCreditCap;
        if (cap !== null && (!Number.isFinite(cap) || cap < 0))
            return c.json({ error: "a credit cap is a positive number, or none" }, 400);
        patch.memberCreditCap = cap === null ? null : Math.trunc(cap);
    }

    if (!Object.keys(patch).length) return c.json({ error: "nothing to update" }, 400);
    const ws = c.get("ws");
    await updateWorkspace(ws.id, patch);
    // every artifact that inherits the default just changed level, so open rooms re-resolve
    if (patch.defaultArtifactAccess !== undefined) await syncWorkspaceAccess(ws.id);
    const who = { userId: c.get("user").id, workspaceId: ws.id };
    // The policies are one event with the setting as a property, so a policy added later needs no
    // new name. The value never travels, only its kind. A rename carries nothing queryable.
    for (const setting of Object.keys(patch).filter((k) => k !== "name"))
        capture(who, "workspace_setting_changed", {
            setting,
            value_kind: typeof patch[setting as keyof typeof patch],
        });
    return c.json({ ok: true });
});

workspace.post("/workspace/invites", requireWorkspace, requireRole("admin"), async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const body = await readJson(c, zInvite);
    if (!body) return c.json(BAD_BODY, 400);
    const { email, role } = body;
    const target = email?.trim().toLowerCase();
    if (!target || !EMAIL_RE.test(target))
        return c.json({ error: "a valid email is required" }, 400);

    const result = await inviteMember(ws, user, target, grantable(role) ? role : "member");
    if ("error" in result) {
        if (result.error === "already-member") return c.json({ error: "already a member" }, 409);
        // only the team plan sells seats; elsewhere the honest remedy is the higher tier
        return c.json(
            {
                error: sellsSeats(ws.plan)
                    ? `All ${result.seats} seats are taken. Add seats to invite more people.`
                    : `All ${result.seats} seats are taken. Upgrade to invite more people.`,
                reason: "seats" as const,
                upgrade: true,
            },
            402,
        );
    }
    capture({ userId: user.id, workspaceId: ws.id }, "member_invited", {
        role: asRole(role),
        seats_used: result.seatsUsed,
        seats_total: result.seatsTotal,
        at_seat_limit: result.atSeatLimit,
    });
    return c.json(result);
});

workspace.delete("/workspace/invites/:id", requireWorkspace, requireRole("admin"), async (c) => {
    const hours = await revokeInvite(c.get("ws").id, c.req.param("id"));
    if (hours !== null)
        capture({ userId: c.get("user").id, workspaceId: c.get("ws").id }, "invite_revoked", {
            hours_pending: hours,
        });
    return c.json({ ok: true });
});

// Auth required: the accept page sits behind the app's sign-in gate.
workspace.get("/invites/:token", requireUser, async (c) => {
    const row = await inviteByToken(c.req.param("token"));
    if (!row) return c.json({ error: "invite not found or expired" }, 404);
    return c.json({ workspace: row.ws.name, email: row.invite.email });
});

workspace.post("/invites/accept", requireUser, async (c) => {
    const body = await readJson(c, zToken);
    if (!body) return c.json(BAD_BODY, 400);
    const { token } = body;
    if (!token) return c.json({ error: "token required" }, 400);
    const result = await acceptInvite(token, c.get("user").id);
    if (!result) return c.json({ error: "invite not found or expired" }, 404);
    if ("error" in result)
        return c.json({ error: "this workspace is out of seats", reason: "seats" as const }, 402);
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
        // they are out of the workspace, so any room they are sitting in closes on them
        await syncWorkspaceAccess(ws.id);
        capture({ userId: user.id, workspaceId: ws.id }, "member_removed", {
            role: asRole(targetRole ?? "member"),
            member_count_after: (await liveMembers(ws.id)).length,
        });
        return c.json({ ok: true });
    },
);

workspace.patch("/workspace/members/:userId", requireWorkspace, requireRole("owner"), async (c) => {
    const ws = c.get("ws");
    const target = c.req.param("userId");
    if (target === ws.ownerId)
        return c.json(
            { error: "the owner's role can't be changed, transfer ownership instead" },
            400,
        );
    const body = await readJson(c, zRole);
    if (!body) return c.json(BAD_BODY, 400);
    const { role } = body;
    if (!grantable(role)) return c.json({ error: "role must be admin or member" }, 400);
    const before = await roleOf(ws, target);
    const ok = await setMemberRole(ws.id, target, role);
    // an admin holds edit on every artifact by role alone, so demoting one changes what they may do
    if (ok) await syncWorkspaceAccess(ws.id);
    if (ok)
        capture({ userId: c.get("user").id, workspaceId: ws.id }, "member_role_changed", {
            from_role: asRole(before ?? "member"),
            to_role: role,
        });
    return ok ? c.json({ ok: true }) : c.json({ error: "not a member" }, 404);
});

// Defaults to the active workspace; the account page passes an id to leave one it isn't working in.
workspace.post("/workspace/leave", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const body = await readJson(c, zWorkspaceId);
    if (!body) return c.json(BAD_BODY, 400);
    const { workspaceId } = body;
    const result = await leaveWorkspace(user.id, workspaceId ?? ws.id);
    if (result === "not-member") return c.json({ error: "not a member of that workspace" }, 403);
    if (result === "owner")
        return c.json({ error: "the owner can't leave, transfer ownership first" }, 400);
    await syncWorkspaceAccess(workspaceId ?? ws.id);
    return c.json({ ok: true });
});

workspace.post("/workspace/transfer", requireWorkspace, requireRole("owner"), async (c) => {
    const body = await readJson(c, zUserId);
    if (!body) return c.json(BAD_BODY, 400);
    const { userId } = body;
    if (!userId) return c.json({ error: "userId required" }, 400);
    const ok = await transferOwnership(c.get("ws"), userId);
    return ok
        ? c.json({ ok: true })
        : c.json({ error: "the new owner must already be a member" }, 400);
});

workspace.post("/workspace/switch", requireUser, async (c) => {
    const body = await readJson(c, zWorkspaceId);
    if (!body) return c.json(BAD_BODY, 400);
    const { workspaceId } = body;
    if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
    const ok = await switchWorkspace(c.get("user").id, workspaceId);
    return ok ? c.json({ ok: true }) : c.json({ error: "not a member of that workspace" }, 403);
});

// API credentials: a workspace's own integrations, which authenticate with a secret rather than a
// browser. Administrative, so admin-gated, and entitled like every other paid capability. The
// secret is shown once and never stored in the clear, so a lost one is replaced rather than looked up.
const zCredential = z.object({ name: z.string().min(1).max(80) });

workspace.get("/workspace/credentials", requireWorkspace, requireRole("admin"), async (c) =>
    c.json({ credentials: await machineClientsFor(c.get("ws").id) }),
);

workspace.post("/workspace/credentials", requireWorkspace, requireRole("admin"), async (c) => {
    const ws = c.get("ws");
    if (!featuresFor(ws).apiAccess)
        return c.json(
            { error: "API access is not on this plan", reason: "feature" as const, upgrade: true },
            402,
        );
    const body = await readJson(c, zCredential);
    if (!body) return c.json(BAD_BODY, 400);
    const made = await createMachineClient({
        name: body.name,
        workspaceId: ws.id,
        actorId: c.get("user").id,
    });
    // the only time the secret exists outside the caller's hands
    return c.json(made, 201);
});

workspace.delete(
    "/workspace/credentials/:clientId",
    requireWorkspace,
    requireRole("admin"),
    async (c) => {
        const gone = await revokeMachineClient(
            c.get("ws").id,
            c.req.param("clientId"),
            c.get("user").id,
        );
        return gone ? c.json({ ok: true }) : c.json({ error: "no such credential" }, 404);
    },
);
