import type {
    Artifact,
    ArtifactContent,
    ArtifactInput,
    ArtifactSummary,
    ElementInstance,
} from "@model/artifact";
import type { Folder, Template, User } from "@model/workspace";
import type { ThemeSummary as Theme, ThemeInput, Tokens } from "@themes";
import type { Interval, Plan, PlanId } from "@model/billing";
import type { FeatureKey, FeatureStatus, Features } from "@model/features";
import type { TurnEvent, TurnRequest } from "@model/ai";
import type { ToolId, MeterParams } from "@model/tools";
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

// GET /media/providers — which sources have a key
export interface MediaProvidersState {
    stock: Record<MediaProvider, boolean>;
    generate: boolean;
}

// GET /billing — plan + live usage + plan catalog
export interface BillingState {
    plan: PlanId;
    status: string;
    periodEnd: string | null;
    credits: { used: number; limit: number; perGeneration: number };
    usage: { artifacts: number; maxArtifacts: number };
    seats: number;
    catalog: Plan[];
    stripeReady: boolean;
}

// GET /features — resolved capabilities + each feature's launch status
export interface FeaturesState {
    features: Features;
    status: Record<FeatureKey, FeatureStatus>;
}

// public = anyone with URL; protected = URL + password; private = invited emails only
export type Visibility = "public" | "protected" | "private";

export interface ShareRecipient {
    id: string;
    email: string;
    url: string;
    invitedAt: string;
    lastViewedAt: string | null;
}

// GET /links row; artifact metadata is joined client-side from the library store, keyed by artifactId
export interface LinkSummary {
    id: string;
    artifactId: string;
    slug: string;
    visibility: Visibility;
    url: string;
    recipientCount: number;
    openedCount: number; // invited recipients who've opened (private links)
    publishedAt: string;
}

// GET /links/:artifactId — current publish state
export interface LinkState {
    id: string;
    slug: string;
    visibility: Visibility;
    hasPassword: boolean;
    url: string;
    publishedAt: string;
    recipients: ShareRecipient[];
}

// UNAUTHENTICATED GET /p/:slug/content; custom theme rides along (built-ins already in the viewer registry)
export interface CustomThemeRecord {
    id: string;
    name: string;
    tag: string;
    dark: boolean;
    tokens: Tokens;
}
export interface PublicContent {
    title: string;
    content: ArtifactContent;
    branded: boolean;
    customTheme: CustomThemeRecord | null;
}
// content or a gate; a gated response still carries the theme so the prompt shows themed
export type PublicResult =
    | { ok: true; content: PublicContent }
    | {
          ok: false;
          status: number;
          needsPassword?: boolean;
          theme?: string;
          customTheme?: CustomThemeRecord | null;
          format?: string;
      };

// typed client over /api/* (dev proxy → :8601); cookies carry the session
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
        // non-JSON body — don't surface a parse error
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
    signup: (email: string, password: string, name?: string) =>
        req<{ user: User }>("/auth/signup", {
            method: "POST",
            body: JSON.stringify({ email, password, name }),
        }),
    authProviders: () => req<{ google: boolean; microsoft: boolean }>("/auth/providers"),
    forgotPassword: (email: string) =>
        req<{ ok: true }>("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) =>
        req<{ user: User }>("/auth/reset", {
            method: "POST",
            body: JSON.stringify({ token, password }),
        }),
    resendVerification: () => req<{ ok: true }>("/auth/resend-verification", { method: "POST" }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    listArtifacts: () => req<{ artifacts: ArtifactSummary[] }>("/artifacts"),
    listTemplates: () => req<{ templates: Template[] }>("/templates"),
    getArtifact: (id: string) => req<{ artifact: Artifact }>(`/artifacts/${id}`),
    createArtifact: (patch: ArtifactInput) =>
        req<{ id: string }>("/artifacts", { method: "POST", body: JSON.stringify(patch) }),
    suggestSections: (content: ArtifactContent) =>
        req<{ suggestions: string[] }>("/ai/suggest", {
            method: "POST",
            body: JSON.stringify({ content }),
        }).then((r) => r.suggestions),
    reviseElement: (
        content: ArtifactContent,
        sectionId: string,
        element: ElementInstance,
        instruction?: string,
    ) =>
        req<{ element: ElementInstance }>("/ai/element", {
            method: "POST",
            body: JSON.stringify({ content, sectionId, element, instruction }),
        }).then((r) => r.element),
    assistText: (req_: {
        op: "rewrite" | "translate";
        text: string;
        instruction?: string;
        language?: string;
        context?: string;
    }) =>
        req<{ text: string }>("/ai/text", {
            method: "POST",
            body: JSON.stringify(req_),
        }).then((r) => r.text),
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
        action?: ToolId;
        meter?: MeterParams;
        usage?: Usage;
    }) =>
        req<{ remaining: number }>("/billing/spend", {
            method: "POST",
            body: JSON.stringify(body ?? {}),
        }),

    listLinks: () => req<{ links: LinkSummary[] }>("/links"),
    getLinkState: (artifactId: string) => req<{ link: LinkState | null }>(`/links/${artifactId}`),
    publishArtifact: (
        id: string,
        body: {
            visibility?: Visibility;
            password?: string | null;
            recipients?: string[];
            message?: string | null;
        },
    ) =>
        req<{ slug: string; visibility: Visibility; url: string; recipients?: ShareRecipient[] }>(
            `/artifacts/${id}/publish`,
            { method: "POST", body: JSON.stringify(body) },
        ),
    updateLink: (id: string, patch: { visibility?: Visibility; password?: string | null }) =>
        req<{ link: LinkState }>(`/links/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        }),
    addRecipients: (linkId: string, emails: string[], message?: string | null) =>
        req<{ recipients: ShareRecipient[] }>(`/links/${linkId}/recipients`, {
            method: "POST",
            body: JSON.stringify({ emails, message: message ?? null }),
        }),
    removeRecipient: (linkId: string, recipientId: string) =>
        req<{ ok: true }>(`/links/${linkId}/recipients/${recipientId}`, { method: "DELETE" }),
    unpublishArtifact: (id: string) =>
        req<{ ok: true }>(`/artifacts/${id}/unpublish`, { method: "POST" }),
    // UNAUTHENTICATED — used by the public viewer
    getPublicContent: async (
        slug: string,
        opts?: { pw?: string; k?: string },
    ): Promise<PublicResult> => {
        const q = new URLSearchParams();
        if (opts?.pw) q.set("pw", opts.pw);
        if (opts?.k) q.set("k", opts.k);
        const qs = q.toString();
        // not via req(): a gated 401/429 isn't an error here — read its body
        const res = await fetch(`/api/p/${slug}/content${qs ? `?${qs}` : ""}`, {
            credentials: "same-origin",
        });
        let data: Record<string, unknown> = {};
        try {
            const text = await res.text();
            if (text) data = JSON.parse(text);
        } catch {
            /* non-JSON body */
        }
        if (res.ok) return { ok: true, content: data as unknown as PublicContent };
        return {
            ok: false,
            status: res.status,
            needsPassword: data.needsPassword === true,
            theme: typeof data.theme === "string" ? data.theme : undefined,
            customTheme: (data.customTheme as CustomThemeRecord | null | undefined) ?? null,
            format: typeof data.format === "string" ? data.format : undefined,
        };
    },
};

// stream one AI turn (POST /ai/turn) over SSE; throws ApiError pre-stream (e.g. 402), aborts via signal
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

// POST /media/generate stream event
export interface MediaGenEvent {
    type: "image" | "fail" | "done";
    item?: MediaItem; // present on "image"
    produced?: number; // present on "done" — images made
}

// stream generated images over SSE (each as it's ready); throws ApiError pre-stream (e.g. 402)
export async function streamGenerateMedia(
    body: MediaGenerateRequest,
    onEvent: (event: MediaGenEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    const res = await fetch("/api/media/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
                    onEvent(JSON.parse(json) as MediaGenEvent);
                } catch {
                    // skip a malformed frame
                }
            }
        }
    }
}
