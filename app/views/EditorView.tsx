import type { Component } from "solid-js";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { limitsFor } from "@model/billing";
import { Studio } from "@editor/Studio";
import { Button } from "@ui/button";
import { FloatingBar } from "@ui/overlay";
import {
    currentTitle,
    editor,
    endThemePreview,
    keepPreviewedTheme,
    loadArtifactContent,
    onHome,
    onMediaPicker,
    onPersistTitle,
    onReviseElement,
    onSectionStream,
    onShare,
    onSuggestSections,
    onTextAssist,
    onSwitchArtifact,
    onThemePicker,
    onUpgrade,
    previewingTheme,
    previewSavedTheme,
    setArtifacts,
    setFeatures,
    startThemePreview,
} from "@editor/editor";
import { api, streamTurn } from "../api";
import { openMediaPicker } from "../media";
import { openShare } from "../share";
import { can } from "../stores/features";
import { renameArtifactById } from "../stores/library";
import { billing, loadBilling } from "../stores/billing";
import { setEditorActive } from "../stores/chat";
import { appTheme, setFaviconOverride, openThemeEditor } from "../theme";
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

    // Tell the (global) chat panel the editor is the active view, so it chats about — and can edit — THIS
    // artifact. Cleared on unmount so the chat falls back to the library surface when we navigate away
    // (the editor store keeps the artifact loaded, but it's no longer on screen).
    setEditorActive(true);
    onCleanup(() => setEditorActive(false));

    // reflect the open artifact's theme in the browser-tab favicon; revert to the app theme on exit
    createEffect(() => setFaviconOverride(editor.artifact.theme));

    // Push the workspace plan's export features into the studio so its Export menu gates paid formats
    // and keeps/strips the Galleo mark. Defaults to Free until billing loads (most-restrictive is safe).
    createEffect(() => {
        const { exportFormats, removeBranding } = limitsFor(billing()?.plan);
        // publicLinks is launch-status-aware (off while `planned`), so read it from the features store
        // (GET /features → resolveFeatures) rather than the raw plan grant in limitsFor.
        setFeatures({ exportFormats, removeBranding, publicLinks: can("publicLinks") });
    });
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
        onThemePicker(() => openThemeEditor());
        onMediaPicker((req) => openMediaPicker(req));
        onPersistTitle((id, title) => renameArtifactById(id, title));
        onUpgrade(() => navigate("/pricing"));
        onShare(() => {
            if (params.id) openShare({ artifactId: params.id, title: currentTitle() });
        });
        // The insert-a-section flow streams a turn through the app's SSE transport, then refreshes the
        // credit meter (the turn was billed server-side). Kept here so the editor stays app-free.
        onSectionStream(async (req, onEvent, signal) => {
            await streamTurn(req, onEvent, signal);
            void loadBilling();
        });
        // Cheap, unmetered section suggestions for the insert-a-section popup (client caches per artifact).
        onSuggestSections((content) => api.suggestSections(content));
        // Regenerate one element in place (metered edit-element) → refresh the credit meter after.
        onReviseElement(async (content, sectionId, element, instruction) => {
            const el = await api.reviseElement(content, sectionId, element, instruction);
            void loadBilling();
            return el;
        });
        // Rewrite / translate the selected text passage (metered rewrite / translate) → refresh the meter.
        onTextAssist(async (r) => {
            const text = await api.assistText(r);
            void loadBilling();
            return text;
        });
        void loadBilling();
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
                <div class="pointer-events-none absolute inset-0 z-overlay">
                    <FloatingBar
                        tone="panel"
                        rounded="full"
                        anchor="bottomCenter"
                        shadow="lg"
                        class="pointer-events-auto text-[12.5px]"
                    >
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
                        <Button
                            variant="primary"
                            rounded="full"
                            size="sm"
                            onClick={keepPreviewedTheme}
                        >
                            Keep
                        </Button>
                        <Button variant="ghost" size="sm" onClick={endThemePreview}>
                            Revert
                        </Button>
                    </FloatingBar>
                </div>
            </Show>
        </div>
    );
};
