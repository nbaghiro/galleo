import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, on, onMount, Show } from "solid-js";
import { Navigate, Route, Router, useLocation, useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { mustConfirmEmail } from "@model/workspace";
import { authReady, bootstrap, user } from "./stores/auth";
import { loadFeatures } from "./stores/features";
import { checklistVisible, loadOnboarding, onboardingNeeded } from "@app/stores/onboarding";
import { customThemes, loadCustomThemes } from "./stores/theme";
import { faviconOverride, appTheme, appThemeOverride, appThemeVars } from "./stores/theme";
import { setFavicon } from "@ui/brand";
import { AuthPage } from "./views/AuthPage";
import { EditorView } from "./views/EditorView";
import { ChatPanel } from "./views/ChatPanel";
import { GenerateStudio } from "./views/generate/Mission";
import { LibraryView } from "./views/LibraryView";
import { OnboardingView } from "@app/views/OnboardingView";
import { PresentView } from "./views/PresentView";
import { PricingView } from "./views/PricingView";
import { CreditActivityView } from "./views/CreditActivityView";
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
import { AccountSettingsView } from "./views/AccountSettingsView";
import { EvalView } from "./views/EvalView";
import { InviteView } from "./views/InviteView";
import { CollabInviteView } from "./views/CollabInviteView";
import { UiThemeProvider } from "@ui/icons";
import { Spinner } from "@ui/button";
import { CommandPalette } from "@ui/CommandPalette";
import { ShortcutsSheet } from "@ui/ShortcutsSheet";
import { installKeyDispatcher } from "@ui/keys";
import { setNavigate } from "./stores/navigate";
import "./stores/palette"; // side-effect: register the app commands + the ⌘K sources
import { publishRoute } from "./stores/route-context";
import "@editor/core/commands"; // side-effect: register studio commands + editor context keys

// singular overlays mount once here, under the Router
// The verification gate's date, shared by the redirect and the boot reads it would otherwise 403 on.
const unconfirmed = (): boolean => {
    const u = user();
    return !!u && mustConfirmEmail(u);
};

const AppShell: Component<{ children?: JSX.Element }> = (props) => {
    const navigate = useNavigate();
    const location = useLocation();
    setNavigate((p) => navigate(p));
    onMount(() => installKeyDispatcher());
    createEffect(() => publishRoute(location.pathname));
    // A first session starts on the format question. Only from the library, so a deep link into an
    // artifact or an invite still lands where it was pointed, and `needed` is server-derived, so an
    // account with any content never sees it.
    createEffect(() => {
        if (onboardingNeeded() && location.pathname === "/")
            navigate("/welcome", { replace: true });
    });
    // so the address bar names the screen rather than the route that was refused
    createEffect(() => {
        if (unconfirmed() && location.pathname !== "/welcome")
            navigate("/welcome", { replace: true });
    });
    // The steps are derived, so the only way to notice one landed is to re-read, and a navigation is
    // when that has usually just happened. `on` so the route is the only dependency: the body both
    // reads and writes the onboarding signal, which as a plain effect would be a cycle.
    createEffect(
        on(
            () => location.pathname,
            () => {
                if (checklistVisible()) void loadOnboarding();
            },
        ),
    );
    // An unconfirmed account gets the confirm step in place of whatever the URL asked for, and none
    // of the chrome: the studio, the pickers and the panels all read workspace routes the gate
    // refuses, and a read rejecting on mount is an unhandled error rather than an empty state.
    return (
        <Show when={!unconfirmed()} fallback={<OnboardingView />}>
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
        </Show>
    );
};

// A signed-out visit to /oauth/authorize is bounced here to sign in; this carries them back once
// they have. Same-origin and path-shaped only, so `next` can never become an open redirect.
const ResumeExternalAuth: Component = () => {
    onMount(() => {
        const next = new URLSearchParams(window.location.search).get("next");
        if (next?.startsWith("/oauth/")) window.location.replace(next);
    });
    return null;
};

export const App: Component = () => {
    onMount(() => {
        // only the session probe fires before auth is known — the cookie-gated stores load in the
        // per-user effect below, so a signed-out visit doesn't spray 401s across the console
        void bootstrap();
    });

    // per user, not per boot: covers the session restore, a fresh login, and an OAuth landing —
    // and re-fetches after a user switch, so feature-gated affordances never stay stale
    let loadedFor: string | null = null;
    createEffect(() => {
        const u = user();
        const id = u?.id ?? null;
        if (!id || id === loadedFor) return;
        // An unconfirmed session is refused by every guarded route, so asking would only produce a
        // row of 403s in the console. The confirm step needs none of it.
        if (unconfirmed()) return;
        loadedFor = id;
        void loadFeatures();
        void loadCustomThemes();
        void loadOnboarding();
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
                        <ResumeExternalAuth />
                        <Router base="/" root={AppShell}>
                            {/* where /oauth/authorize parks a signed-out visitor; declared so the
                                catch-all below cannot navigate away before the resume runs */}
                            <Route path="/connect" component={() => null} />
                            <Route path="/welcome" component={OnboardingView} />
                            <Route path="/" component={LibraryView} />
                            <Route path="/folder/:id" component={LibraryView} />
                            <Route path="/templates" component={TemplatesView} />
                            <Route path="/shared" component={SharedView} />
                            <Route path="/trash" component={TrashView} />
                            <Route path="/pricing" component={PricingView} />
                            {/* the full credit ledger; /pricing keeps a short preview of it */}
                            <Route path="/pricing/activity" component={CreditActivityView} />
                            {/* the tab rides in the path so a settings page is linkable */}
                            <Route path="/settings/:tab?" component={WorkspaceSettingsView} />
                            <Route path="/account/:tab?" component={AccountSettingsView} />
                            <Route path="/eval" component={EvalView} />
                            {/* a run is linkable: the detail page is a route, not a signal */}
                            <Route path="/eval/:id" component={EvalView} />
                            <Route path="/invite/:token" component={InviteView} />
                            <Route path="/collab/:token" component={CollabInviteView} />
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
