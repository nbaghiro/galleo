import type { ElementLayout } from "@model/geometry";

export type Id = string;

// data is interpreted by its ElementSpec; a container's children live in data
export interface ElementInstance {
    type: string;
    data: unknown;
    layout?: ElementLayout;
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
    id?: Id; // stable section id; absent on digests written before windowed loading
    size?: number; // serialized bytes; a not-yet-loaded section reserves height from it
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

// derived on every write and stored alongside the content, so listing a library never reads the trees
export interface ArtifactDigest {
    cover: Cover;
    sections: SectionSummary[];
}

// a matched excerpt; `marks` are [start, end) offsets into `text` the client renders highlighted
export interface SearchSnippet {
    text: string;
    marks: [number, number][];
}

// GET /search row
export interface SearchHit extends ArtifactSummary {
    author?: { name: string | null; avatarUrl: string | null } | null;
    lastViewedAt?: string | null;
    matchedIn?: "title" | "content";
    snippet?: SearchSnippet | null;
}

export interface SearchResponse {
    artifacts: SearchHit[];
    took: number; // server-side query milliseconds, for the perf budget
}

// GET /artifacts — one keyset page; `nextCursor` null once the list is exhausted
export interface ArtifactPage {
    artifacts: ArtifactSummary[];
    nextCursor: string | null;
}

// everything except the sections: the part a windowed load always carries
export interface ArtifactShell {
    format: Id;
    theme: Id;
    background?: SectionBackground;
}

/** GET /artifacts/:id?window=from:count; `total <= count` means the client holds it all. */
export interface ArtifactWindow {
    id: string;
    title: string;
    themeId: string;
    formatId: string;
    updatedAt: string;
    shell: ArtifactShell;
    total: number;
    index: SectionSummary[]; // one entry per section, in order
    from: number;
    sections: Section[];
}

/** PATCH /artifacts/:id/content; applied in order in one transaction, an unknown id fails it. */
export type SectionOp =
    | { kind: "set"; section: Section }
    | { kind: "insert"; section: Section; index: number }
    | { kind: "remove"; id: Id }
    | { kind: "order"; ids: Id[] }
    | { kind: "shell"; shell: ArtifactShell };

export interface ContentPatch {
    ops: SectionOp[];
    themeId?: string;
    formatId?: string;
}

// create or patch: every field optional
export interface ArtifactInput {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: ArtifactContent;
    folderId?: string | null;
}
