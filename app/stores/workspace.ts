import { createSignal } from "solid-js";
import type { WorkspaceState } from "@app/api";
import { api } from "@app/api";

const [workspaceState, setWorkspaceState] = createSignal<WorkspaceState | null>(null);
export { workspaceState };

export async function loadWorkspace(): Promise<void> {
    try {
        setWorkspaceState(await api.getWorkspace());
    } catch {
        // signed out / no workspace — callers treat null as unknown
    }
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

export async function setMemberRole(userId: string, role: "admin" | "member"): Promise<void> {
    await api.setMemberRole(userId, role);
    await loadWorkspace();
}

// Full reload, like a switch: every store must re-fetch under whatever workspace comes next.
export async function leaveWorkspace(): Promise<void> {
    await api.leaveWorkspace();
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
    await api.switchWorkspace(workspaceId);
    window.location.href = "/";
}
