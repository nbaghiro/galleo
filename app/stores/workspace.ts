import { createSignal } from "solid-js";
import type { ArtifactAccess, PublishPolicy, WorkspaceState } from "@app/api";
import { api } from "@app/api";
import { identifyUser, register, setWorkspace } from "@ui/analytics";
import { user } from "./auth";

const [workspaceState, setWorkspaceState] = createSignal<WorkspaceState | null>(null);
export { workspaceState };

export async function loadWorkspace(): Promise<void> {
    try {
        const state = await api.getWorkspace();
        setWorkspaceState(state);
        report(state);
    } catch {
        // signed out / no workspace — callers treat null as unknown
    }
}

// The workspace is the billing entity and the credit pool, so it is the unit almost every business
// question is really about. Re-reported on every load, since a role or a seat count can move.
function report(state: WorkspaceState): void {
    const { workspace, role, members, memberships } = state;
    register({ workspace_id: workspace.id, plan_id: workspace.plan, workspace_role: role });
    setWorkspace(workspace.id, {
        plan_id: workspace.plan,
        seats_total: workspace.seats,
        seats_used: members.length,
        member_count: members.length,
    });
    const me = user();
    if (me)
        identifyUser(me.id, {
            workspaces_owned: memberships.filter((m) => m.role === "owner").length,
            workspaces_member_of: memberships.length,
        });
}

export async function inviteMember(
    email: string,
    role: "admin" | "member" = "member",
): Promise<{ url: string; sent: boolean }> {
    const res = await api.inviteMember(email, role);
    await loadWorkspace();
    return res;
}

export async function renameWorkspace(name: string): Promise<void> {
    await api.renameWorkspace(name);
    await loadWorkspace();
}

export async function updateWorkspaceSettings(patch: {
    defaultArtifactAccess?: ArtifactAccess;
    publishPolicy?: PublishPolicy;
    memberCreditCap?: number | null;
}): Promise<void> {
    await api.updateWorkspaceSettings(patch);
    await loadWorkspace();
}

export async function setMemberRole(userId: string, role: "admin" | "member"): Promise<void> {
    await api.setMemberRole(userId, role);
    await loadWorkspace();
}

// Full reload, like a switch: every store must re-fetch under whatever workspace comes next.
// No id means the active one, which is what workspace settings offers.
export async function leaveWorkspace(workspaceId?: string): Promise<void> {
    await api.leaveWorkspace(workspaceId);
    window.location.href = "/";
}

export async function transferOwnership(userId: string): Promise<void> {
    await api.transferOwnership(userId);
    await loadWorkspace();
}

export async function revokeInvite(id: string): Promise<void> {
    await api.revokeInvite(id);
    await loadWorkspace();
}

export async function removeMember(userId: string): Promise<void> {
    await api.removeMember(userId);
    await loadWorkspace();
}

// Full reload: every store (library, billing, themes…) must re-fetch under the new workspace.
export async function switchWorkspace(workspaceId: string): Promise<void> {
    // workspace_switched is emitted server-side: a Membership carries no plan, so the client cannot
    // name the plan it is switching to, and the reload below would race the send anyway.
    await api.switchWorkspace(workspaceId);
    window.location.href = "/";
}
