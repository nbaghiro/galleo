import type {
    Artifact,
    ArtifactContent,
    ArtifactInput,
    ArtifactPage,
    ArtifactWindow,
    ContentPatch,
    ElementInstance,
    SearchResponse,
    Section,
} from "@model/artifact";
import type { Folder, Template, User } from "@model/workspace";
import type { ThemeSummary as Theme, ThemeInput, Tokens } from "@themes";
import type { CreditPack, CreditPackId, Interval, Plan, PlanId } from "@model/billing";
import type { FeatureKey, FeatureStatus, Features } from "@model/features";
import type { GenMeta } from "@model/genmeta";
import type { BriefDraft, TurnEvent, TurnRequest } from "@model/ai";
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
    generateVideo: boolean;
}

// GET /billing — plan + live usage + plan catalog
export interface BillingState {
    plan: PlanId;
    status: string;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    credits: { used: number; limit: number; bonus: number; perGeneration: number };
    usage: { artifacts: number; maxArtifacts: number };
    seats: number;
    catalog: Plan[];
    topUps: CreditPack[];
    stripeReady: boolean;
}

// GET /billing/ledger — the credit ledger (spends negative, refunds/grants positive)
export interface LedgerEntry {
    delta: number;
    reason: string;
    balanceAfter: number;
    at: string;
}

// GET /workspace — members, pending invites (owner only), and the user's memberships
export interface WorkspaceMember {
    userId: string;
    role: string;
    joinedAt: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    isOwner: boolean;
}

export interface WorkspaceInvite {
    id: string;
    email: string;
    createdAt: string;
    expiresAt: string;
}

export interface WorkspaceState {
    workspace: { id: string; name: string; plan: PlanId; seats: number };
    role: "owner" | "member";
    members: WorkspaceMember[];
    invites: WorkspaceInvite[];
    memberships: { id: string; name: string; active: boolean }[];
}

// GET /features — resolved capabilities + each feature's launch status
export interface FeaturesState {
    features: Features;
    status: Record<FeatureKey, FeatureStatus>;
    modelDebug: ModelDebugInfo | null;
}

// present only when the server honours x-galleo-models; null otherwise (production default)
export interface ModelDebugInfo {
    tasks: string[];
    models: { id: string; label: string; provider: string }[];
    defaults: Record<string, string>; // already resolved for this workspace's tier
}

type ApiCoverShape = { eyebrow?: string; title?: string; sub?: string; image?: string };

// public = anyone with URL; protected = URL + password; private = invited emails only
export type Visibility = "public" | "protected" | "private";

export interface ShareRecipient {
    id: string;
    email: string;
    url: string;
    invitedAt: string;
    lastViewedAt: string | null;
}

// GET /links row
export interface LinkSummary {
    id: string;
    artifactId: string;
    // joined server-side: the Shared view renders a row without the library list being loaded
    artifact: {
        id: string;
        title: string;
        formatId: string;
        themeId: string;
        cover?: ApiCoverShape;
    };
    slug: string;
    name: string | null; // owner-facing label, never shown to viewers
    visibility: Visibility;
    url: string;
    recipientCount: number;
    openedCount: number; // invited recipients who've opened (private links)
    viewCount: number;
    lastViewedAt: string | null;
    publishedAt: string;
}

// one share link (PATCH /links/:id responses carry no recipients)
export interface LinkCore {
    id: string;
    slug: string;
    name: string | null;
    visibility: Visibility;
    hasPassword: boolean;
    url: string;
    publishedAt: string;
    viewCount: number;
    lastViewedAt: string | null;
}

// GET/POST /artifacts/:id/links — a link with its recipient roster
export interface LinkState extends LinkCore {
    recipients: ShareRecipient[];
}

// GET /links/:id/analytics — the Premium slice on top of the basic counts
export interface LinkAnalytics {
    totals: {
        views: number;
        lastViewedAt: string | null;
        avgSeconds: number | null; // session duration; null until a heartbeat lands
        completionPct: number | null; // avg furthest slide/section reached, 0-100
    };
    days: { day: string; views: number }[]; // sparse, last 30 days, "YYYY-MM-DD"
    referrers: { source: string; views: number }[]; // hostname or "direct"
    devices: { device: string; views: number }[];
    recipients?: {
        id: string;
        email: string;
        views: number;
        lastViewedAt: string | null;
        completionPct: number | null;
    }[]; // private links only
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
// an unauthenticated raw body, so the shape is checked here; `content` stays one assertion, since
// the renderer validates it
function readPublicContent(d: Record<string, unknown>): PublicContent | null {
    if (typeof d.title !== "string" || typeof d.content !== "object" || d.content === null) {
        return null;
    }
    return {
        title: d.title,
        content: d.content as ArtifactContent,
        branded: d.branded === true,
        customTheme: (d.customTheme as CustomThemeRecord | null | undefined) ?? null,
    };
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
    ArtifactWindow,
    Artifact,
    ContentPatch,
    SearchHit,
    SearchResponse,
} from "@model/artifact";
export type {
    User as ApiUser,
    Folder as ApiFolder,
    Template as ApiTemplate,
} from "@model/workspace";
export type { ThemeSummary as ApiTheme } from "@themes";

import { modelHeaders } from "./stores/models";

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
        ...init,
        headers: { "Content-Type": "application/json", ...modelHeaders(), ...init?.headers },
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
    authProviders: () => req<{ google: boolean }>("/auth/providers"),
    forgotPassword: (email: string) =>
        req<{ ok: true }>("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) =>
        req<{ user: User }>("/auth/reset", {
            method: "POST",
            body: JSON.stringify({ token, password }),
        }),
    resendVerification: () => req<{ ok: true }>("/auth/resend-verification", { method: "POST" }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    // `qs` carries the page's filters + cursor; the server owns folder/format/sort so pages stay coherent
    listArtifacts: (qs = "") => req<ArtifactPage>(`/artifacts${qs ? `?${qs}` : ""}`),
    listTemplates: () => req<{ templates: Template[] }>("/templates"),
    getArtifact: (id: string) => req<{ artifact: Artifact }>(`/artifacts/${id}`),
    // the shell + the full section index + only the sections asked for
    getArtifactWindow: (id: string, from: number, count: number) =>
        req<{ artifact: ArtifactWindow }>(`/artifacts/${id}?window=${from}:${count}`),
    getSections: (id: string, at: { ids: string[] } | { from: number; count: number }) =>
        req<{ sections: Section[] }>(
            "ids" in at
                ? `/artifacts/${id}/sections?ids=${at.ids.map(encodeURIComponent).join(",")}`
                : `/artifacts/${id}/sections?window=${at.from}:${at.count}`,
        ),
    // send what changed, not the whole tree
    patchContent: (id: string, patch: ContentPatch) =>
        req<{ ok: true; updatedAt: string; total: number }>(`/artifacts/${id}/content`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        }),
    createArtifact: (patch: ArtifactInput) =>
        req<{ id: string }>("/artifacts", { method: "POST", body: JSON.stringify(patch) }),
    getAiMeta: (id: string) =>
        req<{ meta: GenMeta | null }>(`/artifacts/${id}/ai-meta`).then((r) => r.meta),
    suggestSections: (content: ArtifactContent) =>
        req<{ suggestions: string[] }>("/ai/suggest", {
            method: "POST",
            body: JSON.stringify({ content }),
        }).then((r) => r.suggestions),
    // `previous` asks for a different reading of the same prompt
    draftBrief: (
        prompt: string,
        surface?: string,
        previous?: { goal: string; audience: string; tone: string; mustInclude?: string[] },
    ) =>
        req<{ brief: BriefDraft | null }>("/ai/brief", {
            method: "POST",
            body: JSON.stringify({ prompt, surface, previous }),
        }).then((r) => r.brief),
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
    // q empty = the recents landing state; signal lets the palette cancel a superseded keystroke
    search: (q: string, limit?: number, signal?: AbortSignal, offset?: number) =>
        req<SearchResponse>(
            `/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}` +
                (offset ? `&offset=${offset}` : ""),
            signal ? { signal } : undefined,
        ),
    recordVisit: (id: string) => req<{ ok: true }>(`/artifacts/${id}/visit`, { method: "POST" }),
    listTrash: () => req<ArtifactPage>("/artifacts?trashed=1&limit=100"),
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
    resumePlan: () => req<{ ok?: boolean }>("/billing/resume", { method: "POST" }),
    getLedger: () => req<{ entries: LedgerEntry[] }>("/billing/ledger"),
    topUp: (pack: CreditPackId) =>
        req<{ url: string }>("/billing/topup", { method: "POST", body: JSON.stringify({ pack }) }),
    getWorkspace: () => req<WorkspaceState>("/workspace"),
    inviteMember: (email: string) =>
        req<{ invite: WorkspaceInvite; url: string; sent: boolean }>("/workspace/invites", {
            method: "POST",
            body: JSON.stringify({ email }),
        }),
    revokeInvite: (id: string) =>
        req<{ ok: boolean }>(`/workspace/invites/${id}`, { method: "DELETE" }),
    removeMember: (userId: string) =>
        req<{ ok: boolean }>(`/workspace/members/${userId}`, { method: "DELETE" }),
    switchWorkspace: (workspaceId: string) =>
        req<{ ok: boolean }>("/workspace/switch", {
            method: "POST",
            body: JSON.stringify({ workspaceId }),
        }),
    inviteInfo: (token: string) =>
        req<{ workspace: string; email: string }>(`/invites/${encodeURIComponent(token)}`),
    acceptInvite: (token: string) =>
        req<{ ok: boolean; workspaceId: string; name: string }>("/invites/accept", {
            method: "POST",
            body: JSON.stringify({ token }),
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
    getArtifactLinks: (artifactId: string) =>
        req<{ links: LinkState[] }>(`/artifacts/${artifactId}/links`),
    createLink: (
        artifactId: string,
        body: {
            name?: string | null;
            visibility?: Visibility;
            password?: string | null;
            recipients?: string[];
            message?: string | null;
        },
    ) =>
        req<{ link: LinkState }>(`/artifacts/${artifactId}/links`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    updateLink: (
        id: string,
        patch: { name?: string | null; visibility?: Visibility; password?: string | null },
    ) =>
        req<{ link: LinkCore }>(`/links/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
        }),
    deleteLink: (id: string) => req<{ ok: true }>(`/links/${id}`, { method: "DELETE" }),
    getLinkAnalytics: (id: string) => req<LinkAnalytics>(`/links/${id}/analytics`),
    getArtifactAnalytics: (artifactId: string) =>
        req<LinkAnalytics>(`/artifacts/${artifactId}/analytics`),
    addRecipients: (linkId: string, emails: string[], message?: string | null) =>
        req<{ recipients: ShareRecipient[] }>(`/links/${linkId}/recipients`, {
            method: "POST",
            body: JSON.stringify({ emails, message: message ?? null }),
        }),
    removeRecipient: (linkId: string, recipientId: string) =>
        req<{ ok: true }>(`/links/${linkId}/recipients/${recipientId}`, { method: "DELETE" }),
    // UNAUTHENTICATED — used by the public viewer
    getPublicContent: async (
        slug: string,
        opts?: { pw?: string; k?: string; ref?: string },
    ): Promise<PublicResult> => {
        const q = new URLSearchParams();
        if (opts?.pw) q.set("pw", opts.pw);
        if (opts?.k) q.set("k", opts.k);
        if (opts?.ref) q.set("ref", opts.ref.slice(0, 300));
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
        if (res.ok) {
            const content = readPublicContent(data);
            // a 200 whose body isn't the expected shape is a broken response, not content
            if (content) return { ok: true, content };
            return { ok: false, status: 502, customTheme: null };
        }
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
        headers: { "Content-Type": "application/json", ...modelHeaders() },
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

// POST /media/generate-video stream event ("progress" heartbeats while the Veo operation polls)
export interface MediaVideoGenEvent {
    type: "progress" | "video" | "fail" | "done";
    item?: MediaItem; // present on "video"
    error?: string; // present on "fail"
    produced?: number; // present on "done"
}

// throws ApiError pre-stream (e.g. 402)
async function streamPost<T>(
    path: string,
    body: unknown,
    onEvent: (event: T) => void,
    signal?: AbortSignal,
): Promise<void> {
    const res = await fetch(`/api${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...modelHeaders() },
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
                    onEvent(JSON.parse(json) as T);
                } catch {
                    // skip a malformed frame
                }
            }
        }
    }
}

export function streamGenerateMedia(
    body: MediaGenerateRequest,
    onEvent: (event: MediaGenEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    return streamPost("/media/generate", body, onEvent, signal);
}

// stream one generated Veo clip (progress heartbeats, then the item; ~1–2 min)
export function streamGenerateVideo(
    body: { prompt: string; aspect?: string },
    onEvent: (event: MediaVideoGenEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    return streamPost("/media/generate-video", body, onEvent, signal);
}
