import type { ArtifactContent } from "@model/artifact";

// account + library wire DTOs (user, folders, templates), shared backend ↔ frontend
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

export interface LoginBody {
    email?: string;
    password?: string;
}

export interface FolderInput {
    name: string;
    parentId?: string | null;
}
