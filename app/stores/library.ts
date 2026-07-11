// The client-side artifact store: the library list + content cache, blank-artifact factory, and format labels / relative-time helpers.

import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { emptyRegion } from "@model/section";
import { createSignal } from "solid-js";
import { api, type ArtifactSummary } from "../api";
import { PROFILES } from "@engine/profile";

// Shared library state — artifacts + their full content (for thumbnails) live here so a folder move from the
// sidebar (drop) or a card menu updates one source of truth, and navigating between folders doesn't refetch.
const [artifacts, setArtifacts] = createSignal<ArtifactSummary[]>([]);
const [trash, setTrash] = createSignal<ArtifactSummary[]>([]);
const [contents, setContents] = createSignal<Record<string, ArtifactContent>>({});
const [artifactsLoaded, setArtifactsLoaded] = createSignal(false);
// the artifact id currently being dragged (set on a card's dragstart; read on a folder's drop)
const [draggingArtifact, setDraggingArtifact] = createSignal<string | null>(null);

export { contents, artifacts, artifactsLoaded, draggingArtifact, setDraggingArtifact, trash };

// Cached content whose artifact has changed on the server (an editor edit) since we fetched it — so the
// next loadContents() re-pulls a fresh thumbnail. Transient client bookkeeping, not reactive.
const staleContent = new Set<string>();

export async function loadLibrary(): Promise<void> {
    try {
        const { artifacts: fresh } = await api.listArtifacts();
        // Stale-while-revalidate: flag cached content for any artifact whose server `updatedAt` moved, so
        // loadContents() refetches its thumbnail. Without this the cache keeps serving the pre-edit render.
        const seenAt = new Map(artifacts().map((a) => [a.id, a.updatedAt]));
        for (const a of fresh) {
            const was = seenAt.get(a.id);
            if (was !== undefined && was !== a.updatedAt) staleContent.add(a.id);
        }
        setArtifacts(fresh);
    } catch {
        /* keep whatever we have */
    } finally {
        setArtifactsLoaded(true);
    }
}

// Fetch full content for thumbnails: artifacts we don't have yet, plus any flagged stale by loadLibrary
// (re-fetched in place so the card updates without a blank flash).
export async function loadContents(): Promise<void> {
    const need = artifacts().filter((d) => !contents()[d.id] || staleContent.has(d.id));
    const entries = await Promise.all(
        need.map(async (d): Promise<[string, ArtifactContent] | null> => {
            try {
                const { artifact } = await api.getArtifact(d.id);
                return [d.id, artifact.draftContent];
            } catch {
                return null;
            }
        }),
    );
    setContents({
        ...contents(),
        ...Object.fromEntries(entries.filter((e): e is [string, ArtifactContent] => e !== null)),
    });
    for (const d of need) staleContent.delete(d.id);
}

// Move an artifact in/out of a folder (folderId = null → no folder). Optimistic local update.
export function moveArtifact(id: string, folderId: string | null): void {
    setArtifacts(artifacts().map((d) => (d.id === id ? { ...d, folderId } : d)));
    api.moveArtifact(id, folderId).catch(() => {});
}

// Rename an artifact — update the library list + persist the title. Also driven by editor undo/redo of a
// rename (via the studio's onPersistTitle hook), so the library reflects renames done inside the editor.
export function renameArtifactById(id: string, title: string): void {
    setArtifacts(artifacts().map((d) => (d.id === id ? { ...d, title } : d)));
    api.saveArtifact(id, { title }).catch(() => {});
}

// Batch move — many artifacts in/out of a folder at once (one reactive update, one API call each).
export function moveArtifacts(ids: string[], folderId: string | null): void {
    const set = new Set(ids);
    setArtifacts(artifacts().map((d) => (set.has(d.id) ? { ...d, folderId } : d)));
    for (const id of ids) api.moveArtifact(id, folderId).catch(() => {});
}

// Soft delete → move an artifact to Trash (recoverable). Optimistic: drop from the library, add to trash.
export function removeArtifact(id: string): void {
    const doc = artifacts().find((d) => d.id === id);
    setArtifacts(artifacts().filter((d) => d.id !== id));
    if (doc) setTrash([{ ...doc, trashedAt: new Date().toISOString() }, ...trash()]);
    api.trashArtifact(id).catch(() => {});
}

// Batch soft-delete — move many artifacts to Trash at once (one reactive update, one API call each).
export function removeArtifacts(ids: string[]): void {
    const set = new Set(ids);
    const now = new Date().toISOString();
    const moved = artifacts().filter((d) => set.has(d.id));
    setArtifacts(artifacts().filter((d) => !set.has(d.id)));
    if (moved.length) setTrash([...moved.map((d) => ({ ...d, trashedAt: now })), ...trash()]);
    for (const id of ids) api.trashArtifact(id).catch(() => {});
}

// Trash page state + actions.
export async function loadTrash(): Promise<void> {
    try {
        const { artifacts } = await api.listTrash();
        setTrash(artifacts);
    } catch {
        /* keep whatever we have */
    }
}

// Restore an artifact from Trash back into the library.
export function restoreFromTrash(id: string): void {
    const doc = trash().find((d) => d.id === id);
    setTrash(trash().filter((d) => d.id !== id));
    if (doc) setArtifacts([{ ...doc, trashedAt: null }, ...artifacts()]);
    api.restoreArtifact(id).catch(() => {});
}

// Permanently delete a single trashed artifact.
export function purgeArtifact(id: string): void {
    setTrash(trash().filter((d) => d.id !== id));
    api.deleteArtifact(id).catch(() => {});
}

// Permanently delete everything in Trash.
export function emptyTrash(): void {
    setTrash([]);
    api.emptyTrash().catch(() => {});
}

// Duplicate an artifact — copy its content into a new doc (kept in the same folder), placed at the top.
export async function duplicateArtifact(orig: ArtifactSummary): Promise<string | null> {
    try {
        let content = contents()[orig.id];
        if (!content) {
            const { artifact } = await api.getArtifact(orig.id);
            content = artifact.draftContent;
        }
        const title = `${orig.title} copy`;
        const { id } = await api.createArtifact({
            title,
            formatId: orig.formatId,
            themeId: orig.themeId,
            draftContent: content,
            folderId: orig.folderId ?? null,
        });
        const dup: ArtifactSummary = { ...orig, id, title, updatedAt: new Date().toISOString() };
        setArtifacts([dup, ...artifacts()]);
        setContents({ ...contents(), [id]: content });
        return id;
    } catch {
        return null;
    }
}

// The artifact's title = the first text run in its first section (its headline), clipped, else a fallback.
// Shared by every "create from generated content" path (the generate modal + the in-chat draft) so a new
// piece is named the same way however it was made.
const clipTitle = (s: string, n = 60): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
const firstTextOf = (inst: ElementInstance | undefined): string | undefined => {
    if (!inst) return undefined;
    const d = inst.data as { text?: string; children?: ElementInstance[] } | undefined;
    if (inst.type === "text" && typeof d?.text === "string" && d.text.trim()) return d.text.trim();
    for (const k of d?.children ?? []) {
        const found = firstTextOf(k);
        if (found) return found;
    }
    return undefined;
};
export function artifactTitle(content: ArtifactContent): string {
    const first = content.sections[0];
    const t = first ? firstTextOf(first.root) : undefined;
    return t ? clipTitle(t) : "Untitled";
}

// Persist a fully-formed artifact as a NEW library artifact and return its id (to navigate to). The one
// create path for content that was generated rather than authored in the editor — the generate modal's
// "Open in editor" and the chat draft's "Open in editor" both land here, so an in-chat draft only ever
// touches the library at this single, explicit call. Optimistically inserts it into the library list.
export async function persistArtifact(
    content: ArtifactContent,
    title = artifactTitle(content),
    folderId: string | null = null,
): Promise<string | null> {
    try {
        const { id } = await api.createArtifact({
            title,
            formatId: content.format,
            themeId: content.theme,
            draftContent: content,
            folderId,
        });
        const summary: ArtifactSummary = {
            id,
            title,
            formatId: content.format,
            themeId: content.theme,
            folderId,
            updatedAt: new Date().toISOString(),
        };
        setArtifacts([summary, ...artifacts()]);
        setContents({ ...contents(), [id]: content });
        return id;
    } catch {
        return null;
    }
}

// A minimal starting artifact for "create new" — one empty section the user fills in the editor.
export function blankArtifact(format: string, theme = "studio"): ArtifactContent {
    return {
        format,
        theme,
        sections: [{ id: "s-1", root: emptyRegion() }],
    };
}

// Format helpers shared across the app UI. The ordered id set is derived from the engine's PROFILES so
// the app never restates it; the display labels live here because "Site" (for `web`) is a UI/product
// term, not the engine's format name ("Web").

export const FORMAT_IDS = Object.keys(PROFILES); // ["deck", "doc", "web"]

export const formatLabel = (id: string): string =>
    id === "web" ? "Site" : id === "doc" ? "Doc" : "Deck";

export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;

// Icon glyph per format (deck / doc / site — the glyphs live in @ui/icons).
export const formatIcon = (id: string): string =>
    id === "web" ? "site" : id === "doc" ? "doc" : "deck";

// The single ordered {id,label,icon} list every format switcher/picker builds on (Topbar · generate ·
// theme · templates), so the deck/doc/web triple is never restated per-view.
export const FORMATS: { id: string; label: string; icon: string }[] = FORMAT_IDS.map((id) => ({
    id,
    label: formatLabel(id),
    icon: formatIcon(id),
}));

// Relative "…ago" timestamp for the library / trash cards.
export function relativeTime(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
    return `${Math.floor(s / 604_800)}w ago`;
}
