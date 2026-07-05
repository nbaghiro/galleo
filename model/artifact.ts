// The artifact, end to end — its content tree and the wire shapes that describe it. One artifact is a
// tree of sections → cells → elements; each element's `data` stays schema-flexible (its ElementSpec reads
// it). The DTOs at the bottom are the HTTP shapes the backend + frontend share, colocated with the type
// they summarize so they can never drift from it. Pure types (+ nothing else). The shared floor.
// (Sizing/layout primitives live in `@model/geometry`.)

import type { ElementLayout } from "@model/geometry";

export type Id = string;

// A registered content component instance; `data` is interpreted by its ElementSpec.
export interface ElementInstance {
    type: string;
    data: unknown;
    layout?: ElementLayout;
}

export interface Cell {
    element?: ElementInstance;
}

export interface SectionBackground {
    kind: "none" | "color" | "gradient" | "image";
    color?: string;
    gradient?: { from: string; to: string; angle?: number };
    image?: string;
    scrim?: number; // 0..1 dark overlay over an image for text legibility
    dark?: boolean; // override auto contrast (light text on dark backgrounds)
}

export interface Section {
    id: Id;
    grid: string; // grid template id, e.g. "split-6040"
    widths?: number[]; // custom column fractions (per grid cell, summing to 1) — overrides the preset
    cells: Record<string, Cell>;
    background?: SectionBackground;
    bleed?: boolean; // full-bleed (edge-to-edge) vs a contained card
}

export interface ArtifactContent {
    format: Id;
    theme: Id;
    sections: Section[];
    background?: SectionBackground; // document-level backdrop behind all sections
}

// --- wire DTOs (the artifact's HTTP shapes, shared backend ↔ frontend) ---

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

// Create or patch an artifact — every field optional (a create supplies most, an autosave a subset).
export interface ArtifactInput {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: ArtifactContent;
    folderId?: string | null;
}
