import type {
    ArtifactAccess,
    ArtifactContent,
    ElementInstance,
    Section,
    GenMeta,
} from "@model/artifact";
import { emptyRegion } from "@model/artifact";
import { createSignal } from "solid-js";
import { api, type ArtifactSummary } from "@app/api";
import { asFormat } from "@model/analytics";
import { capture } from "@ui/analytics";
import { PROFILES, resolveProfile } from "@engine/profile";

const [artifacts, setArtifacts] = createSignal<ArtifactSummary[]>([]);
const [trash, setTrash] = createSignal<ArtifactSummary[]>([]);
const [contents, setContents] = createSignal<Record<string, ArtifactContent>>({});
const [artifactsLoaded, setArtifactsLoaded] = createSignal(false);
// null once the list is exhausted; the infinite-scroll sentinel reads it to know when to stop
const [nextCursor, setNextCursor] = createSignal<string | null>(null);
const [loadingMore, setLoadingMore] = createSignal(false);
// set on a card's dragstart; read on a folder's drop
const [draggingArtifact, setDraggingArtifact] = createSignal<string | null>(null);

export {
    contents,
    artifacts,
    artifactsLoaded,
    draggingArtifact,
    loadingMore,
    nextCursor,
    setDraggingArtifact,
    trash,
};

// How the library draws its rows. A per-device layout choice, so localStorage rather than the
// account row: the same person wants list on a laptop and grid on a wide monitor.
export type LibraryLayout = "list" | "grid";
const LAYOUT_KEY = "galleo:library-layout";
let storedLayout: string | null = null;
try {
    storedLayout = localStorage.getItem(LAYOUT_KEY);
} catch {
    /* storage unavailable — use the default */
}
const [libraryLayout, setLayoutSignal] = createSignal<LibraryLayout>(
    storedLayout === "list" ? "list" : "grid",
);
export { libraryLayout };

export function setLibraryLayout(v: LibraryLayout): void {
    setLayoutSignal(v);
    try {
        localStorage.setItem(LAYOUT_KEY, v);
    } catch {
        /* storage unavailable */
    }
}

// artifacts whose server content changed since fetch → the next card render re-pulls its sections
const staleContent = new Set<string>();

/** The filters a page is drawn under. A page is only coherent while these hold still. */
export interface LibraryQuery {
    folderId?: string | null;
    format?: string; // "all" or a format id
    sort?: "recent" | "az";
}

let query: LibraryQuery = {};
const queryString = (q: LibraryQuery, cursor?: string | null): string => {
    const p = new URLSearchParams();
    if (q.folderId) p.set("folder", q.folderId);
    if (q.format && q.format !== "all") p.set("format", q.format);
    if (q.sort === "az") p.set("sort", "az");
    if (cursor) p.set("cursor", cursor);
    return p.toString();
};

// a page fetched under stale filters must not be appended; each fetch carries its epoch
let epoch = 0;

/** Fetch page one under `q`, replacing the list. */
export async function loadLibrary(q: LibraryQuery = query): Promise<void> {
    query = q;
    const mine = ++epoch;
    try {
        const page = await api.listArtifacts(queryString(q));
        if (mine !== epoch) return;
        // flag content stale where server updatedAt moved, so the card refetches its sections
        const seenAt = new Map(artifacts().map((a) => [a.id, a.updatedAt]));
        for (const a of page.artifacts) {
            const was = seenAt.get(a.id);
            if (was !== undefined && was !== a.updatedAt) staleContent.add(a.id);
        }
        setArtifacts(page.artifacts);
        setNextCursor(page.nextCursor);
    } catch {
        /* keep whatever we have */
    } finally {
        if (mine === epoch) setArtifactsLoaded(true);
    }
}

/** Append the next page. No-op while one is in flight or once the list is exhausted. */
export async function loadMoreArtifacts(): Promise<void> {
    const cursor = nextCursor();
    if (!cursor || loadingMore()) return;
    const mine = epoch;
    setLoadingMore(true);
    try {
        const page = await api.listArtifacts(queryString(query, cursor));
        if (mine !== epoch) return;
        const seen = new Set(artifacts().map((a) => a.id));
        setArtifacts([...artifacts(), ...page.artifacts.filter((a) => !seen.has(a.id))]);
        setNextCursor(page.nextCursor);
    } catch {
        /* leave the cursor in place so the sentinel can retry */
    } finally {
        setLoadingMore(false);
    }
}

let firstLoad: Promise<void> | null = null;
/** Load the library once, on demand: ⌘K may need it before the library view has ever mounted. */
export function ensureLibrary(): Promise<void> {
    if (!firstLoad) firstLoad = loadLibrary();
    return firstLoad;
}

// ids per request; a wide strip asks for more than this, split across requests rather than truncated
export const CARD_BATCH = 8;
// artifacts whose sections stay in memory; a long scroll would otherwise accumulate the whole library
const CARD_CACHE_MAX = 30;

// sections held per artifact, keyed by section id: a strip loads the ones scrolled into view, not all
const [cardSections, setCardSections] = createSignal<Record<string, Record<string, Section>>>({});
export { cardSections };

export const cardSection = (artifactId: string, sectionId: string): Section | undefined =>
    cardSections()[artifactId]?.[sectionId];

const recentCards: string[] = [];
function touchCard(id: string): void {
    const at = recentCards.indexOf(id);
    if (at >= 0) recentCards.splice(at, 1);
    recentCards.unshift(id);
}

function evictCards(
    next: Record<string, Record<string, Section>>,
): Record<string, Record<string, Section>> {
    if (recentCards.length <= CARD_CACHE_MAX) return next;
    const drop = recentCards.splice(CARD_CACHE_MAX);
    const kept = { ...next };
    for (const id of drop) delete kept[id];
    return kept;
}

/** Seed a card from content the client just wrote, so its strip doesn't refetch what it has. */
export function seedCardSections(id: string, sections: Section[]): void {
    const by: Record<string, Section> = {};
    for (const sec of sections) by[sec.id] = sec;
    touchCard(id);
    setCardSections(evictCards({ ...cardSections(), [id]: by }));
    staleContent.delete(id);
}

const inFlight = new Map<string, Promise<void>>();
const flightKey = (id: string, ids: string[]): string => `${id}:${[...ids].sort().join(",")}`;

/** Section ids of `want` this card doesn't hold yet. */
export function missingCardSections(id: string, want: string[]): string[] {
    const have = cardSections()[id] ?? {};
    const fresh = !staleContent.has(id);
    return want.filter((sid) => !(fresh && have[sid]));
}

function fetchCardBatch(id: string, need: string[]): Promise<void> {
    const key = flightKey(id, need);
    const running = inFlight.get(key);
    if (running) return running;
    const run = (async (): Promise<void> => {
        try {
            const { sections } = await api.getSections(id, { ids: need });
            const held = staleContent.has(id) ? {} : (cardSections()[id] ?? {});
            const merged = { ...held };
            for (const sec of sections) merged[sec.id] = sec;
            touchCard(id);
            setCardSections(evictCards({ ...cardSections(), [id]: merged }));
            staleContent.delete(id);
        } catch {
            /* the tiles keep their stand-ins */
        } finally {
            inFlight.delete(key);
        }
    })();
    inFlight.set(key, run);
    return run;
}

/**
 * Fetch the named sections for a card, splitting a wide strip across requests rather than dropping the
 * overflow: on a large monitor every visible tile must resolve, not the first batch of them.
 */
export function ensureCardSections(id: string, want: string[]): Promise<void> {
    const need = missingCardSections(id, want);
    if (!need.length) return Promise.resolve();
    const batches: Promise<void>[] = [];
    for (let i = 0; i < need.length; i += CARD_BATCH)
        batches.push(fetchCardBatch(id, need.slice(i, i + CARD_BATCH)));
    return Promise.all(batches).then(() => undefined);
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

// Optimistic like the rest of this file: the modal reverts its own control if the server refuses.
export function setArtifactAccessLocal(id: string, access: ArtifactAccess | null): void {
    setArtifacts(artifacts().map((d) => (d.id === id ? { ...d, access: access ?? undefined } : d)));
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
        capture("artifact_created", { source: "duplicated", format: asFormat(orig.formatId) });
        capture("artifact_duplicated", {
            format: asFormat(orig.formatId),
            section_count: content.sections.length,
        });
        const dup: ArtifactSummary = { ...orig, id, title, updatedAt: new Date().toISOString() };
        setArtifacts([dup, ...artifacts()]);
        setContents({ ...contents(), [id]: content });
        seedCardSections(id, content.sections);
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
    aiMeta?: GenMeta,
    templateId?: string,
): Promise<string | null> {
    try {
        const { id } = await api.createArtifact({
            title,
            formatId: content.format,
            themeId: content.theme,
            draftContent: content,
            folderId,
            ...(aiMeta ? { aiMeta } : {}),
            ...(templateId ? { templateId } : {}),
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
        seedCardSections(id, content.sections);
        return id;
    } catch {
        return null;
    }
}

export async function updateArtifactContent(
    id: string,
    content: ArtifactContent,
    title?: string,
    aiMeta?: GenMeta,
): Promise<boolean> {
    try {
        await api.saveArtifact(id, {
            ...(title !== undefined ? { title } : {}),
            formatId: content.format,
            themeId: content.theme,
            draftContent: content,
            ...(aiMeta ? { aiMeta } : {}),
        });
        setArtifacts(
            artifacts().map((d) =>
                d.id === id
                    ? {
                          ...d,
                          ...(title !== undefined ? { title } : {}),
                          formatId: content.format,
                          themeId: content.theme,
                          updatedAt: new Date().toISOString(),
                      }
                    : d,
            ),
        );
        setContents({ ...contents(), [id]: content });
        seedCardSections(id, content.sections);
        return true;
    } catch {
        return false;
    }
}

export function blankArtifact(format: string, theme = "studio"): ArtifactContent {
    return {
        format,
        theme,
        sections: [{ id: "s-1", root: emptyRegion() }],
    };
}

// a blank artifact in the given format; every "start blank" entry runs through here
export async function createBlank(formatId: string): Promise<string | null> {
    try {
        const { id } = await api.createArtifact({
            title: `Untitled ${formatLabel(formatId).toLowerCase()}`,
            formatId,
            themeId: "studio",
            draftContent: blankArtifact(formatId),
        });
        capture("artifact_created", { source: "blank", format: asFormat(formatId) });
        return id;
    } catch {
        return null;
    }
}

export const FORMAT_IDS = Object.keys(PROFILES);

// the profile's `name` IS the product label ("Site", not "Web"); resolveProfile falls back to deck
export const formatLabel = (id: string): string => resolveProfile(id).name;

export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;

// icons are a UI concern, so they stay out of the descriptor
const ICONS: Record<string, string> = { deck: "deck", doc: "doc", web: "site" };
export const formatIcon = (id: string): string => ICONS[id] ?? "deck";

export const FORMATS: { id: string; label: string; icon: string }[] = FORMAT_IDS.map((id) => ({
    id,
    label: formatLabel(id),
    icon: formatIcon(id),
}));
