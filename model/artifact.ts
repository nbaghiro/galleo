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

// artifact-wide page geometry, logical px; honored only by paged formats
export interface PageSize {
    width: number;
    height: number;
}

export interface Section {
    id: Id;
    root: ElementInstance; // one recursive container/leaf tree
    background?: SectionBackground;
    bleed?: boolean; // full-bleed edge-to-edge vs a contained card
    frame?: SectionFrame;
}

// Everything except the sections. The section-ops route rewrites stored content through this, so an
// artifact-wide field declared outside it is dropped on the next section edit — add new ones here.
export interface ArtifactShell {
    format: Id;
    theme: Id;
    background?: SectionBackground; // document-level backdrop behind all sections
    page?: PageSize;
}

export interface ArtifactContent extends ArtifactShell {
    sections: Section[];
}

// The one way to read stored content. `draft_content` is jsonb, so what comes back is unknown:
// a row written by an older shape, or by hand, is not an ArtifactContent just because the column
// says so. Asserting the type is how a missing `sections` reaches the renderer as a crash instead
// of an empty deck, so every read goes through here and gets the defaults instead.
//
// The section-ops write puts this result back, so an unlisted field is dropped from the row.
export const asContent = (draft: unknown): ArtifactContent => {
    const d = (draft ?? {}) as Partial<ArtifactContent>;
    return {
        format: d.format ?? "deck",
        theme: d.theme ?? "studio",
        sections: Array.isArray(d.sections) ? d.sections : [],
        ...(d.background ? { background: d.background } : {}),
        ...(d.page ? { page: d.page } : {}),
    };
};

// column fractions per named starter layout
export const LAYOUT_PRESETS: Record<string, number[]> = {
    full: [1],
    "split-6040": [0.6, 0.4],
    "split-4060": [0.4, 0.6],
    "two-col": [0.5, 0.5],
    "three-up": [1 / 3, 1 / 3, 1 / 3],
};

// column-width share (percent 0..100)
export const withWidth = (el: ElementInstance, pct: number): ElementInstance => ({
    ...el,
    layout: { ...el.layout, width: { pct } },
});

const COLUMN_GAP = 28; // gutter between columns of a section row

// widths (fractions ~1) set each column's share; omitted → even split
export function rowGroup(children: ElementInstance[], widths?: number[]): ElementInstance {
    const kids =
        widths && widths.length === children.length
            ? children.map((c, i) => withWidth(c, Math.round((widths[i] ?? 0) * 100)))
            : children;
    return {
        type: "group",
        data: { direction: "row", align: "center", gap: COLUMN_GAP, children: kids },
    };
}

export const colGroup = (children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { direction: "col", children },
});

// childless group; compose paints it as the dashed drop placeholder
export const emptyRegion = (): ElementInstance => ({ type: "group", data: { children: [] } });

export function childrenRaw(inst: ElementInstance): ElementInstance[] | undefined {
    const kids = (inst.data as { children?: ElementInstance[] }).children;
    return Array.isArray(kids) ? kids : undefined;
}

const withChildrenRaw = (inst: ElementInstance, children: ElementInstance[]): ElementInstance => ({
    ...inst,
    data: { ...(inst.data as Record<string, unknown>), children },
});

// replace the node at path; [] targets the root
export function updateAtPath(
    root: ElementInstance,
    path: number[],
    fn: (inst: ElementInstance) => ElementInstance,
): ElementInstance {
    if (path.length === 0) return fn(root);
    const kids = childrenRaw(root);
    if (!kids) return root;
    const [i, ...rest] = path;
    return withChildrenRaw(
        root,
        kids.map((c, idx) => (idx === i ? updateAtPath(c, rest, fn) : c)),
    );
}

// remove the node at path; removing the root clears to an empty region
export function removeAtPath(root: ElementInstance, path: number[]): ElementInstance {
    if (path.length === 0) return emptyRegion();
    const parent = path.slice(0, -1);
    const idx = path[path.length - 1]!;
    return updateAtPath(root, parent, (p) => {
        const kids = childrenRaw(p);
        return kids
            ? withChildrenRaw(
                  p,
                  kids.filter((_, i) => i !== idx),
              )
            : p;
    });
}

// Pointing at a node: an address is a section id plus the same index path the ops above take.
// Region ids are the flat-string form of one, because the engine keys every painted node by a single
// `id` (see Region in @engine/node) — section ids never contain ":", the separator.

export interface ElementAddress {
    section: Id;
    path: number[]; // index path into section.root; [] = the root node
}

export type Target =
    | { kind: "section"; section: Id }
    | { kind: "element"; address: ElementAddress };

export const sectionRegionId = (section: Id): string => `section:${section}`;
export const elementRegionId = (a: ElementAddress): string =>
    a.path.length ? `el:${a.section}:${a.path.join(".")}` : `el:${a.section}`;

export function regionId(t: Target): string {
    if (t.kind === "section") return sectionRegionId(t.section);
    return elementRegionId(t.address);
}

export function parseTarget(id: string): Target | null {
    const p = id.split(":");
    if (p[0] === "section" && p[1]) return { kind: "section", section: p[1] };
    if (p[0] === "el" && p[1]) {
        const path = p[2] ? p[2].split(".").map(Number) : [];
        return { kind: "element", address: { section: p[1], path } };
    }
    return null;
}

// most specific wins: deeper element > element > section
export function specificity(t: Target): number {
    if (t.kind === "section") return 0;
    return 1 + t.address.path.length;
}

export function targetsEqual(a: Target | null, b: Target | null): boolean {
    if (!a || !b) return a === b;
    return regionId(a) === regionId(b);
}

// Esc walks up: nested element → parent → root → section → nothing
export function parentTarget(t: Target): Target | null {
    if (t.kind === "section") return null;
    const a = t.address;
    if (a.path.length > 0)
        return { kind: "element", address: { section: a.section, path: a.path.slice(0, -1) } };
    return { kind: "section", section: a.section };
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
    page?: PageSize; // so library thumbnails get the true aspect without reading the content
}

export interface Artifact extends ArtifactSummary {
    draftContent: ArtifactContent;
}

// derived on every write and stored alongside the content, so listing a library never reads the trees
export interface ArtifactDigest {
    cover: Cover;
    sections: SectionSummary[];
    page?: PageSize;
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

// How an artifact was generated: the brief it came from and the model each step actually ran on.
// Written once when a run is saved; nothing reads it back at render time.
export interface GenMeta {
    at: string; // ISO, when the run was saved
    models: Record<string, string>; // AiTask → "provider:model", resolved when the step ran
    prompt: string;
    surface: string;
    theme?: string;
    length?: string;
    imageSource?: string;
    goal?: string;
    audience?: string;
    tone?: string;
    mustInclude?: string[];
    steer?: string;
    source?: string; // pasted or attached context, already clipped by the intake
    beats?: { id: string; label: string; role: string }[];
}

// create or patch: every field optional
export interface ArtifactInput {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: ArtifactContent;
    folderId?: string | null;
    aiMeta?: GenMeta;
    templateId?: string; // provenance: created from this starter; feeds template popularity
}

// section ops are applied server-side, and shared here so a windowed client can predict what the
// server will do

export type ApplyResult = { ok: true; content: ArtifactContent } | { ok: false; reason: string }; // the whole batch is rejected, never half-applied

/** Applied in order to a fresh copy; an unknown section id means client and server disagree. */
export function applySectionOps(content: ArtifactContent, ops: SectionOp[]): ApplyResult {
    const { sections: current, ...rest } = content;
    let sections = [...current];
    // the shell is whatever isn't sections, so a new content field survives an op batch by default
    let shell: ArtifactShell = rest;
    for (const op of ops) {
        if (op.kind === "set") {
            const at = sections.findIndex((s) => s.id === op.section.id);
            if (at < 0) return { ok: false, reason: `unknown section ${op.section.id}` };
            sections[at] = op.section;
        } else if (op.kind === "insert") {
            if (sections.some((s) => s.id === op.section.id))
                return { ok: false, reason: `duplicate section ${op.section.id}` };
            const at = Math.max(0, Math.min(sections.length, Math.trunc(op.index)));
            sections.splice(at, 0, op.section);
        } else if (op.kind === "remove") {
            const at = sections.findIndex((s) => s.id === op.id);
            if (at < 0) return { ok: false, reason: `unknown section ${op.id}` };
            sections.splice(at, 1);
        } else if (op.kind === "order") {
            const by = new Map(sections.map((s) => [s.id, s]));
            if (op.ids.length !== sections.length || op.ids.some((id) => !by.has(id)))
                return { ok: false, reason: "order is not a permutation of the document" };
            sections = op.ids.map((id) => by.get(id)!);
        } else {
            shell = { ...shell, ...op.shell };
        }
    }
    return { ok: true, content: { ...shell, sections } };
}

/** Diffs by section identity: editor ops preserve it, so an unchanged section is free to detect. */
export function diffSections(before: ArtifactContent, after: ArtifactContent): SectionOp[] {
    const ops: SectionOp[] = [];
    const had = new Map(before.sections.map((s) => [s.id, s]));
    const has = new Set(after.sections.map((s) => s.id));

    for (const s of before.sections) if (!has.has(s.id)) ops.push({ kind: "remove", id: s.id });
    after.sections.forEach((s, i) => {
        const prev = had.get(s.id);
        if (!prev) ops.push({ kind: "insert", section: s, index: i });
        else if (prev !== s) ops.push({ kind: "set", section: s });
    });
    // reorder only if the surviving sections changed places; inserts already carry their index
    const kept = before.sections.filter((s) => has.has(s.id)).map((s) => s.id);
    const keptAfter = after.sections.filter((s) => had.has(s.id)).map((s) => s.id);
    if (kept.join() !== keptAfter.join())
        ops.push({ kind: "order", ids: after.sections.map((s) => s.id) });

    if (
        before.format !== after.format ||
        before.theme !== after.theme ||
        before.background !== after.background
    )
        ops.push({
            kind: "shell",
            shell: {
                format: after.format,
                theme: after.theme,
                ...(after.background ? { background: after.background } : {}),
            },
        });
    return ops;
}

// the derivations below run against `artifacts.draft_content` raw out of jsonb, so every shape here
// stays optional: a row may have been written by any past version

interface RawEl {
    type?: string;
    data?: Record<string, unknown>;
}
interface RawSection {
    id?: string;
    background?: { image?: string };
    root?: RawEl;
}
interface RawDraft {
    background?: { image?: string };
    sections?: RawSection[];
    page?: { width?: unknown; height?: unknown };
}

const asDraft = (draft: unknown): RawDraft =>
    draft !== null && typeof draft === "object" ? (draft as RawDraft) : {};

const isEl = (v: unknown): v is RawEl =>
    v !== null && typeof v === "object" && typeof (v as RawEl).type === "string";

// children (groups, cards…) and cells (table) both hold nested elements
const nestedOf = (el: RawEl): RawEl[] => {
    const out: RawEl[] = [];
    for (const v of Object.values(el.data ?? {}))
        if (Array.isArray(v)) for (const item of v) if (isEl(item)) out.push(item);
    return out;
};

function walkRaw(el: RawEl | undefined, visit: (el: RawEl) => void): void {
    if (!el || typeof el !== "object") return;
    visit(el);
    for (const kid of nestedOf(el)) walkRaw(kid, visit);
}

function coverOf(draft: unknown): Cover {
    const d = asDraft(draft);
    const sec = d.sections?.[0];
    if (!sec) return {};
    const texts: { style?: string; text?: string }[] = [];
    let image = d.background?.image ?? sec.background?.image;
    walkRaw(sec.root, (el) => {
        const data = el.data;
        if (!data) return;
        if (el.type === "text") texts.push({ style: str(data.style), text: str(data.text) });
        if (el.type === "image" && !image) image = str(data.src);
    });
    const find = (...styles: string[]): string | undefined =>
        texts.find((t) => t.style && styles.includes(t.style))?.text;
    return {
        eyebrow: find("label"),
        title: find("h1", "h2", "h3"),
        sub: find("subtitle", "body", "caption"),
        image,
    };
}

function sectionsOf(draft: unknown): SectionSummary[] {
    return (asDraft(draft).sections ?? []).map((sec, idx) => {
        let title: string | undefined;
        const kinds = new Set<string>();
        walkRaw(sec.root, (el) => {
            const data = el.data;
            if (el.type === "text" && data) {
                const style = str(data.style);
                const text = str(data.text);
                if (text && !title && style && !["label", "caption"].includes(style)) title = text;
            }
            if (el.type && !["text", "group", "card"].includes(el.type)) kinds.add(el.type);
        });
        let kind = "cover";
        if (idx > 0) {
            kind = "content";
            if (kinds.has("chart")) kind = "chart";
            else if (kinds.has("table")) kind = "table";
            else if (kinds.has("diagram")) kind = "diagram";
            else if (
                kinds.has("image") ||
                kinds.has("video") ||
                kinds.has("embed") ||
                sec.background?.image
            )
                kind = "media";
            else if (kinds.has("stat")) kind = "stat";
            else if (kinds.has("quote")) kind = "quote";
        }
        // size feeds the height a windowed client reserves before the section itself arrives
        return { title: title?.slice(0, 64), kind, id: sec.id, size: byteLength(sec) };
    });
}

const byteLength = (sec: RawSection): number => {
    try {
        return JSON.stringify(sec)?.length ?? 0;
    } catch {
        return 0; // a cyclic or unserializable row shouldn't take the digest down with it
    }
};

function pageOf(draft: unknown): PageSize | undefined {
    const p = asDraft(draft).page;
    if (!p) return undefined;
    const { width, height } = p;
    if (typeof width !== "number" || typeof height !== "number") return undefined;
    return width > 0 && height > 0 ? { width, height } : undefined;
}

/** The list-facing derivations in one pass; stored in `artifacts.digest` on every write. */
export const artifactDigest = (draft: unknown): ArtifactDigest => {
    const page = pageOf(draft);
    return {
        cover: coverOf(draft),
        sections: sectionsOf(draft),
        ...(page ? { page } : {}),
    };
};

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// values are ids/enums/paints, never prose; indexing them would match every artifact
const NOISE_KEYS = new Set([
    "align",
    "color",
    "colors",
    "direction",
    "fit",
    "flow",
    "font",
    "fontId",
    "format",
    "gradient",
    "href",
    "icon",
    "iconId",
    "id",
    "image",
    "kind",
    "layout",
    "marker",
    "mime",
    "palette",
    "provider",
    "radius",
    "shape",
    "size",
    "src",
    "style",
    "theme",
    "tone",
    "type",
    "url",
    "variant",
    "weight",
]);

const NOISE_VALUE = /^(#[0-9a-f]{3,8}$|https?:\/\/|data:|blob:|asset:|\/api\/)/i;
const BLOB = 200; // a long unbroken run is a token/base64 payload, not a sentence

// cap on the indexed text per artifact; a tsvector is hard-limited to 1MB
const SEARCH_TEXT_LIMIT = 100_000;

function collect(value: unknown, key: string | null, push: (s: string) => void): void {
    if (typeof value === "string") {
        if (key !== null && NOISE_KEYS.has(key)) return;
        const s = value.trim();
        if (!s || NOISE_VALUE.test(s)) return;
        if (s.length > BLOB && !/\s/.test(s)) return;
        push(s);
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value) collect(v, key, push);
        return;
    }
    if (value !== null && typeof value === "object")
        for (const [k, v] of Object.entries(value)) collect(v, k, push);
}

/** Every prose string in the tree, section-blocks separated by a blank line so snippets never span two. */
export function artifactSearchText(draft: unknown): string {
    const blocks: string[] = [];
    let len = 0;
    for (const sec of asDraft(draft).sections ?? []) {
        const seen = new Set<string>();
        const parts: string[] = [];
        collect(sec.root, null, (s) => {
            if (seen.has(s)) return;
            seen.add(s);
            parts.push(s);
        });
        if (!parts.length) continue;
        const block = parts.join(" ");
        blocks.push(block);
        len += block.length + 2;
        if (len >= SEARCH_TEXT_LIMIT) break;
    }
    return blocks.join("\n\n").slice(0, SEARCH_TEXT_LIMIT);
}
