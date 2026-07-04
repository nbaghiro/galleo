import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, onMount, Show } from "solid-js";
import { Route, Router } from "@solidjs/router";
import { resolveTheme } from "@themes/library";
import { authReady, bootstrap, user } from "./data/auth";
import { customThemes, loadCustomThemes } from "./theme/custom-themes";
import { faviconOverride, setFavicon, appTheme, appThemeVars } from "./theme/theme";
import { AuthPage } from "./views/AuthPage";
import { EditorView } from "./views/EditorView";
import { BuildView } from "./generate/BuildView";
import { IntakeView } from "./generate/IntakeView";
import { LibraryView } from "./views/LibraryView";
import { TemplatesView } from "./views/TemplatesView";
import { ThemeDrawer } from "./theme/ThemeDrawer";
import { TrashView } from "./views/TrashView";

// Router root layout — wraps every route so the singular theme drawer is mounted once (inside router
// context, so it can read the active route to apply context-aware) and persists across navigation.
const AppShell: Component<{ children?: JSX.Element }> = (props) => (
    <>
        {props.children}
        <ThemeDrawer />
    </>
);

// The product SPA — served under /app (the public marketing site is a separate build at /). Auth gate:
// restore the session + apply the app theme, then either sign-in or the routed app. The Router carries
// base="/app" so all in-app links/routes resolve under /app/*.
export const App: Component = () => {
    onMount(() => bootstrap().then(() => loadCustomThemes()));

    // keep the browser-tab favicon in sync with the active theme (editor's artifact theme while editing,
    // otherwise the app-chrome theme). Touch customThemes() so it re-resolves once custom themes load
    // (the app-chrome theme can itself be a custom one, registered asynchronously).
    createEffect(() => {
        customThemes();
        setFavicon(resolveTheme(faviconOverride() ?? appTheme()).tokens);
    });
    // CSS vars for the app root — recompute when the app theme OR the loaded custom themes change.
    const themeVars = createMemo((): JSX.CSSProperties => {
        customThemes();
        return appThemeVars();
    });

    return (
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
                        <Route path="/new" component={IntakeView} />
                        <Route path="/generate" component={BuildView} />
                        <Route path="/edit/:id" component={EditorView} />
                    </Router>
                </Show>
            </Show>
        </div>
    );
};
