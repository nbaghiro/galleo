import type { ArtifactContent } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js";
import { useParams, useSearchParams } from "@solidjs/router";
import { registerThemes, resolveTheme, themeCssVars } from "@themes";
import { PresentSurface } from "@ui/present";
import { UiThemeProvider } from "@ui/icons";
import { api, type PublicContent } from "../app/api";
import { setFavicon } from "../app/stores/theme";

const Surface: Component<{ artifact: ArtifactContent; branded: boolean }> = (props) => {
    const tokens = createMemo(() => resolveTheme(props.artifact.theme).tokens);
    return (
        <UiThemeProvider tokens={tokens}>
            <PresentSurface artifact={props.artifact} z={0}>
                <Show when={props.branded}>
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

const Panel: Component<{ children: JSX.Element }> = (props) => (
    <div class="grid min-h-screen place-items-center bg-[#0a0a0c] px-6 text-center text-white">
        <div class="w-full max-w-[360px]">{props.children}</div>
    </div>
);

const viewLabel = (format?: string): string =>
    format === "deck"
        ? "View deck"
        : format === "web"
          ? "View site"
          : format === "doc"
            ? "View document"
            : "View artifact";

export const PublicView: Component = () => {
    const params = useParams();
    const [search] = useSearchParams();
    const [state, setState] = createSignal<"loading" | "ok" | "password" | "notfound" | "error">(
        "loading",
    );
    const [content, setContent] = createSignal<PublicContent | null>(null);
    const [pw, setPw] = createSignal("");
    const [gateMsg, setGateMsg] = createSignal("");
    const [pwTheme, setPwTheme] = createSignal("studio");
    const [pwFormat, setPwFormat] = createSignal<string | undefined>();
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
            if (res.ok) {
                if (res.content.customTheme) registerThemes([res.content.customTheme]);
                setContent(res.content);
                setState("ok");
            } else if (res.status === 401 || res.status === 429) {
                if (res.customTheme) registerThemes([res.customTheme]);
                if (res.theme) setPwTheme(res.theme);
                setPwFormat(res.format);
                setGateMsg(
                    res.status === 429
                        ? "Too many attempts — try again in a few minutes."
                        : password
                          ? "Incorrect password."
                          : "",
                );
                setState("password");
            } else if (res.status === 404) {
                setState("notfound");
            } else {
                setState("error");
            }
        } catch {
            setState("error");
        }
        setBusy(false);
    };

    onMount(() => void load());
    createEffect(() => {
        const c = content();
        if (!c) return;
        document.title = c.title;
        // custom theme (if any) is registered in load() first
        setFavicon(resolveTheme(c.content.theme).tokens);
    });

    const submitPassword = (e: Event): void => {
        e.preventDefault();
        setGateMsg("");
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
                    <div
                        style={themeCssVars(resolveTheme(pwTheme()).tokens)}
                        class="grid min-h-screen place-items-center bg-canvas px-6 text-center font-body text-ink"
                    >
                        <div class="w-full max-w-[360px]">
                            <div class="mb-1.5 font-display text-[18px] font-semibold text-ink">
                                Password required
                            </div>
                            <p class="mb-4 text-[13px] text-muted">
                                This document is protected. Enter its password to view it.
                            </p>
                            <form onSubmit={submitPassword}>
                                <input
                                    type="password"
                                    autofocus
                                    class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-[14px] text-ink outline-none placeholder:text-muted focus:border-accent"
                                    placeholder="Password"
                                    value={pw()}
                                    onInput={(e) => setPw(e.currentTarget.value)}
                                />
                                <Show when={gateMsg()}>
                                    <p class="mt-2 text-[12px] text-red-500">{gateMsg()}</p>
                                </Show>
                                <button
                                    type="submit"
                                    disabled={busy() || !pw()}
                                    class="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-[14px] font-semibold text-onaccent transition-opacity hover:opacity-90 disabled:opacity-50"
                                >
                                    {busy() ? "Checking…" : viewLabel(pwFormat())}
                                </button>
                            </form>
                        </div>
                    </div>
                </Show>
            }
        >
            {(c) => <Surface artifact={c().content} branded={c().branded} />}
        </Show>
    );
};
