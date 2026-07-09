import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, onMount, Show } from "solid-js";
import { Route, Router } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { authReady, bootstrap, user } from "./stores/auth";
import { loadFeatures } from "./stores/features";
import { customThemes, loadCustomThemes } from "./theme";
import { faviconOverride, setFavicon, appTheme, appThemeOverride, appThemeVars } from "./theme";
import { AuthPage } from "./views/AuthPage";
import { EditorView } from "./views/EditorView";
import { ChatPanel } from "./views/chat/ChatPanel";
import { GenerateModal } from "./views/generate/GenerateModal";
import { LibraryView } from "./views/LibraryView";
import { PresentView } from "./views/PresentView";
import { PricingView } from "./views/PricingView";
import { TemplatesView } from "./views/TemplatesView";
import { MediaPicker } from "./components/MediaPicker";
import { ShareModal } from "./components/ShareModal";
import { ThemeEditor } from "./views/ThemeEditor";
import { TrashView } from "./views/TrashView";
import { UiThemeProvider } from "@ui/icons";

// Router root layout — wraps every route so the singular theme drawer + media picker are mounted once
// (inside router context, so they read the active route to apply context-aware) and persist across nav.
const AppShell: Component<{ children?: JSX.Element }> = (props) => (
    <>
        {props.children}
        <GenerateModal />
        <ThemeEditor />
        <MediaPicker />
        <ShareModal />
        <ChatPanel />
    </>
);

// The product SPA — served under /app (the public website is a separate build at /). Auth gate:
// restore the session + apply the app theme, then either sign-in or the routed app. The Router carries
// base="/app" so all in-app links/routes resolve under /app/*.
export const App: Component = () => {
    onMount(() => {
        // Custom themes + features gate only on the session cookie (already present on a reload), so kick
        // them off in parallel with the session restore instead of waiting for /me — the custom-theme cache
        // covers first paint, and these refresh it as early as possible.
        void bootstrap();
        void loadCustomThemes();
        void loadFeatures();
    });

    // keep the browser-tab favicon in sync with the active theme (editor's artifact theme while editing,
    // otherwise the app-chrome theme). Touch customThemes() so it re-resolves once custom themes load
    // (the app-chrome theme can itself be a custom one, registered asynchronously).
    createEffect(() => {
        customThemes();
        // the live theme-editor draft (if open) wins, so the tab badge previews the draft too
        setFavicon(appThemeOverride() ?? resolveTheme(faviconOverride() ?? appTheme()).tokens);
    });
    // CSS vars for the app root — recompute when the app theme OR the loaded custom themes change.
    const themeVars = createMemo((): JSX.CSSProperties => {
        customThemes();
        return appThemeVars();
    });
    // Icon stroke weight/cap track the active theme via the @ui theme context (the editor provides its own
    // artifact tokens; here the app-chrome theme, previewing the live theme-editor draft when one is open).
    const appTokens = createMemo(() => {
        customThemes();
        return appThemeOverride() ?? resolveTheme(appTheme()).tokens;
    });

    return (
        <UiThemeProvider tokens={appTokens}>
            <div
                class="h-screen w-screen overflow-hidden bg-canvas font-body text-ink"
                style={themeVars()}
            >
                <Show
                    when={authReady()}
                    fallback={
                        <div class="flex h-full items-center justify-center text-[13px] text-muted">
                            Loading…
                        </div>
                    }
                >
                    <Show when={user()} fallback={<AuthPage />}>
                        <Router base="/app" root={AppShell}>
                            <Route path="/" component={LibraryView} />
                            <Route path="/folder/:id" component={LibraryView} />
                            <Route path="/templates" component={TemplatesView} />
                            <Route path="/trash" component={TrashView} />
                            <Route path="/pricing" component={PricingView} />
                            <Route path="/edit/:id" component={EditorView} />
                            <Route path="/present/:id" component={PresentView} />
                        </Router>
                    </Show>
                </Show>
            </div>
        </UiThemeProvider>
    );
};
