import type { ArtifactContent } from "@model/artifact";

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

export interface Template {
    id: string;
    name: string;
    category: string;
    description: string;
    content: ArtifactContent;
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
