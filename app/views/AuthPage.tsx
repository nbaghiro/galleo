import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { login, signup, resetPassword } from "../stores/auth";
import { api } from "../api";
import { Visual } from "../components/previews";
import { TextField } from "@ui/inputs";
import { Button, Eyebrow } from "@ui/button";

const authField = "rounded-lg bg-panel px-3.5 py-2.5 text-[14px] placeholder:text-muted";
const oauth =
    "flex items-center justify-center gap-2 rounded-lg border border-line bg-panel py-2.5 text-[13px] font-medium text-soft cursor-not-allowed opacity-55";
const oauthEnabled =
    "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-panel py-2.5 text-[13px] font-medium text-soft transition-colors hover:border-accent hover:bg-accent/10 hover:text-ink";
const serif = "var(--font-display, 'Fraunces', serif)";

// Failure codes the OAuth callback + verify link hand back via ?authError=… (see services/api/*).
const AUTH_ERRORS: Record<string, string> = {
    oauth_state: "Sign-in was interrupted or expired. Please try again.",
    oauth_exchange: "Could not complete sign-in with that provider. Please try again.",
    oauth_email: "That account has no verified email we can sign you in with.",
    oauth_email_taken: "That email already has an account. Sign in with your original method.",
    oauth_unavailable: "That sign-in method isn’t available right now.",
    verify_invalid: "That verification link is invalid or has expired.",
};

type Mode = "signin" | "signup" | "forgot" | "reset";

const HEADING: Record<Mode, string> = {
    signin: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
};
const SUBCOPY: Record<Mode, string> = {
    signin: "Decks, docs, and sites — one canonical artifact.",
    signup: "Start with a deck, doc, or site — one canonical artifact.",
    forgot: "Enter your email and we’ll send you a reset link.",
    reset: "Set a new password for your account.",
};

export const AuthPage: Component = () => {
    const [mode, setMode] = createSignal<Mode>("signin");
    const [name, setName] = createSignal("");
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [confirm, setConfirm] = createSignal("");
    const [resetToken, setResetToken] = createSignal("");
    const [error, setError] = createSignal("");
    const [notice, setNotice] = createSignal("");
    const [sent, setSent] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    const [googleReady, setGoogleReady] = createSignal(false);
    const [microsoftReady, setMicrosoftReady] = createSignal(false);

    onMount(() => {
        // enable only the OAuth buttons whose provider is configured on the backend
        api.authProviders()
            .then((p) => {
                setGoogleReady(p.google);
                setMicrosoftReady(p.microsoft);
            })
            .catch(() => {});
        const params = new URLSearchParams(window.location.search);
        // a password-reset email links to /login?reset=<token> — open straight into the reset form
        const token = params.get("reset");
        if (token) {
            setResetToken(token);
            setMode("reset");
        }
        // a verify link lands (logged out) with ?verified=1 — confirm it, then send them to sign in
        if (params.get("verified") === "1")
            setNotice("Your email is verified — sign in to continue.");
        // an OAuth / verify failure redirects here with ?authError=<code>
        const code = params.get("authError");
        if (code) setError(AUTH_ERRORS[code] ?? "Could not sign in. Please try again.");
        if (token || code || params.has("verified"))
            window.history.replaceState({}, "", window.location.pathname);
    });

    const startOAuth = (provider: "google" | "microsoft"): void => {
        window.location.assign(`/api/auth/${provider}`);
    };

    const switchMode = (m: Mode): void => {
        setMode(m);
        setError("");
        setNotice("");
        setSent(false);
    };

    const submitLabel = (): string => {
        const m = mode();
        if (busy())
            return m === "signup"
                ? "Creating account…"
                : m === "forgot"
                  ? "Sending…"
                  : m === "reset"
                    ? "Resetting…"
                    : "Signing in…";
        return m === "signup"
            ? "Create account"
            : m === "forgot"
              ? "Send reset link"
              : m === "reset"
                ? "Reset password"
                : "Sign in";
    };

    const submit = async (e: Event): Promise<void> => {
        e.preventDefault();
        setError("");
        if (mode() === "reset" && password() !== confirm()) {
            setError("Those passwords don’t match.");
            return;
        }
        setBusy(true);
        try {
            const m = mode();
            if (m === "signup") await signup(email().trim(), password(), name().trim());
            else if (m === "signin") await login(email().trim(), password());
            else if (m === "forgot") {
                await api.forgotPassword(email().trim());
                setSent(true);
            } else if (m === "reset") {
                await resetPassword(resetToken(), password());
                // full reload so the ?reset= gate (App.tsx) clears and the fresh session boots the app
                window.location.assign("/");
                return;
            }
            // signin/signup flip the auth gate via setUser; nothing more to do here.
        } catch (err) {
            const fallback =
                mode() === "signup"
                    ? "Could not create account"
                    : mode() === "reset"
                      ? "Could not reset password"
                      : "Could not sign in";
            setError(err instanceof Error ? err.message : fallback);
        } finally {
            setBusy(false);
        }
    };

    const isCredentials = (): boolean => mode() === "signin" || mode() === "signup";

    return (
        <div class="flex h-full w-full bg-canvas text-ink">
            {/* white text reads on every theme's accent (onAccent can be dark) */}
            <div
                class="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 md:flex"
                style={{
                    background:
                        "linear-gradient(160deg, color-mix(in srgb, var(--color-accent) 42%, #0b0b11), color-mix(in srgb, var(--color-accent) 22%, #08080c))",
                }}
            >
                {/* lightened accent so the motion stays visible on the dark panel */}
                <div
                    class="pointer-events-none absolute inset-0"
                    style={{
                        "--viz-tint": "color-mix(in srgb, var(--color-accent) 58%, #ffffff)",
                        opacity: "0.58",
                    }}
                >
                    <Visual />
                </div>
                {/* rel="external" → a real navigation to the marketing build at /home (not a client route) */}
                <a
                    href="/home"
                    rel="external"
                    class="relative z-raised w-fit text-[16px] font-bold tracking-wide text-white transition-opacity hover:opacity-70"
                    style={{ "font-family": serif }}
                >
                    GALLEO
                </a>
                <div class="relative z-raised max-w-[34ch]">
                    <p
                        class="text-[clamp(28px,3vw,40px)] italic leading-[1.15] tracking-tight text-white"
                        style={{ "font-family": serif }}
                    >
                        “The bottleneck moved from making to judging.”
                    </p>
                    <p class="mt-6 text-[15.5px] leading-relaxed text-white/72">
                        Galleo is the editor for the judging. Generate a deck, document, or website
                        in seconds — then make it genuinely good. One canonical source, three
                        polished views.
                    </p>
                    <p class="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                        — the Galleo thesis
                    </p>
                </div>
            </div>

            <div class="flex flex-1 items-center justify-center p-8">
                <div class="w-[360px]">
                    <h1
                        class="text-[26px] font-semibold tracking-tight"
                        style={{ "font-family": serif }}
                    >
                        {HEADING[mode()]}
                    </h1>
                    <p class="mb-6 mt-1 text-[14px] text-muted">{SUBCOPY[mode()]}</p>

                    {/* forgot mode, after submit — a success note instead of the form (no enumeration) */}
                    <Show when={mode() === "forgot" && sent()}>
                        <div class="rounded-lg border border-line bg-panel p-4 text-[13px] leading-relaxed text-soft">
                            If an account exists for <span class="text-ink">{email().trim()}</span>,
                            we’ve sent a reset link. Check your inbox — it expires in an hour.
                        </div>
                        <p class="mt-6 text-[13px] text-muted">
                            <button
                                type="button"
                                class="font-semibold text-accent hover:underline"
                                onClick={() => switchMode("signin")}
                            >
                                Back to sign in
                            </button>
                        </p>
                    </Show>

                    <Show when={!(mode() === "forgot" && sent())}>
                        <form onSubmit={(e) => submit(e)} class="flex flex-col gap-2.5">
                            <Show when={mode() === "signup"}>
                                <Eyebrow>Name</Eyebrow>
                                <TextField
                                    type="text"
                                    autocomplete="name"
                                    placeholder="Your name"
                                    class={authField}
                                    value={name()}
                                    onChange={setName}
                                />
                            </Show>
                            <Show when={mode() !== "reset"}>
                                <Eyebrow>Email</Eyebrow>
                                <TextField
                                    type="email"
                                    autocomplete="email"
                                    placeholder="you@studio.com"
                                    class={authField}
                                    value={email()}
                                    onChange={setEmail}
                                />
                            </Show>
                            <Show when={mode() !== "forgot"}>
                                <Eyebrow class="mt-1.5">
                                    {mode() === "reset" ? "New password" : "Password"}
                                </Eyebrow>
                                <TextField
                                    type="password"
                                    autocomplete={
                                        mode() === "signin" ? "current-password" : "new-password"
                                    }
                                    placeholder="••••••••"
                                    class={authField}
                                    value={password()}
                                    onChange={setPassword}
                                />
                            </Show>
                            <Show when={mode() === "reset"}>
                                <Eyebrow class="mt-1.5">Confirm password</Eyebrow>
                                <TextField
                                    type="password"
                                    autocomplete="new-password"
                                    placeholder="••••••••"
                                    class={authField}
                                    value={confirm()}
                                    onChange={setConfirm}
                                />
                            </Show>
                            <Show when={mode() === "signin"}>
                                <button
                                    type="button"
                                    class="self-end text-[12px] text-muted hover:text-accent hover:underline"
                                    onClick={() => switchMode("forgot")}
                                >
                                    Forgot password?
                                </button>
                            </Show>
                            <Show when={error()}>
                                <p class="text-[12px] text-accent">{error()}</p>
                            </Show>
                            <Show when={notice() && !error()}>
                                <p class="text-[12px] text-soft">{notice()}</p>
                            </Show>
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={busy()}
                                class="mt-2 w-full"
                            >
                                {submitLabel()}
                            </Button>
                        </form>

                        <Show when={isCredentials()}>
                            <div class="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                <span class="h-px flex-1 bg-line" />
                                or
                                <span class="h-px flex-1 bg-line" />
                            </div>
                            <div class="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    disabled={!googleReady()}
                                    title={
                                        googleReady()
                                            ? "Continue with Google"
                                            : "Not configured yet"
                                    }
                                    onClick={() => startOAuth("google")}
                                    class={googleReady() ? oauthEnabled : oauth}
                                >
                                    Google
                                </button>
                                <button
                                    type="button"
                                    disabled={!microsoftReady()}
                                    title={
                                        microsoftReady()
                                            ? "Continue with Microsoft"
                                            : "Not configured yet"
                                    }
                                    onClick={() => startOAuth("microsoft")}
                                    class={microsoftReady() ? oauthEnabled : oauth}
                                >
                                    Microsoft
                                </button>
                            </div>
                        </Show>

                        <p class="mt-6 text-[13px] text-muted">
                            <Show when={mode() === "signin"}>
                                New here?{" "}
                                <button
                                    type="button"
                                    class="font-semibold text-accent hover:underline"
                                    onClick={() => switchMode("signup")}
                                >
                                    Create an account
                                </button>
                            </Show>
                            <Show when={mode() === "signup"}>
                                Already have an account?{" "}
                                <button
                                    type="button"
                                    class="font-semibold text-accent hover:underline"
                                    onClick={() => switchMode("signin")}
                                >
                                    Sign in
                                </button>
                            </Show>
                            <Show when={mode() === "forgot" || mode() === "reset"}>
                                <button
                                    type="button"
                                    class="font-semibold text-accent hover:underline"
                                    onClick={() => switchMode("signin")}
                                >
                                    Back to sign in
                                </button>
                            </Show>
                        </p>
                    </Show>
                </div>
            </div>
        </div>
    );
};
