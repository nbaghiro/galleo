// The client-side artifact store: the library list + content cache, blank-artifact factory, and format labels / relative-time helpers.

import type { ArtifactContent } from "@model/artifact";
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

export async function loadLibrary(): Promise<void> {
    try {
        const { artifacts } = await api.listArtifacts();
        setArtifacts(artifacts);
    } catch {
        /* keep whatever we have */
    } finally {
        setArtifactsLoaded(true);
    }
}

// fetch full content for any artifacts we don't have yet (for the section thumbnails)
export async function loadContents(): Promise<void> {
    const missing = artifacts().filter((d) => !contents()[d.id]);
    const entries = await Promise.all(
        missing.map(async (d): Promise<[string, ArtifactContent] | null> => {
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

// A minimal starting artifact for "create new" — one empty section the user fills in the editor.
export function blankArtifact(format: string, theme = "studio"): ArtifactContent {
    return {
        format,
        theme,
        sections: [{ id: "s-1", grid: "full", cells: { a: {} } }],
    };
}

// Format helpers shared across the app UI. The ordered id set is derived from the engine's PROFILES so
// the app never restates it; the display labels live here because "Site" (for `web`) is a UI/product
// term, not the engine's format name ("Web").

export const FORMAT_IDS = Object.keys(PROFILES); // ["deck", "doc", "web"]

export const formatLabel = (id: string): string =>
    id === "web" ? "Site" : id === "doc" ? "Doc" : "Deck";

export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;

// Relative "…ago" timestamp for the library / trash cards.
export function relativeTime(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
    return `${Math.floor(s / 604_800)}w ago`;
}
