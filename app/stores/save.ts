import { createEffect, on, onCleanup, untrack } from "solid-js";
import { currentArtifactId, editor, editSeq, themeForPersist } from "@editor/editor";
import { api } from "../api";

// Smart autosave: coalesce a burst of edits into a single PATCH so we don't bombard the API.
//  · debounce ~1.2s after the last edit
//  · but force a flush every ~10s during continuous editing (so long sessions still checkpoint)
//  · flush when the tab is hidden / unloaded (never lose the tail)
//  · one PATCH in flight at a time; edits during a save trigger one more flush after it returns
const DEBOUNCE_MS = 1200;
const MAX_INTERVAL_MS = 10_000;

// The active controller's flush, exposed so navigation can checkpoint the current doc before switching.
let activeFlush: (() => Promise<void>) | null = null;
export async function flushAutosave(): Promise<void> {
    await activeFlush?.();
}

export function installAutosave(): void {
    let timer = 0;
    let windowStart = 0; // when the current un-saved edit window opened
    let saving = false;
    let dirtyWhileSaving = false;

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
        try {
            await api.saveArtifact(id, {
                draftContent: { ...art, theme: themeId },
                themeId,
                formatId: art.format,
            });
        } catch {
            dirtyWhileSaving = true; // failed — retry on the next tick
        }
        saving = false;
        if (dirtyWhileSaving) {
            dirtyWhileSaving = false;
            flush();
        }
    }

    // Fires only on real edits (editSeq bumps); loading an artifact doesn't bump it, so loads never save.
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
