import { createEffect, on, onCleanup, untrack } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import { diffSections } from "@model/artifact";
import {
    currentArtifactId,
    editor,
    editSeq,
    isWindowed,
    themeForPersist,
} from "@editor/core/store";
import { api } from "@app/api";

// sends the difference from what the server is known to hold, so a windowed client can save at all
const DEBOUNCE_MS = 1200;
const MAX_INTERVAL_MS = 10_000;
const RETRY_MS = 3_000; // after a failed save; the baseline is unchanged, so the retry resends it

// exposed so navigation can checkpoint the current doc before switching
let activeFlush: (() => Promise<void>) | null = null;
export async function flushAutosave(): Promise<void> {
    await activeFlush?.();
}

export function installAutosave(): void {
    let timer = 0;
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
                    await api.patchContent(id, { ops, themeId, formatId: art.format });
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
        } catch {
            // the baseline is untouched, so the change is still pending; retry on a timer, not at once
            window.clearTimeout(timer);
            timer = window.setTimeout(() => flush(), RETRY_MS);
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
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("beforeunload", onUnload);
    });
}
