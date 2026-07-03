import type {
    Artifact,
    ArtifactInput,
    ArtifactSummary,
    Folder,
    Template,
    Theme,
    ThemeInput,
    User,
} from "@protocol/api";

// Typed client over the backend (proxied at /api/* in dev → :8601). Cookies carry the session. The wire
// shapes live in @protocol/api (shared with the backend); re-exported here under the app's names.
export type {
    User as ApiUser,
    Cover as ApiCover,
    SectionSummary as ApiSection,
    ArtifactSummary,
    Artifact,
    Folder as ApiFolder,
    Template as ApiTemplate,
    Theme as ApiTheme,
} from "@protocol/api";

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    const text = await res.text();
    let data: unknown = {};
    try {
        if (text) data = JSON.parse(text);
    } catch {
        // non-JSON body (e.g. a proxy or framework 500 returns plain text) — don't surface a parse error
    }
    if (!res.ok) {
        const msg =
            (data as { error?: string }).error ??
            (res.status >= 500 ? "Server error — please try again" : res.statusText);
        throw new ApiError(res.status, msg);
    }
    return data as T;
}

export const api = {
    me: () => req<{ user: User }>("/me"),
    login: (email: string, password: string) =>
        req<{ user: User }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    listArtifacts: () => req<{ artifacts: ArtifactSummary[] }>("/artifacts"),
    listTemplates: () => req<{ templates: Template[] }>("/templates"),
    getArtifact: (id: string) => req<{ artifact: Artifact }>(`/artifacts/${id}`),
    createArtifact: (patch: ArtifactInput) =>
        req<{ id: string }>("/artifacts", { method: "POST", body: JSON.stringify(patch) }),
    listTrash: () => req<{ artifacts: ArtifactSummary[] }>("/artifacts?trashed=1"),
    trashArtifact: (id: string) => req<{ ok: true }>(`/artifacts/${id}/trash`, { method: "POST" }),
    restoreArtifact: (id: string) =>
        req<{ ok: true }>(`/artifacts/${id}/restore`, { method: "POST" }),
    deleteArtifact: (id: string) => req<{ ok: true }>(`/artifacts/${id}`, { method: "DELETE" }),
    emptyTrash: () => req<{ ok: true }>("/trash", { method: "DELETE" }),
    saveArtifact: (id: string, patch: ArtifactInput) =>
        req<{ ok: true; updatedAt: string }>(`/artifacts/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        }),
    moveArtifact: (id: string, folderId: string | null) =>
        req<{ ok: true }>(`/artifacts/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ folderId }),
        }),
    listFolders: () => req<{ folders: Folder[] }>("/folders"),
    createFolder: (name: string, parentId?: string | null) =>
        req<{ folder: Folder }>("/folders", {
            method: "POST",
            body: JSON.stringify({ name, parentId: parentId ?? null }),
        }),
    renameFolder: (id: string, name: string) =>
        req<{ folder: Folder }>(`/folders/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
        }),
    deleteFolder: (id: string) => req<{ ok: true }>(`/folders/${id}`, { method: "DELETE" }),
    listThemes: () => req<{ themes: Theme[] }>("/themes"),
    createTheme: (t: ThemeInput) =>
        req<{ theme: Theme }>("/themes", { method: "POST", body: JSON.stringify(t) }),
    updateTheme: (id: string, t: Partial<ThemeInput>) =>
        req<{ theme: Theme }>(`/themes/${id}`, { method: "PATCH", body: JSON.stringify(t) }),
    deleteTheme: (id: string) => req<{ ok: true }>(`/themes/${id}`, { method: "DELETE" }),
};
