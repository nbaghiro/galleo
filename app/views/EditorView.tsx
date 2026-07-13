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
import { openMediaPicker } from "../stores/media";
import { openShare } from "../stores/share";
import { can } from "../stores/features";
import { renameArtifactById } from "../stores/library";
import { billing, loadBilling } from "../stores/billing";
import { setEditorActive } from "../stores/chat";
import { appTheme, setFaviconOverride, openThemeEditor } from "../stores/theme";
import { flushAutosave, installAutosave } from "../stores/save";

export const EditorView: Component = () => {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [ready, setReady] = createSignal(false);
    const [error, setError] = createSignal("");

    installAutosave();

    // mark the editor active so the global chat targets this artifact; cleared on unmount
    setEditorActive(true);
    onCleanup(() => setEditorActive(false));

    // favicon follows the artifact theme; reverted on exit
    createEffect(() => setFaviconOverride(editor.artifact.theme));

    // feed plan export limits to the studio; defaults to Free until billing loads (safest)
    createEffect(() => {
        const { exportFormats, removeBranding } = limitsFor(billing()?.plan);
        // publicLinks is launch-status-aware — read from the features store, not the raw plan grant
        setFeatures({ exportFormats, removeBranding, publicLinks: can("publicLinks") });
    });
    onCleanup(() => setFaviconOverride(null));
    // never leave a theme preview dangling when leaving the editor
    onCleanup(() => endThemePreview());

    const loadId = async (id: string): Promise<void> => {
        setReady(false);
        setError("");
        try {
            const { artifact } = await api.getArtifact(id);
            loadArtifactContent(artifact.id, artifact.draftContent);
            // "view in app theme" → preview without touching the saved theme
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
        // stream via the app SSE transport then refresh the meter — keeps the editor app-free
        onSectionStream(async (req, onEvent, signal) => {
            await streamTurn(req, onEvent, signal);
            void loadBilling();
        });
        // unmetered section suggestions; client caches per artifact
        onSuggestSections((content) => api.suggestSections(content));
        // metered edit-element → refresh the meter
        onReviseElement(async (content, sectionId, element, instruction) => {
            const el = await api.reviseElement(content, sectionId, element, instruction);
            void loadBilling();
            return el;
        });
        // metered rewrite/translate → refresh the meter
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

    // reload when :id changes — a deck switch keeps this route mounted
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
