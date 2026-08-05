import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, onMount, Show } from "solid-js";
import { Navigate, Route, Router, useLocation, useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { authReady, bootstrap, user } from "./stores/auth";
import { loadFeatures } from "./stores/features";
import { customThemes, loadCustomThemes } from "./stores/theme";
import {
    faviconOverride,
    setFavicon,
    appTheme,
    appThemeOverride,
    appThemeVars,
} from "./stores/theme";
import { AuthPage } from "./views/AuthPage";
import { EditorView } from "./views/EditorView";
import { ChatPanel } from "./views/ChatPanel";
import { GenerateStudio } from "./views/generate/Mission";
import { LibraryView } from "./views/LibraryView";
import { PresentView } from "./views/PresentView";
import { PricingView } from "./views/PricingView";
import { SharedView } from "./views/SharedView";
import { TemplatesView } from "./views/TemplatesView";
import { MediaPicker } from "./components/MediaPicker";
import { VerifyBanner } from "./components/VerifyBanner";
import { ShareModal } from "./components/ShareModal";
import { ModelPickerModal } from "./components/ModelPicker";
import { ErrorModal } from "./components/ErrorModal";
import { ThemeEditor } from "./views/ThemeEditor";
import { TrashView } from "./views/TrashView";
import { WorkspaceSettingsView } from "./views/WorkspaceSettingsView";
import { InviteView } from "./views/InviteView";
import { UiThemeProvider } from "@ui/icons";
import { Spinner } from "@ui/button";
import { CommandPalette } from "@ui/CommandPalette";
import { ShortcutsSheet } from "@ui/ShortcutsSheet";
import { installKeyDispatcher } from "@ui/keys";
import { setNavigate } from "./stores/navigate";
import "./stores/commands"; // side-effect: register the app commands
import "./components/palette-sources"; // side-effect: register the ⌘K artifact + action sources
import { publishRoute } from "./stores/route-context";
import "@editor/core/commands"; // side-effect: register studio commands + editor context keys

// singular overlays mount once here, under the Router
const AppShell: Component<{ children?: JSX.Element }> = (props) => {
    const navigate = useNavigate();
    const location = useLocation();
    setNavigate((p) => navigate(p));
    onMount(() => installKeyDispatcher());
    createEffect(() => publishRoute(location.pathname));
    return (
        <>
            {props.children}
            <GenerateStudio />
            {/* picking an app theme is a preference, so it mounts everywhere; authoring modes gate inside */}
            <ThemeEditor />
            <MediaPicker />
            <ShareModal />
            <ModelPickerModal />
            <ErrorModal />
            <ChatPanel />
            <CommandPalette />
            <ShortcutsSheet />
            <VerifyBanner />
        </>
    );
};

export const App: Component = () => {
    onMount(() => {
        // cookie-gated, so fire in parallel with the session restore (don't wait for /me)
        void bootstrap();
        void loadCustomThemes();
        void loadFeatures();
    });

    // That parallel fetch 401s when the cookie is stale or absent, and nothing outside the editor
    // retried it, leaving every feature-gated affordance hidden for the session. Re-fetch per user.
    let featuresFor: string | null = null;
    createEffect(() => {
        const id = user()?.id ?? null;
        if (!id || id === featuresFor) return;
        featuresFor = id;
        void loadFeatures();
    });

    // customThemes() is read so the favicon re-resolves once they load
    createEffect(() => {
        customThemes();
        // live theme-editor draft wins, so the tab badge previews it too
        setFavicon(appThemeOverride() ?? resolveTheme(faviconOverride() ?? appTheme()).tokens);
    });
    const themeVars = createMemo((): JSX.CSSProperties => {
        customThemes();
        return appThemeVars();
    });
    // app-chrome tokens for the @ui icon context; the theme-editor draft overrides
    const appTokens = createMemo(() => {
        customThemes();
        return appThemeOverride() ?? resolveTheme(appTheme()).tokens;
    });

    // ?reset=… must reach the auth screen even with a live session, to set a password without logging out
    const isResetDeepLink = new URLSearchParams(window.location.search).has("reset");

    return (
        <UiThemeProvider tokens={appTokens}>
            <div
                class="h-dvh w-full overflow-hidden bg-canvas font-body text-ink"
                style={themeVars()}
            >
                <Show
                    when={authReady()}
                    fallback={
                        <div class="flex h-full items-center justify-center">
                            <Spinner size={28} />
                        </div>
                    }
                >
                    <Show when={user() && !isResetDeepLink} fallback={<AuthPage />}>
                        <Router base="/" root={AppShell}>
                            <Route path="/" component={LibraryView} />
                            <Route path="/folder/:id" component={LibraryView} />
                            <Route path="/templates" component={TemplatesView} />
                            <Route path="/shared" component={SharedView} />
                            <Route path="/trash" component={TrashView} />
                            <Route path="/pricing" component={PricingView} />
                            <Route path="/settings" component={WorkspaceSettingsView} />
                            <Route path="/invite/:token" component={InviteView} />
                            <Route path="/edit/:id" component={EditorView} />
                            <Route path="/present/:id" component={PresentView} />
                            {/* /login and unknowns: when already authed, land on the library */}
                            <Route path="*" component={() => <Navigate href="/" />} />
                        </Router>
                    </Show>
                </Show>
            </div>
        </UiThemeProvider>
    );
};
