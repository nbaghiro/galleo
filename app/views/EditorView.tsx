import type { Component } from "solid-js";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { Navigate, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { setArtifactMusic } from "@elements/ops";
import { scriptRest, scriptSection } from "@editor/core/notes";
import { Editor } from "@editor/Editor";
import { Button } from "@ui/button";
import { FloatingBar } from "@ui/overlay";
import { canEditHere } from "@ui/viewport";
import {
    canEdit,
    commit,
    currentTitle,
    endEditorSession,
    noteAiAction,
    editor,
    endThemePreview,
    keepPreviewedTheme,
    loadArtifactWindow,
    onAdoptLink,
    onArtifactCredits,
    onSlidesExport,
    onHome,
    onLoadSections,
    onMediaPicker,
    onPersistTitle,
    onReviseElement,
    onSectionStream,
    onShare,
    onSuggestSections,
    onWriteNotes,
    onNarration,
    onSoundtrack,
    onComposeBed,
    onMusicPresets,
    onPrepareNarration,
    onVoiceShelf,
    type ShelfVoice,
    onTextAssist,
    onThemePicker,
    onUpgrade,
    previewSavedTheme,
    previewingTheme,
    setArtifacts,
    setEditAccess,
    setFeatures,
    startThemePreview,
} from "@editor/core/store";
import {
    clearCommentHandlers,
    onCommentCreate,
    onCommentDelete,
    onCommentEdit,
    onCommentReply,
    onCommentResolve,
} from "@editor/core/comments";
import { clearCollabHandlers } from "@editor/core/collab";
import { api, streamNarration, streamSpeakerNotes, streamTurn } from "@app/api";
import { asFormat, charsBucket } from "@model/analytics";
import type { MusicPresetInfo, NarrationTrack } from "@model/speech";
import { DEFAULT_PRESET } from "@model/speech";
import { capture, pauseReplay, resumeReplay } from "@ui/analytics";
import { closeCollab, openCollab } from "@app/stores/collab";
import {
    closeComments,
    createComment,
    deleteComment,
    editComment,
    openComments,
    replyToComment,
    resolveComment,
} from "@app/stores/comments";
import { openMediaPicker } from "@app/stores/media";
import { sendToGoogleSlides } from "@app/stores/google";
import { openShare } from "@app/stores/share";
import { can, exportFormatsOf, loadFeatures } from "@app/stores/features";
import { renameArtifactById } from "@app/stores/library";
import { recordVisit } from "@app/stores/search";
import { billing, loadBilling } from "@app/stores/billing";
import { narrationGate } from "@app/stores/narration";
import { setEditorActive } from "@app/stores/chat";
import { appTheme, loadCustomThemes, setFaviconOverride, openThemeEditor } from "@app/stores/theme";
import { flushAutosave, installAutosave, noteSavedContent, onSaveConflict } from "@app/stores/save";

// Above what a normal deck or doc holds, so windowing only engages for the long ones.
const FIRST_WINDOW = 24;

export const EditorView: Component = () => {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [shelf, setShelf] = createSignal<ShelfVoice[]>([]);
    const [presets, setPresets] = createSignal<MusicPresetInfo[]>([]);
    const [ready, setReady] = createSignal(false);
    const [error, setError] = createSignal("");

    installAutosave();

    // so the global chat targets this artifact
    setEditorActive(true);
    onCleanup(() => setEditorActive(false));

    createEffect(() => setFaviconOverride(editor.artifact.theme));

    // All three from the resolved set, never limitsFor(plan): only the resolved set carries this
    // workspace's featureOverrides and each feature's launch status. Defaults to Free until it loads.
    createEffect(() => {
        setFeatures({
            exportFormats: exportFormatsOf(),
            removeBranding: can("removeBranding"),
            publicLinks: can("publicLinks"),
        });
    });
    onCleanup(() => setFaviconOverride(null));
    onCleanup(() => endThemePreview());

    const loadId = async (id: string): Promise<void> => {
        setReady(false);
        setError("");
        try {
            const { artifact } = await api.getArtifactWindow(id, 0, FIRST_WINDOW);
            // before the content, so the first paint of a view-only artifact is already gated
            setEditAccess(artifact.access ?? "edit");
            loadArtifactWindow(artifact.id, artifact.shell, artifact.index, artifact.sections);
            // what the server holds, as of now: a re-read of the same artifact builds new section
            // objects, and a diff against the previous read's would resend the whole document
            noteSavedContent(editor.artifact);
            openComments(id); // threads are per artifact, so a switch reloads them with the content
            // the room is per artifact too; a gap it cannot replay reloads the window from here
            openCollab(id, artifact.seq ?? 0, () => void loadId(id));
            // the same resolution for the HTTP path's version of the same disagreement (a 409)
            onSaveConflict(() => void loadId(id));
            recordVisit(id); // every open path lands here, so this is the one read-clock write
            capture("artifact_opened", {
                format: asFormat(artifact.shell.format),
                section_count: artifact.total,
                access: artifact.access ?? "edit",
            });
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
        onThemePicker(() => openThemeEditor());
        onMediaPicker((req) => openMediaPicker(req));
        onAdoptLink(async (url) => (await api.adoptLink(url)).url);
        onArtifactCredits(async (id) => (await api.artifactCredits(id)).credits);
        onSlidesExport((bytes) =>
            sendToGoogleSlides(bytes, currentTitle().trim() || "Galleo deck"),
        );
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
        onReviseElement(async (content, address, instruction) => {
            const before = billing()?.credits.balance ?? 0;
            const el = await api.reviseElement(content, address.section, address.path, instruction);
            noteAiAction();
            await loadBilling();
            // The authoritative charge is on ai_action_completed from the server; this is what the
            // balance visibly moved by, which is the number the user was shown.
            capture("element_revised_with_ai", {
                element_type: el.type,
                credits_charged: Math.max(0, before - (billing()?.credits.balance ?? before)),
            });
            return el;
        });
        onWriteNotes(async (content, sectionIds, onNote, signal) => {
            await streamSpeakerNotes(
                { artifactId: params.id, content, sectionIds },
                (e) => {
                    if (e.type === "notes" && e.sectionId && e.notes)
                        onNote({ sectionId: e.sectionId, notes: e.notes });
                    if (e.type === "error" && e.message) throw new Error(e.message);
                },
                signal,
            );
            noteAiAction();
            void loadBilling();
        });
        onTextAssist(async (r) => {
            const text = await api.assistText(r);
            void loadBilling();
            return text;
        });
        // no id (a draft that has never been saved) means no narration to load, so no play control
        // the shelf drives the artifact's voice control; an empty one simply hides it
        void api
            .voices()
            .then((v) => setShelf(v))
            .catch(() => undefined);
        onVoiceShelf(() => shelf());
        const artifactId = params.id;
        // the fill-in pass runs behind the voice, so it has to die with the route rather than
        // outlive it writing notes into an artifact nobody has open
        const notesAbort = new AbortController();
        let fillIn: Promise<void> | null = null;
        onCleanup(() => notesAbort.abort());
        if (artifactId)
            onPrepareNarration(async (content, sectionIds, onSection, signal) => {
                const before = billing()?.credits.balance ?? 0;
                const startedAt = Date.now();
                let sections = 0;
                let cached = 0;
                let chars = 0;
                await streamNarration(
                    artifactId,
                    { content, sectionIds },
                    (e) => {
                        if (e.type === "section" && e.sectionId) {
                            sections++;
                            if (e.cached) cached++;
                            onSection({
                                sectionId: e.sectionId,
                                ms: e.ms ?? 0,
                                cached: !!e.cached,
                            });
                        }
                        if (e.type === "done") chars = e.chars ?? 0;
                        if (e.type === "error" && e.message) throw new Error(e.message);
                    },
                    signal,
                );
                noteAiAction();
                await loadBilling();
                capture("narration_prepared", {
                    section_count: sections,
                    cached,
                    chars: charsBucket(chars),
                    // the authoritative charge is the server's ai_action_completed; this is what the
                    // balance visibly moved by, which is the number the person was shown
                    credits_charged: Math.max(0, before - (billing()?.credits.balance ?? before)),
                    ms: Date.now() - startedAt,
                });
            });
        // parked with `backgroundMusic` at "planned": no source means no bar button and no picker
        onSoundtrack(
            artifactId && can("backgroundMusic")
                ? {
                      load: () => api.soundtrack(artifactId),
                      // starting music from the present bar writes through the editor's own commit,
                      // so the open picker and the undo stack see it like any other edit
                      ...(canEdit()
                          ? {
                                enable: async () => {
                                    // written for this piece from its own subject, not the house
                                    // preset: a bed that fits is the point of composing one at all
                                    const { trackId, track } = await api.composeSoundtrack(
                                        artifactId,
                                        { custom: true, content: editor.artifact },
                                    );
                                    commit(
                                        setArtifactMusic(editor.artifact, { on: true, trackId }),
                                    );
                                    void loadBilling();
                                    // that commit reaches the server on its own schedule, so the
                                    // bed comes from the response rather than from a read that
                                    // would ask about content the server has not been sent yet
                                    return track;
                                },
                            }
                          : {}),
                  }
                : undefined,
        );
        void api
            .musicPresets()
            .then((p) => setPresets(p))
            .catch(() => undefined);
        onMusicPresets(() => (can("backgroundMusic") ? presets() : []));
        if (artifactId && can("backgroundMusic"))
            onComposeBed(async (o) => {
                const startedAt = Date.now();
                const before = billing()?.credits.balance ?? 0;
                const { trackId, cached } = await api.composeSoundtrack(artifactId, {
                    ...o,
                    content: editor.artifact,
                });
                await loadBilling();
                capture("soundtrack_chosen", {
                    source: o.custom ? "custom" : "preset",
                    ...(o.custom ? {} : { preset: o.preset ?? DEFAULT_PRESET }),
                    cached,
                    credits_charged: Math.max(0, before - (billing()?.credits.balance ?? before)),
                    ms: Date.now() - startedAt,
                });
                return trackId;
            });
        const makeSpeakable = async (sectionId: string): Promise<NarrationTrack | null> => {
            if (!artifactId) return null;
            // Everything after the first section waits for the whole-piece pass rather than asking
            // for its own script: one pass reads as continuous prose, and a per-section call that
            // raced it would pay twice for the same words.
            if (fillIn) await fillIn.catch(() => undefined);
            const speakable = await scriptSection(sectionId, notesAbort.signal);
            void loadBilling();
            if (!speakable) return null;
            // the first section can be spoken now, so the rest are written together behind it
            fillIn ??= scriptRest(sectionId, notesAbort.signal).finally(() => loadBilling());
            const t = await api.narrateSection(artifactId, sectionId, editor.artifact);
            void loadBilling();
            return t;
        };
        // the same wall present uses: one credit refusal ends the piece rather than repeating
        // itself section by section
        const gate = artifactId
            ? narrationGate({ artifactId: () => artifactId, record: makeSpeakable })
            : null;
        onNarration(
            artifactId
                ? {
                      load: () => api.narrationManifest(artifactId),
                      /**
                       * Both halves of "make this section speakable", on demand: write the script if
                       * there is none or the one there describes copy that has since changed, then
                       * record it. Nothing is prepared ahead of time, so opening present is as fast
                       * as it ever was and the first press is the only wait.
                       *
                       * Only for someone who may edit. Recording spends the owner's credits and
                       * writes to their piece, so an invited viewer plays what is already there and
                       * never gets a button that can only answer 403.
                       */
                      ...(canEdit() && gate ? { ensure: gate.ensure } : {}),
                  }
                : undefined,
        );
        onCommentCreate((input) => createComment(input));
        onCommentReply((root, body) => replyToComment(root, body));
        onCommentResolve((id, resolved) => resolveComment(id, resolved));
        onCommentEdit((id, body) => editComment(id, body));
        onCommentDelete((id) => deleteComment(id));
        // Replay stays masked everywhere; here it stops entirely, because the section stack repaints
        // on every layout change and the recording is all noise.
        pauseReplay();
        // The session is over when the tab goes, not when a remote write happens to end an edit.
        // pagehide is the one event a closing tab still reliably delivers; the cleanup covers
        // leaving the route, and reporting is idempotent so the two together count once.
        const onPageHide = (): void => endEditorSession();
        window.addEventListener("pagehide", onPageHide);
        onCleanup(() => {
            window.removeEventListener("pagehide", onPageHide);
            endEditorSession();
            resumeReplay();
            closeComments();
            clearCommentHandlers();
            closeCollab();
            clearCollabHandlers();
            onSaveConflict(null);
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
                            {/* keeping it is a content write, so it is offered where one can land */}
                            <Show when={canEdit()}>
                                <Button
                                    variant="primary"
                                    rounded="full"
                                    size="sm"
                                    onClick={keepPreviewedTheme}
                                >
                                    Keep
                                </Button>
                            </Show>
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
