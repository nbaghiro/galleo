import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { login } from "./auth";

const field =
    "w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted focus:border-accent";
const oauth =
    "flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-[13px] font-medium text-muted";

export const AuthPage: Component = () => {
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [error, setError] = createSignal("");
    const [busy, setBusy] = createSignal(false);

    const submit = async (e: Event): Promise<void> => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            await login(email().trim(), password());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not sign in");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div class="flex h-full w-full items-center justify-center bg-canvas px-4 text-ink">
            <div class="w-[380px] rounded-2xl border border-line bg-panel p-8 shadow-xl">
                <div class="mb-1.5 font-mono text-[15px] font-bold tracking-wide text-accent">GALLEO</div>
                <h1 class="mb-1 text-[22px] font-semibold">Sign in</h1>
                <p class="mb-6 text-[13px] text-muted">Decks, docs, and sites — one canonical artifact.</p>

                <form onSubmit={(e) => void submit(e)} class="flex flex-col gap-2.5">
                    <input
                        type="email"
                        autocomplete="email"
                        placeholder="Email"
                        class={field}
                        value={email()}
                        onInput={(e) => setEmail(e.currentTarget.value)}
                    />
                    <input
                        type="password"
                        autocomplete="current-password"
                        placeholder="Password"
                        class={field}
                        value={password()}
                        onInput={(e) => setPassword(e.currentTarget.value)}
                    />
                    <Show when={error()}>
                        <p class="text-[12px] text-accent">{error()}</p>
                    </Show>
                    <button
                        type="submit"
                        disabled={busy()}
                        class="mt-1 w-full rounded-lg bg-accent px-3 py-2.5 text-[14px] font-semibold text-onaccent disabled:opacity-60"
                    >
                        {busy() ? "Signing in…" : "Sign in"}
                    </button>
                </form>

                <div class="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted">
                    <span class="h-px flex-1 bg-line" />
                    or
                    <span class="h-px flex-1 bg-line" />
                </div>

                <div class="flex flex-col gap-2">
                    <button type="button" disabled title="Coming soon" class={`${oauth} cursor-not-allowed opacity-55`}>
                        Continue with Google
                    </button>
                    <button type="button" disabled title="Coming soon" class={`${oauth} cursor-not-allowed opacity-55`}>
                        Continue with Microsoft
                    </button>
                </div>
            </div>
        </div>
    );
};
