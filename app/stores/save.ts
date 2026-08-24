import { createEffect, on, onCleanup, untrack } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import { diffSections } from "@model/artifact";
import {
    checkpointLiveEdit,
    currentArtifactId,
    editor,
    editSeq,
    isWindowed,
    noteSaveState,
    themeForPersist,
} from "@editor/core/store";
import { api, ApiError } from "@app/api";
import { capture } from "@ui/analytics";

// sends the difference from what the server is known to hold, so a windowed client can save at all
const DEBOUNCE_MS = 1200;
const MAX_INTERVAL_MS = 10_000;
const RETRY_MS = 3_000; // after a failed save; the baseline is unchanged, so the retry resends it
const RETRY_MAX_MS = 60_000; // the ceiling the backoff walks up to while a save keeps failing

// A network failure or a server one is worth waiting out. A refusal is not: the server has answered
// the question, and asking again every three seconds for the rest of the session only produces one
// more save_failed per attempt.
const retryable = (status: number): boolean =>
    status === 0 || status === 408 || status === 429 || status >= 500;

const retryDelay = (attempt: number): number =>
    Math.min(RETRY_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS);

// exposed so navigation can checkpoint the current doc before switching
let activeFlush: (() => Promise<void>) | null = null;
export async function flushAutosave(): Promise<void> {
    await activeFlush?.();
}

// One baseline, two drivers, never both at once. While the collaboration socket is up it is the
// persistence path and its acks move the baseline; the debounced HTTP save stands down. When the
// socket goes away the HTTP save picks up from the last acked state, which its existing diff
// already knows how to do.
//
// Also how a load re-baselines: re-reading the same artifact rebuilds every section object, and a
// diff against the objects the previous read produced would resend the whole document for nothing.
let noteSaved: ((content: ArtifactContent) => void) | null = null;
export function noteSavedContent(content: ArtifactContent): void {
    noteSaved?.(content);
}

// A conflict is not a failed save to retry: the server holds a document these ops do not describe,
// so resending them fails the same way. The window has to be re-read first, which is the editor
// route's job, exactly as it is for a resync off the collaboration socket.
let conflicted: (() => void) | null = null;
export function onSaveConflict(fn: (() => void) | null): void {
    conflicted = fn;
}

// Asked, not imported, so the wire layer depends on this file and not the other way round.
let socketDriving: () => boolean = () => false;
let connIdOf: () => string | null = () => null;
export function onCollabDriving(fn: () => boolean, connId: () => string | null): void {
    socketDriving = fn;
    connIdOf = connId;
}

export function installAutosave(): void {
    let timer = 0;
    let retries = 0;
    let windowStart = 0; // when the current un-saved edit window opened
    let saving = false;
    let dirtyWhileSaving = false;
    // the server's known state; each save's diff is taken against it
    let savedId: string | null = untrack(currentArtifactId);
    let saved: ArtifactContent | null = savedId ? untrack(() => editor.artifact) : null;

    const saveWhole = async (
        id: string,
        content: ArtifactContent,
        themeId: string,
    ): Promise<void> => {
        await api.saveArtifact(id, { draftContent: content, themeId, formatId: content.format });
    };

    async function flush(): Promise<void> {
        const id = untrack(currentArtifactId);
        if (!id) return;
        // An open text session holds its keystrokes in the tree and only turns them into ops when it
        // ends, so whichever driver is about to persist is given them first. Under the socket this
        // is the whole of what a flush does, which is what makes a navigation or a page hide
        // mid-sentence save at all; under HTTP the diff below would have picked them up anyway.
        checkpointLiveEdit();
        // the socket is persisting; a second writer here would race its own acks
        if (socketDriving()) {
            window.clearTimeout(timer);
            windowStart = 0;
            return;
        }
        if (saving) {
            dirtyWhileSaving = true;
            return;
        }
        window.clearTimeout(timer);
        windowStart = 0;
        saving = true;
        const art = untrack(() => editor.artifact);
        // While previewing in the app theme, persist the artifact's real saved theme (not the preview).
        const themeId = untrack(themeForPersist);
        const persisted: ArtifactContent = { ...art, theme: themeId };
        const windowed = untrack(isWindowed);
        const baseline = savedId === id ? saved : null;
        try {
            const ops = baseline ? diffSections(baseline, persisted) : null;
            if (ops && !ops.length) {
                // nothing the server doesn't already have
            } else if (ops) {
                try {
                    await api.patchContent(id, { ops, themeId, formatId: art.format }, connIdOf());
                } catch (e) {
                    // a whole-document client can fall back to replacing it; a windowed one cannot
                    if (windowed) throw e;
                    await saveWhole(id, persisted, themeId);
                }
            } else {
                await saveWhole(id, persisted, themeId);
            }
            saved = persisted;
            savedId = id;
            retries = 0;
            noteSaveState(true);
        } catch (e) {
            // the baseline is untouched, so the change is still pending; retry on a timer, not at once
            const status = e instanceof ApiError ? e.status : 0;
            retries += 1;
            noteSaveState(false);
            capture("save_failed", {
                reason: status ? String(status) : "network",
                retry_count: retries,
                section_count: persisted.sections.length,
            });
            window.clearTimeout(timer);
            if (status === 409) conflicted?.();
            else if (retryable(status))
                timer = window.setTimeout(() => flush(), retryDelay(retries));
        }
        saving = false;
        if (dirtyWhileSaving) {
            dirtyWhileSaving = false;
            flush();
        }
    }

    // A load establishes the baseline the next diff is taken against; it is not itself a save.
    createEffect(
        on(currentArtifactId, (id) => {
            savedId = id;
            saved = id ? untrack(() => editor.artifact) : null;
        }),
    );

    // fires only on real edits: loading an artifact doesn't bump editSeq, so loads never save
    createEffect(
        on(
            editSeq,
            () => {
                if (!untrack(currentArtifactId)) return;
                const now = Date.now();
                if (windowStart === 0) windowStart = now;
                window.clearTimeout(timer);
                const elapsed = now - windowStart;
                const delay =
                    elapsed >= MAX_INTERVAL_MS
                        ? 0
                        : Math.min(DEBOUNCE_MS, MAX_INTERVAL_MS - elapsed);
                timer = window.setTimeout(() => flush(), delay);
            },
            { defer: true },
        ),
    );

    activeFlush = flush;
    noteSaved = (content) => {
        savedId = untrack(currentArtifactId);
        saved = content;
    };
    const onVisibility = (): void => {
        if (document.visibilityState === "hidden") flush();
    };
    const onUnload = (): void => {
        flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);
    onCleanup(() => {
        window.clearTimeout(timer);
        if (activeFlush === flush) activeFlush = null;
        noteSaved = null;
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("beforeunload", onUnload);
    });
}
