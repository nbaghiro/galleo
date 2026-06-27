import { createEffect, on, onCleanup, untrack } from "solid-js";
import { currentArtifactId, editor, editSeq } from "@studio/editor";
import { api } from "./api";

// Smart autosave: coalesce a burst of edits into a single PATCH so we don't bombard the API.
//  · debounce ~1.2s after the last edit
//  · but force a flush every ~10s during continuous editing (so long sessions still checkpoint)
//  · flush when the tab is hidden / unloaded (never lose the tail)
//  · one PATCH in flight at a time; edits during a save trigger one more flush after it returns
const DEBOUNCE_MS = 1200;
const MAX_INTERVAL_MS = 10_000;

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
        try {
            await api.saveDoc(id, { draftContent: art, themeId: art.theme, formatId: art.format });
        } catch {
            dirtyWhileSaving = true; // failed — retry on the next tick
        }
        saving = false;
        if (dirtyWhileSaving) {
            dirtyWhileSaving = false;
            void flush();
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
                const delay = elapsed >= MAX_INTERVAL_MS ? 0 : Math.min(DEBOUNCE_MS, MAX_INTERVAL_MS - elapsed);
                timer = window.setTimeout(() => void flush(), delay);
            },
            { defer: true },
        ),
    );

    const onVisibility = (): void => {
        if (document.visibilityState === "hidden") void flush();
    };
    const onUnload = (): void => void flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);
    onCleanup(() => {
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("beforeunload", onUnload);
    });
}
