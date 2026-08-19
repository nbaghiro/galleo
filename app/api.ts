import type {
    Artifact,
    ArtifactAccess,
    ArtifactContent,
    ArtifactInput,
    ArtifactPage,
    ArtifactWindow,
    Collaborator,
    ContentPatch,
    GenMeta,
    ElementInstance,
    SearchResponse,
    Section,
    SharedArtifact,
} from "@model/artifact";
import { asContent } from "@model/artifact";
import type { CommentCreateBody, CommentDto, CommentEditBody } from "@model/comments";
import type { Usage } from "@model/credits";
import type { EvalCheck, EvalJudgement, EvalRun, EvalRunSummary, Rubric } from "@model/eval";
import type {
    AccountConnection,
    AuthProvider,
    Folder,
    Membership,
    PublishPolicy,
    User,
    UserPrefs,
    OnboardingState,
    WorkspaceRole,
} from "@model/workspace";
import type { Template } from "@model/templates";
import type { ThemeSummary as Theme, ThemeInput, Tokens } from "@themes";
import type {
    AddOn,
    AddOnId,
    CreditPack,
    CreditPackId,
    Interval,
    Plan,
    PlanId,
    FeatureKey,
    FeatureStatus,
    Features,
    ScheduledChange,
} from "@model/billing";
import type { BriefDraft, TurnEvent, TurnRequest } from "@model/ai";
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
    credits: {
        balance: number; // spendable now; unspent credits carry across the roll
        monthlyGrant: number; // what the subscription adds at each roll
        perGeneration: number;
        resetAt: string;
        mySpend: number; // the caller's own spend this cycle
    };
    usage: { artifacts: number; maxArtifacts: number; storageMb: number; maxStorageMb: number };
    scheduledChange: ScheduledChange | null; // a downgrade parked at period end
    seats: number;
    includedSeats: number; // what the plan covers; anything above is the seat add-on
    catalog: Plan[];
    addOns: AddOn[]; // recurring, purchasable here (an unconfigured price is already filtered out)
    addOnQuantities: Record<AddOnId, number>;
    packs: CreditPack[]; // one-off credit purchases
    stripeReady: boolean;
}

// GET /billing/ledger — the credit ledger (spends negative, refunds/grants positive)
export interface LedgerEntry {
    delta: number;
    reason: string;
    usage: Usage | null;
    balanceAfter: number;
    at: string;
    user: { name: string | null; email: string; avatarUrl: string | null } | null;
}

export interface LedgerPage {
    entries: LedgerEntry[];
    nextCursor: string | null;
}

// GET /workspace — members, pending invites (owner only), and the user's memberships
export interface WorkspaceMember {
    userId: string;
    role: WorkspaceRole;
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
    workspace: {
        id: string;
        name: string;
        plan: PlanId;
        seats: number;
        defaultArtifactAccess: ArtifactAccess;
        publishPolicy: PublishPolicy;
        memberCreditCap: number | null;
    };
    role: WorkspaceRole;
    members: WorkspaceMember[];
    invites: WorkspaceInvite[];
    memberships: Membership[];
}

// GET /features — resolved capabilities + each feature's launch status
export interface FeaturesState {
    features: Features;
    status: Record<FeatureKey, FeatureStatus>;
    models: ModelCatalogue;
}

export interface ModelCatalogue {
    tasks: string[];
    models: { id: string; label: string; provider: string; locked: boolean }[];
    defaults: Record<string, string>; // already resolved for this workspace's tier
    rates: Record<string, number>; // credit multiplier per model, baseline 1.0
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
// an unauthenticated raw body, so the shape is checked here; asContent() fills the shell defaults
// rather than trusting the payload to be an ArtifactContent because the column said so
function readPublicContent(d: Record<string, unknown>): PublicContent | null {
    if (typeof d.title !== "string" || typeof d.content !== "object" || d.content === null) {
        return null;
    }
    return {
        title: d.title,
        content: asContent(d.content),
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

// names the caller's collaboration connection on a write, so the room can skip its own author
export const CONN_HEADER = "x-galleo-conn";

// typed client over /api/* (dev proxy → :8601); cookies carry the session
export type { ArtifactSummary, SearchHit } from "@model/artifact";
export type { ArtifactAccess, Collaborator, SharedArtifact } from "@model/artifact";
export type {
    User as ApiUser,
    Folder as ApiFolder,
    PublishPolicy,
    AccountConnection,
    AuthProvider,
    Membership,
    UserPrefs,
} from "@model/workspace";
export type { Template as ApiTemplate } from "@model/templates";

// the context library's wire shapes (server: services/api/context.ts)
export interface ContextSummary {
    id: string;
    name: string;
    description: string | null;
    items: number;
    clusters: number[]; // chunk count per source, newest first
    updatedAt: string;
}
export interface ContextItemMeta {
    id: string;
    kind: "file" | "link" | "artifact" | "template" | "text";
    title: string;
    ref: string | null;
    chars: number;
    chunks: number;
    original: boolean; // a stored source file, renderable via .../original
    createdAt: string;
}
export type NewContextItem =
    | {
          kind: "file" | "text";
          title: string;
          body: string;
          original?: { data: string; mime: string };
      }
    | { kind: "link"; url: string }
    | { kind: "artifact"; artifactId: string }
    | { kind: "template"; templateId: string };
export type { ThemeSummary as ApiTheme } from "@themes";

import { modelHeaders } from "./stores/models";

/** The remedies a 402 body offers; absent on every other failure. */
export interface ErrorRemedies {
    upgrade?: boolean;
    topUp?: boolean;
    remaining?: number;
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        // carried through so the client offers what the server says applies, rather than guessing
        // from the status: which remedy is available depends on the workspace's plan
        public remedies: ErrorRemedies = {},
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
        const body = data as { error?: string } & ErrorRemedies;
        const msg =
            body.error ?? (res.status >= 500 ? "Server error. Please try again" : res.statusText);
        throw new ApiError(res.status, msg, {
            upgrade: body.upgrade,
            topUp: body.topUp,
            remaining: body.remaining,
        });
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

    // the account surface; every writer answers with the whole user, so the store adopts one shape
    updateProfile: (name: string | null) =>
        req<{ user: User }>("/me", { method: "PATCH", body: JSON.stringify({ name }) }),
    changePassword: (password: string, current?: string) =>
        req<{ user: User }>("/me/password", {
            method: "POST",
            body: JSON.stringify(current ? { current, password } : { password }),
        }),
    // mergeUserPrefs narrows the patch server-side, so the shape here only has to admit what the
    // branches accept: a scalar, a nested branch, or null to clear one
    updatePrefs: (patch: { [K in keyof UserPrefs]?: UserPrefs[K] | null }) =>
        req<{ user: User }>("/me/prefs", { method: "PATCH", body: JSON.stringify(patch) }),
    getOnboarding: () => req<{ onboarding: OnboardingState }>("/onboarding"),
    getConnections: () => req<{ connections: AccountConnection[] }>("/me/connections"),
    unlinkConnection: (provider: AuthProvider) =>
        req<{ ok: true }>(`/me/connections/${encodeURIComponent(provider)}`, { method: "DELETE" }),
    getMemberships: () => req<{ memberships: Membership[] }>("/me/workspaces"),
    // `qs` carries the page's filters + cursor; the server owns folder/format/sort so pages stay coherent
    listArtifacts: (qs = "") => req<ArtifactPage>(`/artifacts${qs ? `?${qs}` : ""}`),
    listTemplates: () => req<{ templates: Template[]; uses: Record<string, number> }>("/templates"),

    // the context library
    extractFile: (body: { name: string; mime: string; data: string }) =>
        req<{ title: string; text: string; truncated: boolean; via: "text" | "vision" }>(
            "/extract",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
        ),
    fetchWebpage: (url: string) =>
        req<{ title: string; text: string; url: string }>("/webpage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        }),
    listContexts: () => req<{ contexts: ContextSummary[] }>("/contexts"),
    createContext: (name: string, description?: string) =>
        req<{ id: string }>("/contexts", {
            method: "POST",
            body: JSON.stringify({ name, description }),
        }),
    getContextItems: (id: string) => req<{ items: ContextItemMeta[] }>(`/contexts/${id}`),
    getContextItemSnapshot: (id: string, itemId: string) =>
        req<{ body: string }>(`/contexts/${id}/items/${itemId}/snapshot`),
    updateContext: (id: string, patch: { name?: string; description?: string | null }) =>
        req<{ ok: boolean }>(`/contexts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        }),
    deleteContext: (id: string) => req<{ ok: boolean }>(`/contexts/${id}`, { method: "DELETE" }),
    addContextItem: (id: string, item: NewContextItem) =>
        req<{ item: ContextItemMeta }>(`/contexts/${id}/items`, {
            method: "POST",
            body: JSON.stringify(item),
        }),
    removeContextItem: (id: string, itemId: string) =>
        req<{ ok: boolean }>(`/contexts/${id}/items/${itemId}`, { method: "DELETE" }),
    resyncContextItem: (id: string, itemId: string) =>
        req<{ ok: boolean }>(`/contexts/${id}/items/${itemId}/resync`, { method: "POST" }),
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
    // connId names the caller's collaboration socket when it has one, so the room does not send
    // this write back to the client that just made it
    patchContent: (id: string, patch: ContentPatch, connId?: string | null) =>
        req<{ ok: true; updatedAt: string; total: number; seq: number }>(
            `/artifacts/${id}/content`,
            {
                method: "PATCH",
                body: JSON.stringify(patch),
                ...(connId ? { headers: { [CONN_HEADER]: connId } } : {}),
            },
        ),
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
            body: JSON.stringify({
                prompt,
                surface,
                previous,
                // the brief is the first call of a session; without this the run would start at
                // the outline and hide a real model call
                ...(traceTurns()
                    ? { trace: true, ...(session ? { traceSession: session } : {}) }
                    : {}),
            }),
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
    // user-triggered: the refined prompt lands back in the box so it can be edited before generating
    refinePrompt: (req_: { prompt: string; kind: "image" | "video" | "theme"; context?: string }) =>
        req<{ prompt: string }>("/ai/refine", {
            method: "POST",
            body: JSON.stringify(req_),
        }).then((r) => r.prompt),
    // voice dictation: probe once to decide whether the mic renders; each hold mints its own
    // single-use socket url and streams audio browser → provider directly
    voiceStatus: () => req<{ ready: boolean }>("/ai/voice"),
    voiceToken: () => req<{ url: string }>("/ai/voice-token", { method: "POST" }),
    // q empty = the recents landing state; signal lets the palette cancel a superseded keystroke
    search: (q: string, limit?: number, signal?: AbortSignal, offset?: number) =>
        req<SearchResponse>(
            `/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}` +
                (offset ? `&offset=${offset}` : ""),
            signal ? { signal } : undefined,
        ),
    recordVisit: (id: string) => req<{ ok: true }>(`/artifacts/${id}/visit`, { method: "POST" }),

    // comments: one flat list per artifact, threads assembled client-side
    listComments: (id: string) => req<{ comments: CommentDto[] }>(`/artifacts/${id}/comments`),
    createComment: (id: string, body: CommentCreateBody) =>
        req<{ comment: CommentDto }>(`/artifacts/${id}/comments`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    editComment: (id: string, body: string) =>
        req<{ comment: CommentDto }>(`/comments/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ body } satisfies CommentEditBody),
        }),
    resolveComment: (id: string, resolved: boolean) =>
        req<{ comment: CommentDto }>(`/comments/${id}/${resolved ? "resolve" : "unresolve"}`, {
            method: "POST",
        }),
    deleteComment: (id: string) => req<{ ok: true }>(`/comments/${id}`, { method: "DELETE" }),

    // collaborator grants: per-person access to one artifact, outside workspace membership
    // `members` carries the owning workspace's roster with each person's current level on this
    // artifact, so inviting one of them can show what the grant would change
    listCollaborators: (id: string) =>
        req<{ collaborators: Collaborator[]; members: Collaborator[] }>(
            `/artifacts/${id}/collaborators`,
        ),
    inviteCollaborator: (id: string, email: string, access: ArtifactAccess) =>
        req<{ collaborator: Collaborator; url: string | null; sent: boolean }>(
            `/artifacts/${id}/collaborators`,
            { method: "POST", body: JSON.stringify({ email, access }) },
        ),
    setCollaboratorAccess: (id: string, grantId: string, access: ArtifactAccess) =>
        req<{ ok: true }>(`/artifacts/${id}/collaborators/${grantId}`, {
            method: "PATCH",
            body: JSON.stringify({ access }),
        }),
    revokeCollaborator: (id: string, grantId: string) =>
        req<{ ok: true }>(`/artifacts/${id}/collaborators/${grantId}`, { method: "DELETE" }),
    collabInviteInfo: (token: string) =>
        req<{
            artifactId: string;
            title: string;
            workspaceName: string;
            email: string;
            access: ArtifactAccess;
        }>(`/collab/invites/${encodeURIComponent(token)}`),
    acceptCollabInvite: (token: string) =>
        req<{ ok: boolean; artifactId: string }>("/collab/invites/accept", {
            method: "POST",
            body: JSON.stringify({ token }),
        }),
    sharedWithMe: () => req<{ artifacts: SharedArtifact[] }>("/shared-with-me"),

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
    checkout: (opts: {
        plan: PlanId;
        interval?: Interval;
        seats?: number;
        creditBlocks?: number;
    }) =>
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
    getLedger: (cursor?: string | null) =>
        req<LedgerPage>(`/billing/ledger${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    topUp: (pack: CreditPackId) =>
        req<{ url: string }>("/billing/topup", { method: "POST", body: JSON.stringify({ pack }) }),
    getWorkspace: () => req<WorkspaceState>("/workspace"),

    // the eval playground; 404s for anyone who is not an eval admin
    listEvalRuns: (before?: string | null) =>
        req<{ runs: EvalRunSummary[]; nextCursor: string | null }>(
            `/eval/runs${before ? `?before=${encodeURIComponent(before)}` : ""}`,
        ),
    getEvalRun: (id: string) => req<{ run: EvalRun }>(`/eval/runs/${id}`),
    getEvalRubric: () => req<{ rubric: Rubric }>("/eval/rubric"),
    judgeEvalRun: (id: string) =>
        req<{ judgements: EvalJudgement[] }>(`/eval/runs/${id}/judge`, { method: "POST" }),
    judgeEvalVisuals: (id: string, images: { id: string; dataUrl: string }[]) =>
        req<{ judgements: EvalJudgement[] }>(`/eval/runs/${id}/judge-visual`, {
            method: "POST",
            body: JSON.stringify({ images }),
        }),
    postEvalChecks: (id: string, checks: EvalCheck[]) =>
        req<{ ok: true }>(`/eval/runs/${id}/checks`, {
            method: "POST",
            body: JSON.stringify({ checks }),
        }),
    inviteMember: (email: string, role: "admin" | "member" = "member") =>
        req<{ invite: WorkspaceInvite; url: string; sent: boolean }>("/workspace/invites", {
            method: "POST",
            body: JSON.stringify({ email, role }),
        }),
    renameWorkspace: (name: string) =>
        req<{ ok: true }>("/workspace", { method: "PATCH", body: JSON.stringify({ name }) }),
    // one admin-gated patch for the workspace's policy settings; omit a key to leave it alone
    updateWorkspaceSettings: (patch: {
        defaultArtifactAccess?: ArtifactAccess;
        publishPolicy?: PublishPolicy;
        memberCreditCap?: number | null;
    }) => req<{ ok: true }>("/workspace", { method: "PATCH", body: JSON.stringify(patch) }),
    // null clears the artifact back to inheriting the workspace default
    setArtifactAccess: (id: string, access: ArtifactAccess | null) =>
        req<{ ok: true; access: ArtifactAccess | null }>(`/artifacts/${id}/access`, {
            method: "PUT",
            body: JSON.stringify({ access }),
        }),
    setMemberRole: (userId: string, role: "admin" | "member") =>
        req<{ ok: true }>(`/workspace/members/${userId}`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
        }),
    // omitting the id leaves the active workspace, which is what the workspace settings page means
    leaveWorkspace: (workspaceId?: string) =>
        req<{ ok: true }>("/workspace/leave", {
            method: "POST",
            body: JSON.stringify(workspaceId ? { workspaceId } : {}),
        }),
    transferOwnership: (userId: string) =>
        req<{ ok: true }>("/workspace/transfer", {
            method: "POST",
            body: JSON.stringify({ userId }),
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
// Eval tracing rides along on whatever turn the studio runs, so the playground exercises the real
// flow rather than a copy of it. Persisted, since turning it on and then navigating to the studio is
// the whole point. The server honours it only for eval admins.
const TRACE_KEY = "galleo.eval.trace";
// Guarded by capability, not existence: node defines a `localStorage` global that has no getItem
// unless it was started with a backing file, and streamTurn is exercised in node tests.
const store = (): Storage | null => {
    const s = typeof localStorage === "undefined" ? null : localStorage;
    return typeof s?.getItem === "function" ? s : null;
};
export const traceTurns = (): boolean => store()?.getItem(TRACE_KEY) === "1";
export const setTraceTurns = (on: boolean): void => {
    if (on) store()?.setItem(TRACE_KEY, "1");
    else store()?.removeItem(TRACE_KEY);
};

// One authoring session; every turn it makes folds into a single eval run.
let session: string | null = null;
export const setTraceSession = (id: string | null): void => {
    session = id;
};

export async function streamTurn(
    request: TurnRequest,
    onEvent: (event: TurnEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    const res = await fetch("/api/ai/turn", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...modelHeaders() },
        body: JSON.stringify(
            traceTurns()
                ? { ...request, trace: true, ...(session ? { traceSession: session } : {}) }
                : request,
        ),
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
