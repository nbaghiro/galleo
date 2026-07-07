import type { Artifact, ArtifactInput, ArtifactSummary } from "@model/artifact";
import type { Folder, Template, User } from "@model/workspace";
import type { ThemeSummary as Theme, ThemeInput } from "@themes";
import type { Interval, Plan, PlanId } from "@model/billing";
import type { FeatureKey, FeatureStatus, Features } from "@model/features";
import type { TurnEvent, TurnRequest, AiActionId, AiActionInfo, MeterParams } from "@model/ai";
import type { Usage } from "@model/credits";
import type {
    IconPick,
    IconSearchResponse,
    MediaGenerateRequest,
    MediaItem,
    MediaKind,
    MediaProvider,
    MediaSearchResponse,
    MediaUploadRequest,
} from "@model/media";

// The GET /media/providers response — which sources are configured (have a key), so the rail can badge them.
export interface MediaProvidersState {
    stock: Record<MediaProvider, boolean>;
    generate: boolean;
}

// The GET /billing response — the workspace's plan + live usage + the plan catalog the pricing page renders.
export interface BillingState {
    plan: PlanId;
    status: string;
    periodEnd: string | null;
    credits: { used: number; limit: number; perGeneration: number };
    usage: { artifacts: number; maxArtifacts: number };
    seats: number;
    catalog: Plan[];
    aiActions: AiActionInfo[]; // per-action credit costs ("what a credit buys")
    stripeReady: boolean;
}

// The GET /features response — the workspace's resolved capabilities + each feature's launch status, so
// the app gates UI + badges `planned` features "coming soon" from the same source the backend enforces.
export interface FeaturesState {
    features: Features;
    status: Record<FeatureKey, FeatureStatus>;
}

// Typed client over the backend (proxied at /api/* in dev → :8601). Cookies carry the session. The wire
// shapes live in @model (shared with the backend); re-exported here under the app's names.
export type {
    Cover as ApiCover,
    SectionSummary as ApiSection,
    ArtifactSummary,
    Artifact,
} from "@model/artifact";
export type {
    User as ApiUser,
    Folder as ApiFolder,
    Template as ApiTemplate,
} from "@model/workspace";
export type { ThemeSummary as ApiTheme } from "@themes";

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

    // --- media picker (stock search / AI generation / upload / recent) ---
    mediaProviders: () => req<MediaProvidersState>("/media/providers"),
    searchMedia: (
        provider: MediaProvider,
        q: string,
        page = 1,
        kind: MediaKind = "photo",
        orientation?: string,
    ) =>
        req<MediaSearchResponse>(
            `/media/search?provider=${provider}&q=${encodeURIComponent(q)}&page=${page}&kind=${kind}` +
                (orientation ? `&orientation=${orientation}` : ""),
        ),
    generateMedia: (body: MediaGenerateRequest) =>
        req<{ items: MediaItem[] }>("/media/generate", {
            method: "POST",
            body: JSON.stringify(body),
        }),
    uploadMedia: (body: MediaUploadRequest) =>
        req<{ item: MediaItem }>("/media/upload", { method: "POST", body: JSON.stringify(body) }),
    useMedia: (item: MediaItem) =>
        req<{ item: MediaItem }>("/media/use", { method: "POST", body: JSON.stringify({ item }) }),
    recentMedia: () => req<{ items: MediaItem[] }>("/media/recent"),
    searchIcons: (q: string, limit = 60) =>
        req<IconSearchResponse>(`/media/icons?q=${encodeURIComponent(q)}&limit=${limit}`),
    getIcon: (id: string) => req<{ icon: IconPick }>(`/media/icon?id=${encodeURIComponent(id)}`),
    listThemes: () => req<{ themes: Theme[] }>("/themes"),
    createTheme: (t: ThemeInput) =>
        req<{ theme: Theme }>("/themes", { method: "POST", body: JSON.stringify(t) }),
    updateTheme: (id: string, t: Partial<ThemeInput>) =>
        req<{ theme: Theme }>(`/themes/${id}`, { method: "PATCH", body: JSON.stringify(t) }),
    deleteTheme: (id: string) => req<{ ok: true }>(`/themes/${id}`, { method: "DELETE" }),
    // AI-generate a custom theme from a text prompt → a ThemeInput to preview/save.
    generateTheme: (prompt: string, isDark?: boolean) =>
        req<{ theme: ThemeInput }>("/ai/theme", {
            method: "POST",
            body: JSON.stringify({ prompt, isDark }),
        }),
    getBilling: () => req<BillingState>("/billing"),
    getFeatures: () => req<FeaturesState>("/features"),
    checkout: (opts: { plan: PlanId; interval?: Interval; seats?: number }) =>
        req<{ url: string }>("/billing/checkout", {
            method: "POST",
            body: JSON.stringify(opts),
        }),
    changePlan: (opts: { plan?: PlanId; interval?: Interval; seats?: number }) =>
        req<{ ok?: boolean; effect?: string }>("/billing/change-plan", {
            method: "POST",
            body: JSON.stringify(opts),
        }),
    portal: () => req<{ url: string }>("/billing/portal", { method: "POST" }),
    spendCredits: (body?: {
        amount?: number;
        action?: AiActionId;
        meter?: MeterParams;
        usage?: Usage;
    }) =>
        req<{ remaining: number }>("/billing/spend", {
            method: "POST",
            body: JSON.stringify(body ?? {}),
        }),
};

// Run one AI turn (POST /ai/turn) and deliver each TurnEvent to `onEvent` as it streams over SSE. Throws
// ApiError on a non-stream failure (e.g. 402 out of credits) before the stream begins. The reader is
// aborted via `signal` (cancel / navigate away).
export async function streamTurn(
    request: TurnRequest,
    onEvent: (event: TurnEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    const res = await fetch("/api/ai/turn", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
    });
    if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let msg = res.statusText;
        try {
            msg = (JSON.parse(text) as { error?: string }).error ?? msg;
        } catch {
            // non-JSON error body — keep the status text
        }
        throw new ApiError(res.status, msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            for (const line of frame.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const json = line.slice(5).trim();
                if (!json) continue;
                try {
                    const logged = JSON.parse(json) as { seq: number; event: TurnEvent };
                    onEvent(logged.event);
                } catch {
                    // skip a malformed frame
                }
            }
        }
    }
}
