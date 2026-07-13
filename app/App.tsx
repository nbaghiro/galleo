import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, onMount, Show } from "solid-js";
import { Route, Router, useLocation, useNavigate } from "@solidjs/router";
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
import { GenerateModal } from "./views/GenerateModal";
import { LibraryView } from "./views/LibraryView";
import { PresentView } from "./views/PresentView";
import { PricingView } from "./views/PricingView";
import { SharedView } from "./views/SharedView";
import { TemplatesView } from "./views/TemplatesView";
import { MediaPicker } from "./components/MediaPicker";
import { ShareModal } from "./components/ShareModal";
import { ThemeEditor } from "./views/ThemeEditor";
import { TrashView } from "./views/TrashView";
import { UiThemeProvider } from "@ui/icons";
import { CommandPalette } from "@ui/CommandPalette";
import { ShortcutsSheet } from "@ui/ShortcutsSheet";
import { installKeyDispatcher } from "@ui/keys";
import { setNavigate } from "./stores/commands"; // import also runs the app-command registrations
import { publishRoute } from "./stores/route-context";
import "@editor/commands"; // side-effect: register studio commands + editor context keys

// root layout: singular overlays mount once here (under Router); also wires the key/command system
const AppShell: Component<{ children?: JSX.Element }> = (props) => {
    const navigate = useNavigate();
    const location = useLocation();
    setNavigate((p) => navigate(p));
    onMount(() => installKeyDispatcher());
    createEffect(() => publishRoute(location.pathname));
    return (
        <>
            {props.children}
            <GenerateModal />
            <ThemeEditor />
            <MediaPicker />
            <ShareModal />
            <ChatPanel />
            <CommandPalette />
            <ShortcutsSheet />
        </>
    );
};

// product SPA under /app; auth gate then the routed app (Router base="/app")
export const App: Component = () => {
    onMount(() => {
        // cookie-gated, so fire in parallel with the session restore (don't wait for /me)
        void bootstrap();
        void loadCustomThemes();
        void loadFeatures();
    });

    // sync favicon to the active theme; touch customThemes() so it re-resolves when they load
    createEffect(() => {
        customThemes();
        // live theme-editor draft wins, so the tab badge previews it too
        setFavicon(appThemeOverride() ?? resolveTheme(faviconOverride() ?? appTheme()).tokens);
    });
    // recompute when app theme or custom themes change
    const themeVars = createMemo((): JSX.CSSProperties => {
        customThemes();
        return appThemeVars();
    });
    // app-chrome tokens for @ui icon context (draft override when the theme editor is open)
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
                            <Route path="/shared" component={SharedView} />
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
