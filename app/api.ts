import type { ArtifactContent } from "@model/content";

// Typed client over the backend (proxied at /api/* in dev → :8601). Cookies carry the session.

export interface ApiUser {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}
export interface ApiDoc {
    id: string;
    title: string;
    themeId: string;
    formatId: string;
    updatedAt: string;
}
export interface ApiArtifact extends ApiDoc {
    draftContent: ArtifactContent;
}

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
    const data: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as T;
}

type SavePatch = Partial<{ title: string; themeId: string; formatId: string; draftContent: ArtifactContent }>;

export const api = {
    me: () => req<{ user: ApiUser }>("/me"),
    login: (email: string, password: string) =>
        req<{ user: ApiUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    listDocs: () => req<{ artifacts: ApiDoc[] }>("/artifacts"),
    getDoc: (id: string) => req<{ artifact: ApiArtifact }>(`/artifacts/${id}`),
    saveDoc: (id: string, patch: SavePatch) =>
        req<{ ok: true; updatedAt: string }>(`/artifacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};
