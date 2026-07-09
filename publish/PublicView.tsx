import type { ArtifactContent } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js";
import { useParams, useSearchParams } from "@solidjs/router";
import { registerThemes, resolveTheme } from "@themes";
import { PresentSurface } from "@ui/present";
import { UiThemeProvider } from "@ui/icons";
import { api, ApiError, type PublicContent } from "../app/api";
import { setFavicon } from "../app/theme";

// The public, UNAUTHENTICATED viewer — a chrome-free read-only render of a published artifact, served at
// /p/:slug (its own tiny build, no auth/editor/app code). It paints through the same @canvas backends as
// the in-app present surface, but resolves its content from the public share endpoint and enforces the
// share's access policy (a protected link prompts for a password; a private link carries a ?k= token).

// The public paint surface: the shared @ui present surface (z-0 so it sits under the neutral state
// panels), plus its own @ui theme provider (standalone build) and the free-tier branding watermark.
const Surface: Component<{ artifact: ArtifactContent; branded: boolean }> = (props) => {
    const tokens = createMemo(() => resolveTheme(props.artifact.theme).tokens);
    return (
        <UiThemeProvider tokens={tokens}>
            <PresentSurface artifact={props.artifact} z={0}>
                <Show when={props.branded}>
                    {/* Free-tier watermark — mirrors the export path's "Made with Galleo" mark. */}
                    <a
                        href="https://galleo.app"
                        target="_blank"
                        rel="noopener"
                        class="fixed bottom-4 right-4 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/90 no-underline backdrop-blur-sm transition-opacity hover:opacity-80"
                    >
                        Made with Galleo
                    </a>
                </Show>
            </PresentSurface>
        </UiThemeProvider>
    );
};

// A centered neutral message panel for the load / password / error states (independent of any theme).
const Panel: Component<{ children: JSX.Element }> = (props) => (
    <div class="grid min-h-screen place-items-center bg-[#0a0a0c] px-6 text-center text-white">
        <div class="w-full max-w-[360px]">{props.children}</div>
    </div>
);

export const PublicView: Component = () => {
    const params = useParams();
    const [search] = useSearchParams();
    const [state, setState] = createSignal<"loading" | "ok" | "password" | "notfound" | "error">(
        "loading",
    );
    const [content, setContent] = createSignal<PublicContent | null>(null);
    const [pw, setPw] = createSignal("");
    const [pwError, setPwError] = createSignal(false);
    const [busy, setBusy] = createSignal(false);

    const token = (): string | undefined => (typeof search.k === "string" ? search.k : undefined);

    const load = async (password?: string): Promise<void> => {
        if (!params.slug) {
            setState("notfound");
            return;
        }
        setBusy(true);
        try {
            const res = await api.getPublicContent(params.slug, { k: token(), pw: password });
            if (res.customTheme) registerThemes([res.customTheme]);
            setContent(res);
            setState("ok");
        } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
                setState("password");
                if (password) setPwError(true);
            } else if (e instanceof ApiError && e.status === 404) {
                setState("notfound");
            } else {
                setState("error");
            }
        }
        setBusy(false);
    };

    onMount(() => void load());
    createEffect(() => {
        const c = content();
        if (!c) return;
        document.title = c.title;
        // Theme-aware tab badge — the "G" mark in the published artifact's own theme, matching how the
        // app + website builds set their favicon. The custom theme (if any) is registered in load() first.
        setFavicon(resolveTheme(c.content.theme).tokens);
    });

    const submitPassword = (e: Event): void => {
        e.preventDefault();
        setPwError(false);
        void load(pw());
    };

    return (
        <Show
            when={state() === "ok" && content()}
            fallback={
                <Show
                    when={state() === "password"}
                    fallback={
                        <Panel>
                            <Show
                                when={state() === "loading"}
                                fallback={
                                    <>
                                        <div class="mb-1.5 text-[16px] font-semibold">
                                            {state() === "notfound"
                                                ? "This link isn’t available"
                                                : "Something went wrong"}
                                        </div>
                                        <p class="text-[13px] text-white/60">
                                            {state() === "notfound"
                                                ? "The link may have been unpublished, or the address is incorrect."
                                                : "Please try again in a moment."}
                                        </p>
                                    </>
                                }
                            >
                                <div class="text-[13px] text-white/60">Loading…</div>
                            </Show>
                        </Panel>
                    }
                >
                    <Panel>
                        <div class="mb-1.5 text-[16px] font-semibold">Password required</div>
                        <p class="mb-4 text-[13px] text-white/60">
                            This document is protected. Enter its password to view it.
                        </p>
                        <form onSubmit={submitPassword}>
                            <input
                                type="password"
                                autofocus
                                class="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-white/40"
                                placeholder="Password"
                                value={pw()}
                                onInput={(e) => setPw(e.currentTarget.value)}
                            />
                            <Show when={pwError()}>
                                <p class="mt-2 text-[12px] text-red-400">Incorrect password.</p>
                            </Show>
                            <button
                                type="submit"
                                disabled={busy() || !pw()}
                                class="mt-3 w-full rounded-lg bg-white px-4 py-2 text-[14px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                {busy() ? "Checking…" : "View document"}
                            </button>
                        </form>
                    </Panel>
                </Show>
            }
        >
            {(c) => <Surface artifact={c().content} branded={c().branded} />}
        </Show>
    );
};
