import type { Component, JSX } from "solid-js";
import { onMount, Show } from "solid-js";
import { resolveTheme } from "@themes/library";
import { themeCssVars } from "@themes/theme";
import { authReady, bootstrap, user } from "./auth";
import { AuthPage } from "./AuthPage";
import { EditorView } from "./EditorView";

// App frame: restore the session, then route to the auth page or the editor. The chrome uses a
// default theme via the shared themeCssVars; the studio overrides per-artifact within its own root.
export const App: Component = () => {
    onMount(() => void bootstrap());
    const vars = themeCssVars(resolveTheme("studio").tokens) as JSX.CSSProperties;

    return (
        <div class="h-screen w-screen overflow-hidden bg-canvas text-ink" style={vars}>
            <Show
                when={authReady()}
                fallback={<div class="flex h-full items-center justify-center text-[13px] text-muted">Loading…</div>}
            >
                <Show when={user()} fallback={<AuthPage />}>
                    <EditorView />
                </Show>
            </Show>
        </div>
    );
};
