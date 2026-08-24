import type { ElementLayout } from "@model/geometry";
import type { WorkspaceRole } from "./workspace";

export type Id = string;

// data is interpreted by its ElementSpec; a container's children live in data
export interface ElementInstance {
    type: string;
    data: unknown;
    layout?: ElementLayout;
    // Stable identity for anything pointing at this node from outside the tree (a comment anchor).
    // Optional because it is minted lazily: a tree written before ids, or an element the AI just
    // produced, simply has none until the next stamping pass.
    id?: Id;
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

// Presenter notes for one section. `spoken` is the narration script and the only part a voice ever
// reads; `cues` are for the person at the podium and are stripped at the publish boundary.
export interface SectionNotes {
    spoken: string;
    cues?: string[];
    source?: "ai" | "human"; // an untouched AI draft can be regenerated without asking
    /**
     * `sectionFingerprint` of the section when these notes were written, so a script that no longer
     * describes what is on screen can be told from one that does. Absent on notes written before
     * this existed, which count as current: a deploy must not rewrite everyone's notes at once.
     */
    of?: string;
}

export interface Section {
    id: Id;
    root: ElementInstance; // one recursive container/leaf tree
    background?: SectionBackground;
    bleed?: boolean; // full-bleed edge-to-edge vs a contained card
    frame?: SectionFrame;
    notes?: SectionNotes;
}

// Everything except the sections. The section-ops route rewrites stored content through this, so an
// artifact-wide field declared outside it is dropped on the next section edit — add new ones here.
export interface ArtifactShell {
    format: Id;
    theme: Id;
    background?: SectionBackground; // document-level backdrop behind all sections
    page?: PageSize;
    // which voice narrates this piece, overriding the workspace default; a workspace_voices row.
    // Not a secret, so unlike `notes` it is fine on a public payload: it names who is speaking.
    voice?: Id;
    // the instrumental bed heard while this piece is presented; `trackId` is a soundtracks row,
    // either a house preset or one written for this artifact
    music?: ArtifactMusic;
}

export interface ArtifactMusic {
    on: boolean;
    trackId?: Id;
    volume?: number; // 0..1 of the bed's own level, before ducking; default MUSIC_VOLUME
}

/** The bed's resting level. Low by design: it is under something, not the thing. */
export const MUSIC_VOLUME = 0.35;

/** How far the bed drops while a voice speaks. Ordinary broadcast practice, not a guess at taste. */
export const MUSIC_DUCK = 0.3;

/** The bed's gain right now: its own level, cut hard while something is being said. */
export const duckedVolume = (base: number, speaking: boolean): number =>
    Math.max(0, Math.min(1, speaking ? base * MUSIC_DUCK : base));

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
        ...(d.voice ? { voice: d.voice } : {}),
        ...(d.music ? { music: d.music } : {}),
    };
};

/**
 * Content with every section's notes removed, for the publish boundary. Presenter cues are written
 * to be seen by the speaker alone, so the payload a viewer receives must not carry them; the spoken
 * script a caption needs is served from the narration route, which is gated per link.
 *
 * Identity-preserving: a section with no notes comes back as the same object.
 */
export function withoutNotes(content: ArtifactContent): ArtifactContent {
    const sections = content.sections.map((s) => {
        if (!s.notes) return s;
        const { notes: _notes, ...rest } = s;
        return rest;
    });
    return sections.some((s, i) => s !== content.sections[i]) ? { ...content, sections } : content;
}

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
        type: "container",
        data: { direction: "row", align: "center", gap: COLUMN_GAP, children: kids },
    };
}

export const colGroup = (children: ElementInstance[]): ElementInstance => ({
    type: "container",
    data: { direction: "col", children },
});

// childless group; compose paints it as the dashed drop placeholder
export const emptyRegion = (): ElementInstance => ({ type: "container", data: { children: [] } });

export function childrenRaw(inst: ElementInstance): ElementInstance[] | undefined {
    const kids = (inst.data as { children?: ElementInstance[] }).children;
    return Array.isArray(kids) ? kids : undefined;
}

const withChildrenRaw = (inst: ElementInstance, children: ElementInstance[]): ElementInstance => ({
    ...inst,
    data: { ...(inst.data as Record<string, unknown>), children },
});

/**
 * `group` and `card` merged into `container`. Pure so it can be tested without a database and reused
 * by the backfill (scripts/migrate-container.ts).
 *
 * A card with no explicit `style` still rendered solid, so the mapping fills that default in rather
 * than dropping it. Recursion goes through `childrenRaw`, which reaches table cells and the children
 * of closed units, because a card could legitimately sit inside one. Returns the same object when
 * nothing changed, so a caller can skip a write.
 */
export function toContainer(inst: ElementInstance): ElementInstance {
    const kids = childrenRaw(inst);
    const nextKids = kids?.map(toContainer);
    const kidsChanged = !!kids && !!nextKids && kids.some((k, i) => k !== nextKids[i]);
    const withKids = kidsChanged ? withChildrenRaw(inst, nextKids!) : inst;

    if (inst.type === "group") return { ...withKids, type: "container" };
    if (inst.type === "card") {
        const d = (withKids.data ?? {}) as Record<string, unknown>;
        const { style, ...rest } = d;
        return {
            ...withKids,
            type: "container",
            data: { ...rest, surface: typeof style === "string" ? style : "solid" },
        };
    }
    return withKids;
}

/** Every section's root run through `toContainer`; the same object back when nothing moved. */
export function contentToContainer(content: ArtifactContent): ArtifactContent {
    const sections = content.sections.map((sec) => {
        const root = toContainer(sec.root);
        return root === sec.root ? sec : { ...sec, root };
    });
    return sections.some((s, i) => s !== content.sections[i]) ? { ...content, sections } : content;
}

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

// Element ids: minted here, resolved by @elements/ops (which knows, through the registry, which
// nested elements are addressable). Stored children only — a diagram builds its child text nodes on
// the fly, so nothing there can carry an id and an anchor on one degrades to its section.
const CHILD_KEYS = ["children", "cells"] as const;

export const newElementId = (): Id => `e-${crypto.randomUUID().slice(0, 8)}`;

const asElements = (v: unknown): ElementInstance[] | null =>
    Array.isArray(v) &&
    v.every((x) => !!x && typeof x === "object" && typeof (x as ElementInstance).type === "string")
        ? (v as ElementInstance[])
        : null;

// Rebuilds only the branches whose children changed. Section object identity drives the paint cache
// and the autosave diff, so a stamping pass that rebuilt untouched nodes would invalidate both.
function mapChildren(
    el: ElementInstance,
    fn: (child: ElementInstance) => ElementInstance,
): ElementInstance {
    const data = el.data;
    if (!data || typeof data !== "object") return el;
    const patch: Record<string, unknown> = {};
    let changed = false;
    for (const key of CHILD_KEYS) {
        const kids = asElements((data as Record<string, unknown>)[key]);
        if (!kids) continue;
        const mapped = kids.map(fn);
        if (mapped.some((c, i) => c !== kids[i])) {
            patch[key] = mapped;
            changed = true;
        }
    }
    return changed ? { ...el, data: { ...(data as Record<string, unknown>), ...patch } } : el;
}

/** Fills in a missing id anywhere in the subtree; returns the same object when none was missing. */
export function withElementIds(el: ElementInstance): ElementInstance {
    const stamped = mapChildren(el, withElementIds);
    return stamped.id ? stamped : { ...stamped, id: newElementId() };
}

/** Every id in the subtree re-minted: what a copy needs, so it never shares an anchor with its source. */
export function withFreshElementIds(el: ElementInstance): ElementInstance {
    return { ...mapChildren(el, withFreshElementIds), id: newElementId() };
}

export function sectionWithElementIds(section: Section): Section {
    const root = withElementIds(section.root);
    return root === section.root ? section : { ...section, root };
}

export function contentWithElementIds(content: ArtifactContent): ArtifactContent {
    let changed = false;
    const sections = content.sections.map((s) => {
        const next = sectionWithElementIds(s);
        if (next !== s) changed = true;
        return next;
    });
    return changed ? { ...content, sections } : content;
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

// An affordance region: engine-reported, hit-testable chrome that is not a selection target (a
// checklist's checkbox). parseTarget ignores the prefix, so selection never sees it; the editor
// dispatches on `action` and acts on the addressed element's data.
export const hitRegionId = (action: string, a: ElementAddress): string =>
    `hit:${action}:${a.section}:${a.path.join(".")}`;

export function parseHitRegion(id: string): { action: string; address: ElementAddress } | null {
    const p = id.split(":");
    if (p[0] !== "hit" || !p[1] || !p[2]) return null;
    const path = p[3] ? p[3].split(".").map(Number) : [];
    return { action: p[1], address: { section: p[2], path } };
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

export const addressesEqual = (a: ElementAddress, b: ElementAddress): boolean =>
    a.section === b.section &&
    a.path.length === b.path.length &&
    a.path.every((v, i) => v === b.path[i]);

/** `a` strictly contains `b`. A selection set never holds both. */
export const isAncestorAddress = (a: ElementAddress, b: ElementAddress): boolean =>
    a.section === b.section &&
    a.path.length < b.path.length &&
    a.path.every((v, i) => v === b.path[i]);

/** Paint order for two paths in one section: earlier sibling first, parent before child. */
export function comparePaths(a: number[], b: number[]): number {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const x = a[i] ?? -1;
        const y = b[i] ?? -1;
        if (x !== y) return x - y;
    }
    return 0;
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
    access?: ArtifactAccess; // the caller's own level, resolved server-side per request
}

// What one person may do to one artifact. Ordered: each level contains the ones below it.
export type ArtifactAccess = "none" | "view" | "comment" | "edit";

export const ACCESS_RANK: Record<ArtifactAccess, number> = {
    none: 0,
    view: 1,
    comment: 2,
    edit: 3,
};

export const atLeast = (have: ArtifactAccess, need: ArtifactAccess): boolean =>
    ACCESS_RANK[have] >= ACCESS_RANK[need];

/** What a per-user grant may carry: a grant is a level, never a way to take access to none. */
export const isGrantable = (v: unknown): v is ArtifactAccess =>
    v === "view" || v === "comment" || v === "edit";

// hasOwn, not `in`: the prototype chain would let "toString" through as a level
export const isAccess = (v: unknown): v is ArtifactAccess =>
    typeof v === "string" && Object.hasOwn(ACCESS_RANK, v);

export interface AccessInput {
    role: WorkspaceRole | null; // null = not a member of the artifact's workspace at all
    userId: string;
    createdBy?: string | null;
    memberAccess?: ArtifactAccess | null; // the artifact's own level; null inherits the workspace default
    workspaceDefault?: ArtifactAccess | null;
    grant?: ArtifactAccess | null; // an explicit per-user grant on this one artifact
}

// Most specific wins, in both directions. Precedence: the admin/owner/creator floors, then a
// per-user grant, then the artifact's own level, then the workspace default. Admins keep edit so a
// member cannot lock the workspace out of its own content, and the creator keeps edit so nobody can
// lock themselves out; below those floors an explicit level beats an inherited one rather than being
// widened by it, which is what makes "everyone can edit, except Sam can only view" expressible.
// Grants carry view/comment/edit only, so a grant can never take someone to none.
export function accessFor(input: AccessInput): ArtifactAccess {
    if (input.role === "owner" || input.role === "admin") return "edit";
    if (input.role && input.createdBy && input.createdBy === input.userId) return "edit";
    if (input.grant) return input.grant;
    if (!input.role) return "none";
    return input.memberAccess ?? input.workspaceDefault ?? "edit";
}

export interface Artifact extends ArtifactSummary {
    draftContent: ArtifactContent;
}

// Collaborator grants: one person's standing access to one artifact, independent of membership.

export interface Collaborator {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    access: ArtifactAccess;
    acceptedAt: string | null; // null = invited, not yet opened
    member: boolean; // already in the artifact's workspace, so the grant only adds to their level
}

/** A "Shared with me" row: someone else's artifact, reached through a grant. */
export interface SharedArtifact extends ArtifactSummary {
    workspaceName: string;
    sharedBy?: { name: string | null; avatarUrl: string | null } | null;
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
    access?: ArtifactAccess; // the caller's own level, resolved server-side per request
    seq?: number; // the artifact's revision at this read; the collab baseline the client resumes from
}

/** PATCH /artifacts/:id/content; applied in order in one transaction, an unknown id fails it. */
export type SectionOp =
    | { kind: "set"; section: Section }
    | { kind: "insert"; section: Section; index: number }
    | { kind: "remove"; id: Id }
    | { kind: "order"; ids: Id[] }
    | { kind: "shell"; shell: ArtifactShell }
    // The per-property unit two people can write at once: merge these keys into the addressed
    // element's `data`, leaving the keys nobody named alone. A colour from an inspector and a
    // {text, marks} write from a typing session are then independent rather than a whole-section
    // race. Structural edits stay whole-section `set`.
    | { kind: "data"; sectionId: Id; elementId: Id; keys: Record<string, unknown> };

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

// null is the wire's "remove this key": JSON drops an undefined value, so an inverse op restoring an
// element to not having a key at all could not otherwise cross the socket. Nothing stores a
// meaningful null, since every element reader treats absent and null alike.
const isDrop = (v: unknown): boolean => v === undefined || v === null;

// Merges `keys` into the element with this id, rebuilding only the branch that leads to it. Every
// untouched sibling and every untouched section keeps its object identity, which is what the paint
// cache and the autosave diff key on: a remote op that rebuilt the tree would repaint and resend the
// whole document. Returns the same element when nothing actually changed.
function mergeElementData(
    el: ElementInstance,
    elementId: Id,
    keys: Record<string, unknown>,
): ElementInstance | null {
    if (el.id === elementId) {
        const data = (el.data ?? {}) as Record<string, unknown>;
        let changed = false;
        for (const [k, v] of Object.entries(keys))
            if (isDrop(v) ? Object.hasOwn(data, k) : data[k] !== v) changed = true;
        if (!changed) return el;
        const next: Record<string, unknown> = { ...data };
        for (const [k, v] of Object.entries(keys)) {
            if (isDrop(v)) delete next[k];
            else next[k] = v;
        }
        return { ...el, data: next };
    }
    let hit: ElementInstance | null = null;
    const mapped = mapChildren(el, (child) => {
        if (hit) return child; // ids are unique, so stop once one branch matched
        const next = mergeElementData(child, elementId, keys);
        if (next === null) return child;
        hit = next;
        return next;
    });
    return hit === null ? null : mapped;
}

/** Applied in order to a fresh copy; an unknown section id means client and server disagree. */
export function applySectionOps(content: ArtifactContent, ops: SectionOp[]): ApplyResult {
    const { sections: current, ...rest } = content;
    let sections = [...current];
    // the shell is whatever isn't sections, so a new content field survives an op batch by default
    let shell: ArtifactShell = rest;
    for (const op of ops) {
        if (op.kind === "data") {
            const at = sections.findIndex((s) => s.id === op.sectionId);
            if (at < 0) return { ok: false, reason: `unknown section ${op.sectionId}` };
            const section = sections[at]!;
            const root = mergeElementData(section.root, op.elementId, op.keys);
            if (root === null) return { ok: false, reason: `unknown element ${op.elementId}` };
            if (root !== section.root) sections[at] = { ...section, root };
        } else if (op.kind === "set") {
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
            // A replace, not a merge: every emitter (diffSections, invertOps) sends the whole
            // shell, and merging made a removed field inexpressible — clearing an artifact's voice
            // back to the workspace default would have kept the old one forever.
            shell = op.shell;
        }
    }
    return { ok: true, content: { ...shell, sections } };
}

// Whole-section `set` ops are correct but coarse: two people editing different elements of one
// section would overwrite each other wholesale. Where a set turns out to be nothing but element
// data changes, it is rewritten as one `data` op per element, which is the per-key unit two writers
// can hold at once. Anything structural (a new child, a resize, a reordered column) stays a `set`.

interface DataChange {
    elementId: Id;
    keys: Record<string, unknown>;
}

// null = the difference is structural, so it cannot be expressed as data ops
function dataDelta(before: ElementInstance, after: ElementInstance): DataChange[] | null {
    if (before === after) return [];
    if (before.type !== after.type || before.id !== after.id) return null;
    if (before.layout !== after.layout) return null;
    const b = (before.data ?? {}) as Record<string, unknown>;
    const a = (after.data ?? {}) as Record<string, unknown>;
    const out: DataChange[] = [];
    for (const key of CHILD_KEYS) {
        const kidsB = asElements(b[key]);
        const kidsA = asElements(a[key]);
        if (!kidsB && !kidsA) continue;
        if (!kidsB || !kidsA || kidsB.length !== kidsA.length) return null;
        for (let i = 0; i < kidsA.length; i++) {
            const nested = dataDelta(kidsB[i]!, kidsA[i]!);
            if (!nested) return null;
            out.push(...nested);
        }
    }
    const keys: Record<string, unknown> = {};
    let own = false;
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (CHILD_KEYS.includes(key as (typeof CHILD_KEYS)[number])) continue;
        if (b[key] === a[key]) continue;
        keys[key] = Object.hasOwn(a, key) ? a[key] : null; // null removes it, JSON drops undefined
        own = true;
    }
    if (!own) return out;
    if (!after.id) return null; // nothing to address the change to
    out.push({ elementId: after.id, keys });
    return out;
}

// Every non-`root` field of a Section belongs here: narrowOps drops a `set` op whose shell is equal
// and whose tree is identical, so a field missing from this list is an edit that never reaches the row.
const SECTION_SHELL_EQUAL = (b: Section, a: Section): boolean =>
    b.background === a.background &&
    b.bleed === a.bleed &&
    b.frame === a.frame &&
    b.notes === a.notes;

/** Rewrites the `set` ops that are only element-data changes; everything else passes through. */
export function narrowOps(before: ArtifactContent, ops: SectionOp[]): SectionOp[] {
    const had = new Map(before.sections.map((s) => [s.id, s]));
    const out: SectionOp[] = [];
    for (const op of ops) {
        if (op.kind !== "set") {
            out.push(op);
            continue;
        }
        const prev = had.get(op.section.id);
        const delta =
            prev && SECTION_SHELL_EQUAL(prev, op.section)
                ? dataDelta(prev.root, op.section.root)
                : null;
        if (!delta) {
            out.push(op);
            continue;
        }
        for (const change of delta)
            out.push({
                kind: "data",
                sectionId: op.section.id,
                elementId: change.elementId,
                keys: change.keys,
            });
    }
    return out;
}

/** The element carrying this id anywhere in the subtree, or undefined. */
function findElement(el: ElementInstance, id: Id): ElementInstance | undefined {
    if (el.id === id) return el;
    const data = el.data;
    if (!data || typeof data !== "object") return undefined;
    for (const key of CHILD_KEYS) {
        for (const kid of asElements((data as Record<string, unknown>)[key]) ?? [])
            if (kid) {
                const hit = findElement(kid, id);
                if (hit) return hit;
            }
    }
    return undefined;
}

// What to replay to put `before` back after `ops` land on it, in the order that undoes them.
//
// Undo is per-user inverse ops rather than a document snapshot, so replaying one person's undo
// cannot roll back what someone else wrote in between. Computed against the tree the ops are about
// to be applied to, which is the one moment the previous values are in hand.
export function invertOps(before: ArtifactContent, ops: SectionOp[]): SectionOp[] {
    const inverse: SectionOp[] = [];
    let cur = before;
    for (const op of ops) {
        if (op.kind === "set") {
            const prev = cur.sections.find((s) => s.id === op.section.id);
            if (prev) inverse.push({ kind: "set", section: prev });
        } else if (op.kind === "insert") {
            inverse.push({ kind: "remove", id: op.section.id });
        } else if (op.kind === "remove") {
            const at = cur.sections.findIndex((s) => s.id === op.id);
            if (at >= 0) inverse.push({ kind: "insert", section: cur.sections[at]!, index: at });
        } else if (op.kind === "order") {
            inverse.push({ kind: "order", ids: cur.sections.map((s) => s.id) });
        } else if (op.kind === "shell") {
            const { sections: _sections, ...shell } = cur;
            inverse.push({ kind: "shell", shell });
        } else {
            const section = cur.sections.find((s) => s.id === op.sectionId);
            const el = section && findElement(section.root, op.elementId);
            if (el) {
                const data = (el.data ?? {}) as Record<string, unknown>;
                const keys: Record<string, unknown> = {};
                // a key the element did not have inverts to null, the wire's "remove this key"
                for (const k of Object.keys(op.keys))
                    keys[k] = Object.hasOwn(data, k) ? data[k] : null;
                inverse.push({
                    kind: "data",
                    sectionId: op.sectionId,
                    elementId: op.elementId,
                    keys,
                });
            }
        }
        const next = applySectionOps(cur, [op]);
        if (!next.ok) break; // the forward batch will fail the same way; nothing to undo past here
        cur = next.content;
    }
    return inverse.reverse();
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

    // The shell is compared generically rather than field by field. A hand-listed version silently
    // dropped every field it did not name: adding `voice` to ArtifactShell made a voice-only change
    // diff to zero ops, so the choice never reached the row. Anything added to the shell from here
    // is carried by construction.
    const { sections: _beforeSections, ...beforeShell } = before;
    const { sections: _afterSections, ...afterShell } = after;
    const keys = new Set([...Object.keys(beforeShell), ...Object.keys(afterShell)]);
    const shellChanged = [...keys].some(
        (k) => beforeShell[k as keyof ArtifactShell] !== afterShell[k as keyof ArtifactShell],
    );
    if (shellChanged) ops.push({ kind: "shell", shell: afterShell });
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

// Media references: the data fields holding a url that points at an image or a clip. An `embed`
// holds a page link and icon/graphic hold inline svg, so none of those are media.
const MEDIA_SRC_TYPES = new Set(["image", "gif", "illustration", "sticker", "avatar", "video"]);
const SRC_ONLY = ["src"] as const;
const SRC_AND_POSTER = ["src", "poster"] as const;
const NO_MEDIA: readonly string[] = [];

const mediaKeysOf = (type: string | undefined): readonly string[] =>
    type === "video" ? SRC_AND_POSTER : type && MEDIA_SRC_TYPES.has(type) ? SRC_ONLY : NO_MEDIA;

type RawBg = { image?: string } | undefined;

function mapBackgroundMedia(bg: RawBg, fn: (url: string) => string): RawBg {
    if (!bg || typeof bg.image !== "string" || !bg.image) return bg;
    const next = fn(bg.image);
    return next === bg.image ? bg : { ...bg, image: next };
}

function mapElementMedia(el: RawEl, fn: (url: string) => string): RawEl {
    const data = el.data;
    if (!data || typeof data !== "object") return el;
    const patch: Record<string, unknown> = {};
    let changed = false;
    for (const key of mediaKeysOf(el.type)) {
        const cur = data[key];
        if (typeof cur !== "string" || !cur) continue;
        const next = fn(cur);
        if (next === cur) continue;
        patch[key] = next;
        changed = true;
    }
    // nested elements live in any array-valued data key (children, cells…)
    for (const [key, v] of Object.entries(data)) {
        if (!Array.isArray(v)) continue;
        let dirty = false;
        const mapped = v.map((item) => {
            if (!isEl(item)) return item;
            const next = mapElementMedia(item, fn);
            if (next !== item) dirty = true;
            return next;
        });
        if (!dirty) continue;
        patch[key] = mapped;
        changed = true;
    }
    return changed ? { ...el, data: { ...data, ...patch } } : el;
}

function mapSectionMedia(sec: RawSection, fn: (url: string) => string): RawSection {
    if (!sec || typeof sec !== "object") return sec;
    const patch: Record<string, unknown> = {};
    let changed = false;
    const bg = mapBackgroundMedia(sec.background, fn);
    if (bg !== sec.background) {
        patch.background = bg;
        changed = true;
    }
    if (sec.root) {
        const root = mapElementMedia(sec.root, fn);
        if (root !== sec.root) {
            patch.root = root;
            changed = true;
        }
    }
    return changed ? { ...sec, ...patch } : sec;
}

/**
 * Rewrites every media url in the tree. Identity-preserving like the stamping pass above: an
 * unchanged branch comes back as the same object, so the paint cache and the autosave diff hold.
 *
 * Takes a whole draft, one section, or one element, since the AI resolves image phrases at all
 * three levels. This and `mediaRefKinds` read raw jsonb so they accept `unknown`, which means a
 * walk that understood only the draft shape answered "no media here" for the other two rather than
 * failing: that is how a phrase the model wrote where a url belongs reached the canvas unresolved.
 */
export function mapMediaRefs(draft: unknown, fn: (url: string) => string): unknown {
    if (!draft || typeof draft !== "object") return draft;
    const d = draft as RawDraft & RawSection & RawEl & Record<string, unknown>;
    if (typeof d.type === "string") return mapElementMedia(d, fn);
    if (!Array.isArray(d.sections)) return mapSectionMedia(d, fn);

    const patch: Record<string, unknown> = {};
    let changed = false;
    const bg = mapBackgroundMedia(d.background, fn);
    if (bg !== d.background) {
        patch.background = bg;
        changed = true;
    }
    let dirty = false;
    const sections = d.sections.map((sec) => {
        const next = mapSectionMedia(sec, fn);
        if (next !== sec) dirty = true;
        return next;
    });
    if (dirty) {
        patch.sections = sections;
        changed = true;
    }
    return changed ? { ...d, ...patch } : draft;
}

/** Every distinct media url in the tree, in no particular order. */
export function mediaRefs(draft: unknown): string[] {
    return [...mediaRefKinds(draft).keys()];
}

/**
 * The same urls, each with the kind of media it is used as. A `video` element's own source is a
 * clip; its poster is a still, and so is everything else. Adoption needs this: a row stored as the
 * wrong kind is invisible to the picker tab that should list it.
 */
export function mediaRefKinds(draft: unknown): Map<string, "image" | "video"> {
    const out = new Map<string, "image" | "video">();
    const note = (url: string, kind: "image" | "video"): void => {
        // a url used as a clip anywhere is a clip; poster duty never demotes it
        if (kind === "video" || !out.has(url)) out.set(url, kind);
    };
    const noteEl = (el: RawEl): void => {
        for (const key of mediaKeysOf(el.type)) {
            const v = el.data?.[key];
            if (typeof v === "string" && v)
                note(v, el.type === "video" && key === "src" ? "video" : "image");
        }
    };
    if (!draft || typeof draft !== "object") return out;
    const d = draft as RawDraft & RawSection & RawEl;
    if (typeof d.type === "string") {
        walkRaw(d, noteEl);
        return out;
    }
    // a bare section stands in for its own one-section list; `note` dedupes the background
    const sections = Array.isArray(d.sections) ? d.sections : [d];
    if (d.background?.image) note(d.background.image, "image");
    for (const sec of sections) {
        if (!sec || typeof sec !== "object") continue;
        if (sec.background?.image) note(sec.background.image, "image");
        walkRaw(sec.root, noteEl);
    }
    return out;
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
            // structural wrappers never name a section's kind; group/card are pre-migration aliases
            if (el.type && !["text", "container", "group", "card"].includes(el.type))
                kinds.add(el.type);
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

/** One section's prose, in tree order. The same walk the search index uses, over a single root. */
export function sectionText(section: Section): string {
    const seen = new Set<string>();
    const parts: string[] = [];
    collect(section.root, null, (s) => {
        if (seen.has(s)) return;
        seen.add(s);
        parts.push(s);
    });
    return parts.join(" ");
}

/**
 * What a script was written against. FNV-1a rather than a real digest: this layer is edge-safe and
 * has no crypto, and a collision costs one script that should have been rewritten and was not.
 *
 * Over the section's words alone, never its layout or its background, so moving a box does not
 * invalidate a script that is still accurate.
 */
export function sectionFingerprint(section: Section): string {
    const text = sectionText(section);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}

/** No script at all: nothing for a voice to say until one is written. */
export const unscripted = (section: Section): boolean => !section.notes?.spoken.trim();

/**
 * An AI script that no longer matches the section it describes. A person's own writing is never
 * stale by this measure, because rewriting what someone wrote is not a cache decision.
 */
export function scriptStale(section: Section): boolean {
    const notes = section.notes;
    if (!notes?.spoken.trim() || notes.source !== "ai" || !notes.of) return false;
    return notes.of !== sectionFingerprint(section);
}

/** Sections a narrator must write before it can speak them: never written, or written for old copy. */
export const needsScript = (section: Section): boolean =>
    unscripted(section) || scriptStale(section);

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
