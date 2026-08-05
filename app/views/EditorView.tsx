import type { Component } from "solid-js";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { Navigate, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { limitsFor } from "@model/billing";
import { Editor } from "@editor/Editor";
import { Button } from "@ui/button";
import { FloatingBar } from "@ui/overlay";
import { canEditHere } from "@ui/viewport";
import {
    currentTitle,
    editor,
    endThemePreview,
    keepPreviewedTheme,
    loadArtifactWindow,
    onHome,
    onLoadSections,
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
} from "@editor/core/store";
import { api, streamTurn } from "../api";
import { openMediaPicker } from "../stores/media";
import { openShare } from "../stores/share";
import { can, loadFeatures } from "../stores/features";
import { renameArtifactById } from "../stores/library";
import { recordVisit } from "../stores/search";
import { billing, loadBilling } from "../stores/billing";
import { setEditorActive } from "../stores/chat";
import { appTheme, loadCustomThemes, setFaviconOverride, openThemeEditor } from "../stores/theme";
import { flushAutosave, installAutosave } from "../stores/save";

// Above what a normal deck or doc holds, so windowing only engages for the long ones.
const FIRST_WINDOW = 24;

export const EditorView: Component = () => {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [ready, setReady] = createSignal(false);
    const [error, setError] = createSignal("");

    installAutosave();

    // so the global chat targets this artifact
    setEditorActive(true);
    onCleanup(() => setEditorActive(false));

    createEffect(() => setFaviconOverride(editor.artifact.theme));

    // defaults to Free until billing loads
    createEffect(() => {
        const { exportFormats, removeBranding } = limitsFor(billing()?.plan);
        // publicLinks is launch-status-aware, so read the features store, not the raw plan grant
        setFeatures({ exportFormats, removeBranding, publicLinks: can("publicLinks") });
    });
    onCleanup(() => setFaviconOverride(null));
    onCleanup(() => endThemePreview());

    const loadId = async (id: string): Promise<void> => {
        setReady(false);
        setError("");
        try {
            const { artifact } = await api.getArtifactWindow(id, 0, FIRST_WINDOW);
            loadArtifactWindow(artifact.id, artifact.shell, artifact.index, artifact.sections);
            recordVisit(id); // every open path lands here, so this is the one read-clock write
            // "view in app theme" → preview without touching the saved theme
            if (searchParams.as === "app") startThemePreview(appTheme());
            setReady(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not open this artifact");
        }
    };

    onMount(() => {
        onLoadSections(async (ids) => {
            const id = params.id;
            if (!id) return [];
            const { sections } = await api.getSections(id, { ids });
            return sections;
        });
        onHome(() => flushAutosave().then(() => navigate("/")));
        onSwitchArtifact((id) => flushAutosave().then(() => navigate(`/edit/${id}`)));
        onThemePicker(() => openThemeEditor());
        onMediaPicker((req) => openMediaPicker(req));
        onPersistTitle((id, title) => renameArtifactById(id, title));
        onUpgrade(() => navigate("/pricing"));
        onShare(() => {
            if (params.id) openShare({ artifactId: params.id, title: currentTitle() });
        });
        // the editor stays app-free, so the app supplies the SSE transport
        onSectionStream(async (req, onEvent, signal) => {
            await streamTurn(req, onEvent, signal);
            void loadBilling();
        });
        // unmetered, so no meter refresh
        onSuggestSections((content) => api.suggestSections(content));
        onReviseElement(async (content, sectionId, element, instruction) => {
            const el = await api.reviseElement(content, sectionId, element, instruction);
            void loadBilling();
            return el;
        });
        onTextAssist(async (r) => {
            const text = await api.assistText(r);
            void loadBilling();
            return text;
        });
        void loadBilling();
        void loadFeatures(); // self-heals a failed boot-time fetch
        void loadCustomThemes(); // the artifact may use one; idempotent
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

    // a deck switch keeps this route mounted, and a tablet may rotate into an editable width
    createEffect(
        on(
            () => [params.id, canEditHere()] as const,
            ([id, editable]) => {
                if (id && editable) loadId(id);
            },
        ),
    );

    return (
        <Show when={canEditHere()} fallback={<Navigate href={`/present/${params.id}`} />}>
            <div class="relative h-full">
                <Show
                    when={ready()}
                    fallback={
                        <div class="flex h-full items-center justify-center text-[13px] text-muted">
                            {error() || "Opening…"}
                        </div>
                    }
                >
                    <Editor />
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
                                    {
                                        resolveTheme(previewSavedTheme() ?? editor.artifact.theme)
                                            .name
                                    }
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
        </Show>
    );
};
