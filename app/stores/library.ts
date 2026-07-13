import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { emptyRegion } from "@model/section";
import { createSignal } from "solid-js";
import { api, type ArtifactSummary } from "../api";
import { PROFILES } from "@engine/profile";

const [artifacts, setArtifacts] = createSignal<ArtifactSummary[]>([]);
const [trash, setTrash] = createSignal<ArtifactSummary[]>([]);
const [contents, setContents] = createSignal<Record<string, ArtifactContent>>({});
const [artifactsLoaded, setArtifactsLoaded] = createSignal(false);
// set on a card's dragstart; read on a folder's drop
const [draggingArtifact, setDraggingArtifact] = createSignal<string | null>(null);

export { contents, artifacts, artifactsLoaded, draggingArtifact, setDraggingArtifact, trash };

// artifacts whose server content changed since fetch → next loadContents() re-pulls the thumbnail
const staleContent = new Set<string>();

export async function loadLibrary(): Promise<void> {
    try {
        const { artifacts: fresh } = await api.listArtifacts();
        // flag content stale where server updatedAt moved, so loadContents() refetches the thumbnail
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

export function moveArtifact(id: string, folderId: string | null): void {
    setArtifacts(artifacts().map((d) => (d.id === id ? { ...d, folderId } : d)));
    api.moveArtifact(id, folderId).catch(() => {});
}

// also driven by editor undo/redo of a rename (studio's onPersistTitle hook)
export function renameArtifactById(id: string, title: string): void {
    setArtifacts(artifacts().map((d) => (d.id === id ? { ...d, title } : d)));
    api.saveArtifact(id, { title }).catch(() => {});
}

export function moveArtifacts(ids: string[], folderId: string | null): void {
    const set = new Set(ids);
    setArtifacts(artifacts().map((d) => (set.has(d.id) ? { ...d, folderId } : d)));
    for (const id of ids) api.moveArtifact(id, folderId).catch(() => {});
}

export function removeArtifact(id: string): void {
    const doc = artifacts().find((d) => d.id === id);
    setArtifacts(artifacts().filter((d) => d.id !== id));
    if (doc) setTrash([{ ...doc, trashedAt: new Date().toISOString() }, ...trash()]);
    api.trashArtifact(id).catch(() => {});
}

export function removeArtifacts(ids: string[]): void {
    const set = new Set(ids);
    const now = new Date().toISOString();
    const moved = artifacts().filter((d) => set.has(d.id));
    setArtifacts(artifacts().filter((d) => !set.has(d.id)));
    if (moved.length) setTrash([...moved.map((d) => ({ ...d, trashedAt: now })), ...trash()]);
    for (const id of ids) api.trashArtifact(id).catch(() => {});
}

export async function loadTrash(): Promise<void> {
    try {
        const { artifacts } = await api.listTrash();
        setTrash(artifacts);
    } catch {
        /* keep whatever we have */
    }
}

export function restoreFromTrash(id: string): void {
    const doc = trash().find((d) => d.id === id);
    setTrash(trash().filter((d) => d.id !== id));
    if (doc) setArtifacts([{ ...doc, trashedAt: null }, ...artifacts()]);
    api.restoreArtifact(id).catch(() => {});
}

export function purgeArtifact(id: string): void {
    setTrash(trash().filter((d) => d.id !== id));
    api.deleteArtifact(id).catch(() => {});
}

export function emptyTrash(): void {
    setTrash([]);
    api.emptyTrash().catch(() => {});
}

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

// the one create path for generated (not editor-authored) content
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

export function blankArtifact(format: string, theme = "studio"): ArtifactContent {
    return {
        format,
        theme,
        sections: [{ id: "s-1", root: emptyRegion() }],
    };
}

// labels live here because "Site" (web) is a product term, not the engine's format name
export const FORMAT_IDS = Object.keys(PROFILES);

export const formatLabel = (id: string): string =>
    id === "web" ? "Site" : id === "doc" ? "Doc" : "Deck";

export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;

export const formatIcon = (id: string): string =>
    id === "web" ? "site" : id === "doc" ? "doc" : "deck";

export const FORMATS: { id: string; label: string; icon: string }[] = FORMAT_IDS.map((id) => ({
    id,
    label: formatLabel(id),
    icon: formatIcon(id),
}));

export function relativeTime(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
    return `${Math.floor(s / 604_800)}w ago`;
}
