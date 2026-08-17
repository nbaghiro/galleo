// owner derives from workspaces.owner_id, never the role column; admin manages members, member edits
export type WorkspaceRole = "owner" | "admin" | "member";

// legacy rows predate roles and stored "editor"; anything unrecognized reads as a plain member
export const asRole = (raw: string | null | undefined): "admin" | "member" =>
    raw === "admin" ? "admin" : "member";

export interface User {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    emailVerified: boolean; // email/password accounts start false; OAuth accounts land verified
    hasPassword: boolean; // false on an OAuth-only account, which may set one instead of changing it
    prefs: UserPrefs;
}

// Per-account settings that follow the user across browsers, as opposed to the workspace's rows.
// One jsonb column, so a new preference is a field here rather than a migration.
export interface UserPrefs {
    appTheme?: string; // app-chrome theme id; a stale id resolves to the default at read
}

const MAX_PREF_LEN = 64;

// Every read of the column goes through this: the jsonb is client-written, so an unknown key or a
// wrong type is dropped rather than trusted.
export function readUserPrefs(raw: unknown): UserPrefs {
    if (!raw || typeof raw !== "object") return {};
    const { appTheme } = raw as Record<string, unknown>;
    const prefs: UserPrefs = {};
    if (typeof appTheme === "string" && appTheme && appTheme.length <= MAX_PREF_LEN)
        prefs.appTheme = appTheme;
    return prefs;
}

// A patch carries only the keys it changes; null clears one back to the account default.
export function mergeUserPrefs(current: UserPrefs, patch: unknown): UserPrefs {
    if (!patch || typeof patch !== "object") return current;
    const next = { ...current };
    const { appTheme } = patch as Record<string, unknown>;
    if (appTheme === null) delete next.appTheme;
    else if (appTheme !== undefined) {
        const clean = readUserPrefs({ appTheme }).appTheme;
        if (!clean) return current;
        next.appTheme = clean;
    }
    return next;
}

export const MAX_NAME_LEN = 80;

// Returns the stored form: trimmed, capped, and null when the user clears it.
export function cleanDisplayName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim().slice(0, MAX_NAME_LEN);
    return trimmed || null;
}

export interface AccountConnection {
    provider: AuthProvider;
    linkedAt: string;
}

// One workspace the account belongs to; `active` is set only where the reader knows the live tenant.
export interface Membership {
    id: string;
    name: string;
    role: WorkspaceRole;
    active?: boolean;
}

export interface Folder {
    id: string;
    name: string;
    parentId?: string | null;
    createdAt: string;
    count?: number; // live artifacts in the folder, counted server-side (the client list is paged)
}

export interface LoginBody {
    email?: string;
    password?: string;
}

export interface SignupBody {
    email?: string;
    password?: string;
    name?: string;
}

export interface ForgotBody {
    email?: string;
}

export interface ResetBody {
    token?: string;
    password?: string;
}

export interface ProfileBody {
    name?: string | null;
}

// current is absent on an OAuth-only account, which is setting a first password rather than changing one
export interface PasswordBody {
    current?: string;
    password?: string;
}

// matches oauth_accounts.provider on the backend
export type AuthProvider = "google";

export interface FolderInput {
    name: string;
    parentId?: string | null;
}
