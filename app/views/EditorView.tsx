import type { Component } from "solid-js";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { resolveTheme } from "@themes/library";
import { Studio } from "@editor/Studio";
import {
    editor,
    endThemePreview,
    keepPreviewedTheme,
    loadArtifactContent,
    onHome,
    onPersistTitle,
    onSwitchArtifact,
    onThemePicker,
    previewingTheme,
    previewSavedTheme,
    setArtifacts,
    startThemePreview,
} from "@editor/editor";
import { api } from "../api";
import { renameArtifactById } from "../stores/library";
import { appTheme, setFaviconOverride, openThemeDrawer } from "../theme/theme";
import { flushAutosave, installAutosave } from "../stores/save";

// One route per open artifact (/edit/:id). Loads it, runs the studio with autosave, and routes the
// studio's wordmark (home) + doc switcher back through the router — flushing the current doc first.
export const EditorView: Component = () => {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [ready, setReady] = createSignal(false);
    const [error, setError] = createSignal("");

    installAutosave();

    // reflect the open artifact's theme in the browser-tab favicon; revert to the app theme on exit
    createEffect(() => setFaviconOverride(editor.artifact.theme));
    onCleanup(() => setFaviconOverride(null));
    // never leave a preview dangling on the in-memory artifact when leaving the editor
    onCleanup(() => endThemePreview());

    const loadId = async (id: string): Promise<void> => {
        setReady(false);
        setError("");
        try {
            const { artifact } = await api.getArtifact(id);
            loadArtifactContent(artifact.id, artifact.draftContent);
            // opened from the library with "view in app theme" → preview without touching the saved theme
            if (searchParams.as === "app") startThemePreview(appTheme());
            setReady(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not open this artifact");
        }
    };

    onMount(() => {
        onHome(() => flushAutosave().then(() => navigate("/")));
        onSwitchArtifact((id) => flushAutosave().then(() => navigate(`/edit/${id}`)));
        onThemePicker(() => openThemeDrawer());
        onPersistTitle((id, title) => renameArtifactById(id, title));
        (async () => {
            try {
                const { artifacts } = await api.listArtifacts();
                setArtifacts(
                    artifacts.map((a) => ({ id: a.id, title: a.title, themeId: a.themeId })),
                );
            } catch {
                // the switcher just stays empty
            }
        })();
    });

    // Load on mount + whenever the :id changes (a deck switch keeps this route mounted).
    createEffect(
        on(
            () => params.id,
            (id) => {
                if (id) loadId(id);
            },
        ),
    );

    return (
        <div class="relative h-full">
            <Show
                when={ready()}
                fallback={
                    <div class="flex h-full items-center justify-center text-[13px] text-muted">
                        {error() || "Opening…"}
                    </div>
                }
            >
                <Studio />
            </Show>
            <Show when={previewingTheme()}>
                <div class="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center">
                    <div class="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-panel/95 px-4 py-2 text-[12.5px] shadow-xl backdrop-blur">
                        <span class="text-soft">
                            Previewing in{" "}
                            <span class="font-semibold text-ink">
                                {resolveTheme(appTheme()).name}
                            </span>
                            <span class="text-muted">
                                {" · "}saved as{" "}
                                {resolveTheme(previewSavedTheme() ?? editor.artifact.theme).name}
                            </span>
                        </span>
                        <button
                            class="rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-onaccent"
                            onClick={keepPreviewedTheme}
                        >
                            Keep
                        </button>
                        <button
                            class="rounded-full px-2 py-1 text-[12px] font-medium text-soft hover:text-ink"
                            onClick={endThemePreview}
                        >
                            Revert
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
};
