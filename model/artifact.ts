import type { ElementLayout } from "@model/geometry";

export type Id = string;

// data is interpreted by its ElementSpec; a container's children live in data
export interface ElementInstance {
    type: string;
    data: unknown;
    layout?: ElementLayout;
}

// legacy; retained only for @model/section's migration
export interface Cell {
    element?: ElementInstance;
}

export interface SectionBackground {
    kind: "none" | "color" | "gradient" | "image";
    color?: string;
    gradient?: { from: string; to: string; angle?: number };
    image?: string;
    scrim?: number; // 0..1 dark overlay for text legibility
    dark?: boolean; // override auto contrast
}

// per-section size override; only for paged rendering (Present/export)
export interface SectionFrame {
    aspect?: number;
}

export interface Section {
    id: Id;
    root: ElementInstance; // one recursive container/leaf tree
    background?: SectionBackground;
    bleed?: boolean; // full-bleed edge-to-edge vs a contained card
    frame?: SectionFrame;
}

export interface ArtifactContent {
    format: Id;
    theme: Id;
    sections: Section[];
    background?: SectionBackground; // document-level backdrop behind all sections
}

// a cover snippet from the first section, for library preview
export interface Cover {
    eyebrow?: string;
    title?: string;
    sub?: string;
    image?: string;
}

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

export interface Artifact extends ArtifactSummary {
    draftContent: ArtifactContent;
}

// create or patch — every field optional
export interface ArtifactInput {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: ArtifactContent;
    folderId?: string | null;
}
