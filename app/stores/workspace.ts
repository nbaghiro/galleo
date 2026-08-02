import { createSignal } from "solid-js";
import type { WorkspaceState } from "../api";
import { api } from "../api";

const [workspaceState, setWorkspaceState] = createSignal<WorkspaceState | null>(null);
export { workspaceState };

export async function loadWorkspace(): Promise<void> {
    try {
        setWorkspaceState(await api.getWorkspace());
    } catch {
        // signed out / no workspace — callers treat null as unknown
    }
}

export async function inviteMember(email: string): Promise<{ url: string; sent: boolean }> {
    const res = await api.inviteMember(email);
    await loadWorkspace();
    return res;
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
