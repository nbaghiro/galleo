import type { ArtifactContent } from "@model/content";
import type { Tokens } from "@themes/theme";

// Typed client over the backend (proxied at /api/* in dev → :8601). Cookies carry the session.

export interface ApiUser {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}
export interface ApiCover {
    eyebrow?: string;
    title?: string;
    sub?: string;
    image?: string;
}
export interface ApiSection {
    title?: string;
    kind: string;
}
export interface ArtifactSummary {
    id: string;
    title: string;
    themeId: string;
    formatId: string;
    folderId?: string | null;
    updatedAt: string;
    trashedAt?: string | null;
    cover?: ApiCover;
    sections?: ApiSection[];
}
export interface ApiFolder {
    id: string;
    name: string;
    parentId?: string | null;
    createdAt: string;
}
export interface Artifact extends ArtifactSummary {
    draftContent: ArtifactContent;
}
export interface ApiTemplate {
    id: string;
    name: string;
    category: string;
    description: string;
    content: ArtifactContent;
}
export interface ApiTheme {
    id: string;
    name: string;
    tokens: Tokens;
    mood: string | null;
    isDark: boolean;
}
type ThemeInput = { name: string; tokens: Tokens; mood: string | null; isDark: boolean };

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

type SavePatch = Partial<{
    title: string;
    themeId: string;
    formatId: string;
    draftContent: ArtifactContent;
    folderId: string | null;
}>;

export const api = {
    me: () => req<{ user: ApiUser }>("/me"),
    login: (email: string, password: string) =>
        req<{ user: ApiUser }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    listArtifacts: () => req<{ artifacts: ArtifactSummary[] }>("/artifacts"),
    listTemplates: () => req<{ templates: ApiTemplate[] }>("/templates"),
    getArtifact: (id: string) => req<{ artifact: Artifact }>(`/artifacts/${id}`),
    createArtifact: (patch: SavePatch) =>
        req<{ id: string }>("/artifacts", { method: "POST", body: JSON.stringify(patch) }),
    listTrash: () => req<{ artifacts: ArtifactSummary[] }>("/artifacts?trashed=1"),
    trashArtifact: (id: string) => req<{ ok: true }>(`/artifacts/${id}/trash`, { method: "POST" }),
    restoreArtifact: (id: string) =>
        req<{ ok: true }>(`/artifacts/${id}/restore`, { method: "POST" }),
    deleteArtifact: (id: string) => req<{ ok: true }>(`/artifacts/${id}`, { method: "DELETE" }),
    emptyTrash: () => req<{ ok: true }>("/trash", { method: "DELETE" }),
    saveArtifact: (id: string, patch: SavePatch) =>
        req<{ ok: true; updatedAt: string }>(`/artifacts/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        }),
    moveArtifact: (id: string, folderId: string | null) =>
        req<{ ok: true }>(`/artifacts/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ folderId }),
        }),
    listFolders: () => req<{ folders: ApiFolder[] }>("/folders"),
    createFolder: (name: string, parentId?: string | null) =>
        req<{ folder: ApiFolder }>("/folders", {
            method: "POST",
            body: JSON.stringify({ name, parentId: parentId ?? null }),
        }),
    renameFolder: (id: string, name: string) =>
        req<{ folder: ApiFolder }>(`/folders/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
        }),
    deleteFolder: (id: string) => req<{ ok: true }>(`/folders/${id}`, { method: "DELETE" }),
    listThemes: () => req<{ themes: ApiTheme[] }>("/themes"),
    createTheme: (t: ThemeInput) =>
        req<{ theme: ApiTheme }>("/themes", { method: "POST", body: JSON.stringify(t) }),
    updateTheme: (id: string, t: Partial<ThemeInput>) =>
        req<{ theme: ApiTheme }>(`/themes/${id}`, { method: "PATCH", body: JSON.stringify(t) }),
    deleteTheme: (id: string) => req<{ ok: true }>(`/themes/${id}`, { method: "DELETE" }),
};
