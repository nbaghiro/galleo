import type { ArtifactContent } from "@model/artifact";

// The account + library entities that live around artifacts — the user who owns them, the folders that
// organize them, the templates you start them from. Wire DTOs shared backend ↔ frontend; pure types.

export interface User {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}

export interface Folder {
    id: string;
    name: string;
    parentId?: string | null;
    createdAt: string;
}

export interface Template {
    id: string;
    name: string;
    category: string;
    description: string;
    content: ArtifactContent;
}

// --- request bodies ---

export interface LoginBody {
    email?: string;
    password?: string;
}

export interface FolderInput {
    name: string;
    parentId?: string | null;
}
