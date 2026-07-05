import type { Theme } from "@themes/theme";
import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";
import { useLocation } from "@solidjs/router";
import { setArtifactTheme } from "@elements/ops";
import { resolveTheme, THEME_LIST } from "@themes/library";
import { commit, editor, endThemePreview } from "@editor/editor";
import {
    customThemes,
    removeCustomTheme,
    saveCustomTheme,
    type ThemeDraft,
    updateCustomTheme,
} from "../theme/custom-themes";
import { CloseIcon, EditIcon, PlusIcon } from "../components/icons";
import { SectionThumb } from "../components/previews";
import {
    appTheme,
    setAppTheme,
    editorThemeCssVars,
    closeThemeDrawer,
    themeDrawerOpen,
    THEME_SAMPLE,
} from "../theme/theme";
import { ThemeBuilder } from "../theme/ThemeBuilder";

const CARD_W = 166; // fixed so the engine preview fills the card exactly (2 per row fit any scrollbar)

// The singular theme switcher. Mounted once at the app root; opened from any app-level trigger. It
// applies context-aware — to the open artifact while editing, otherwise to the app-chrome theme — and
// hosts custom-theme create/edit (persisted to the workspace) inline.
export const ThemeDrawer: Component = () => {
    const location = useLocation();
    // pathname carries the router base ("/app/edit/:id"), so match the segment anywhere, not the start.
    const inEditor = (): boolean => location.pathname.includes("/edit/");
    const currentId = (): string => (inEditor() ? editor.artifact.theme : appTheme());
    const apply = (id: string): void => {
        if (inEditor()) {
            endThemePreview(); // an explicit pick wins over any in-flight "open in app theme" preview
            commit(setArtifactTheme(editor.artifact, id));
        } else setAppTheme(id);
    };

    const [mode, setMode] = createSignal<"browse" | "build">("browse");
    const [editing, setEditing] = createSignal<Theme | null>(null);
    const [busy, setBusy] = createSignal(false);

    // Over the editor, adopt the artifact theme so the drawer matches the studio it floats over —
    // snapshotted on open (untracked) so it doesn't restyle while you browse/preview themes.
    const [themeVars, setThemeVars] = createSignal<JSX.CSSProperties>();
    createEffect(() => {
        if (themeDrawerOpen())
            setThemeVars(untrack(() => (inEditor() ? editorThemeCssVars() : undefined)));
    });

    // always reopen on the browse list
    createEffect(() => {
        if (!themeDrawerOpen()) {
            setMode("browse");
            setEditing(null);
        }
    });

    const startNew = (): void => {
        setEditing(null);
        setMode("build");
    };
    const startEdit = (t: Theme): void => {
        setEditing(t);
        setMode("build");
    };
    const onSave = async (draft: ThemeDraft): Promise<void> => {
        setBusy(true);
        const ed = editing();
        const saved = ed ? await updateCustomTheme(ed.id, draft) : await saveCustomTheme(draft);
        setBusy(false);
        if (saved) {
            apply(saved.id);
            setMode("browse");
            setEditing(null);
        }
    };

    const card = (t: Theme, custom: boolean): JSX.Element => (
        <div class="group" style={{ width: `${CARD_W}px` }}>
            <SectionThumb
                section={THEME_SAMPLE}
                themeId={t.id}
                formatId="deck"
                width={CARD_W}
                selected={currentId() === t.id}
                onOpen={() => apply(t.id)}
            />
            <div class="mt-1.5 flex items-center gap-1.5">
                <span
                    class="h-3 w-3 flex-none rounded"
                    style={{ background: resolveTheme(t.id).tokens.accent }}
                />
                <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                    {t.name}
                </span>
                <Show when={custom}>
                    <span class="hidden items-center gap-0.5 group-hover:flex">
                        <button
                            class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
                            title="Edit theme"
                            onClick={() => startEdit(t)}
                        >
                            <EditIcon size={13} />
                        </button>
                        <button
                            class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
                            title="Delete theme"
                            onClick={() => removeCustomTheme(t.id)}
                        >
                            <CloseIcon size={13} />
                        </button>
                    </span>
                </Show>
            </div>
        </div>
    );

    return (
        <Show when={themeDrawerOpen()}>
            <div class="fixed inset-0 z-40 bg-black/30" onClick={() => closeThemeDrawer()} />
            <aside
                class="theme-drawer-enter fixed right-0 top-0 z-50 flex h-full w-[392px] flex-col border-l border-line bg-panel text-ink shadow-2xl"
                style={themeVars()}
            >
                <header class="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
                    <div class="min-w-0 flex-1">
                        <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                            {inEditor() ? "This artifact" : "App theme"}
                        </div>
                        <div class="truncate text-[14px] font-semibold text-ink">
                            {mode() === "build"
                                ? editing()
                                    ? "Edit theme"
                                    : "New theme"
                                : resolveTheme(currentId()).name}
                        </div>
                    </div>
                    <button
                        class="grid h-7 w-7 flex-none place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                        title="Close"
                        onClick={() => closeThemeDrawer()}
                    >
                        <CloseIcon size={15} />
                    </button>
                </header>

                <Show
                    when={mode() === "browse"}
                    fallback={
                        <ThemeBuilder
                            base={resolveTheme(currentId())}
                            edit={editing() ?? undefined}
                            busy={busy()}
                            onSave={onSave}
                            onCancel={() => setMode("browse")}
                        />
                    }
                >
                    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                My themes
                            </span>
                            <Show when={customThemes().length}>
                                <span class="font-mono text-[9px] text-accent">synced</span>
                            </Show>
                        </div>
                        <div class="flex flex-wrap gap-3">
                            <button
                                class="flex aspect-[16/9] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted hover:border-accent hover:text-accent"
                                style={{ width: `${CARD_W}px` }}
                                onClick={startNew}
                            >
                                <PlusIcon size={16} />
                                <span class="text-[11.5px] font-medium">New theme</span>
                            </button>
                            <For each={customThemes()}>{(t) => card(t, true)}</For>
                        </div>

                        <div class="mb-2 mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                            Built-in
                        </div>
                        <div class="flex flex-wrap gap-3">
                            <For each={THEME_LIST}>{(t) => card(t, false)}</For>
                        </div>

                        <p class="mt-4 text-[11px] leading-relaxed text-muted">
                            Custom themes are saved to your workspace and appear in the picker
                            everywhere — exactly like a built-in.
                        </p>
                    </div>
                </Show>
            </aside>
        </Show>
    );
};
