import type { ArtifactContent } from "@model/content";
import type { Tokens } from "@themes/theme";

// The HTTP wire contract between the backend (services/api) and the frontend (app/data/api). Both sides
// import these so the request/response JSON shapes can never drift. Pure types only — no fetch, no
// framework, no IO.

// --- entities (response shapes) ---

export interface User {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}

// A tiny cover snippet pulled from an artifact's first section, so the library can preview it.
export interface Cover {
    eyebrow?: string;
    title?: string;
    sub?: string;
    image?: string;
}

// A per-section filmstrip entry: a short label + a coarse kind.
export interface SectionSummary {
    title?: string;
    kind: string;
}

export interface ArtifactSummary {
    id: string;
    title: string;
    themeId: string;
    formatId: string;
    folderId?: string | null;
    updatedAt: string;
    trashedAt?: string | null;
    cover?: Cover;
    sections?: SectionSummary[];
}

// The full artifact record: its metadata (summary) plus the editable content.
export interface Artifact extends ArtifactSummary {
    draftContent: ArtifactContent;
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

export interface Theme {
    id: string;
    name: string;
    tokens: Tokens;
    mood: string | null;
    isDark: boolean;
}

// --- request bodies ---

export interface LoginBody {
    email?: string;
    password?: string;
}

// Create or patch an artifact — every field optional (a create supplies most, an autosave a subset).
export interface ArtifactInput {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: ArtifactContent;
    folderId?: string | null;
}

export interface ThemeInput {
    name: string;
    tokens: Tokens;
    mood: string | null;
    isDark: boolean;
}

export interface FolderInput {
    name: string;
    parentId?: string | null;
}
