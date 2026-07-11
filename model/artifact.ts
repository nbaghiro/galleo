// The artifact, end to end — its content tree and the wire shapes that describe it. One artifact is a
// list of sections; each section's content is ONE recursive tree (`root`) — a container (row/col of
// children, each carrying its own width) whose leaves are content elements, nestable to any depth.
// Every element's `data` stays schema-flexible (its ElementSpec reads it). The DTOs at the bottom are the
// HTTP shapes the backend + frontend share, colocated with the type they summarize so they can never
// drift from it. Pure types (+ nothing else). The shared floor. (Sizing/layout lives in `@model/geometry`;
// the legacy `{ grid, cells }` → `root` conversion lives in `@model/section`.)

import type { ElementLayout } from "@model/geometry";

export type Id = string;

// A registered content component instance; `data` is interpreted by its ElementSpec. A container element
// (group/card/…) carries its children inside `data`; each child's `layout.width` sets its column share.
export interface ElementInstance {
    type: string;
    data: unknown;
    layout?: ElementLayout;
}

// Legacy per-cell wrapper (the old `{ grid, cells }` section shape). Retained only so `@model/section`
// can migrate historical content + AI output into the recursive `root`; no longer part of `Section`.
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

// A section's own frame override — how it wants to be sized independent of the format default. `aspect`
// (width : height) drives paged rendering (Present/export), so a deck can hold a 21:9 hero or a square
// panel among its 16:9 slides ("custom section dimensions"). Absent → the format's frame. Continuous
// formats size to content, so a frame is only consulted for paged rendering.
export interface SectionFrame {
    aspect?: number;
}

export interface Section {
    id: Id;
    root: ElementInstance; // the section's content: one recursive container/leaf tree
    background?: SectionBackground;
    bleed?: boolean; // full-bleed (edge-to-edge) vs a contained card
    frame?: SectionFrame; // optional per-section size override (see SectionFrame)
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
