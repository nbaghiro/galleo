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

// matches oauth_accounts.provider on the backend
export type AuthProvider = "google";

export interface FolderInput {
    name: string;
    parentId?: string | null;
}
