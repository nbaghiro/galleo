import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { login } from "../stores/auth";
import { Visual } from "../components/previews";
import { TextField } from "@ui/inputs";
import { Button, Eyebrow } from "@ui/button";

// Auth fields are visually larger than the studio default (rounded-lg, raised bg-panel, bigger pad,
// 14px, muted placeholder) — pass those as a class on TextField's base input style.
const authField = "rounded-lg bg-panel px-3.5 py-2.5 text-[14px] placeholder:text-muted";
const oauth =
    "flex items-center justify-center gap-2 rounded-lg border border-line bg-panel py-2.5 text-[13px] font-medium text-soft cursor-not-allowed opacity-55";
const serif = "var(--font-display, 'Fraunces', serif)";

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
        <div class="flex h-full w-full bg-canvas text-ink">
            {/* left — a dark, accent-tinted feature panel. White text reads top-to-bottom on every theme
                (the old light→dark accent gradient hid dark onAccent text on e.g. Couture's gold). */}
            <div
                class="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 md:flex"
                style={{
                    background:
                        "linear-gradient(160deg, color-mix(in srgb, var(--color-accent) 42%, #0b0b11), color-mix(in srgb, var(--color-accent) 22%, #08080c))",
                }}
            >
                {/* motion = a lightened accent so it stays visible against the dark panel on every theme */}
                <div
                    class="pointer-events-none absolute inset-0"
                    style={{
                        "--viz-tint": "color-mix(in srgb, var(--color-accent) 58%, #ffffff)",
                        opacity: "0.58",
                    }}
                >
                    <Visual />
                </div>
                <div
                    class="relative z-10 text-[16px] font-bold tracking-wide text-white"
                    style={{ "font-family": serif }}
                >
                    GALLEO
                </div>
                <div class="relative z-10 max-w-[34ch]">
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

            {/* right — themed form */}
            <div class="flex flex-1 items-center justify-center p-8">
                <div class="w-[360px]">
                    <h1
                        class="text-[26px] font-semibold tracking-tight"
                        style={{ "font-family": serif }}
                    >
                        Welcome back
                    </h1>
                    <p class="mb-6 mt-1 text-[14px] text-muted">
                        Decks, docs, and sites — one canonical artifact.
                    </p>

                    <form onSubmit={(e) => submit(e)} class="flex flex-col gap-2.5">
                        <Eyebrow>Email</Eyebrow>
                        <TextField
                            type="email"
                            autocomplete="email"
                            placeholder="you@studio.com"
                            class={authField}
                            value={email()}
                            onChange={setEmail}
                        />
                        <Eyebrow class="mt-1.5">Password</Eyebrow>
                        <TextField
                            type="password"
                            autocomplete="current-password"
                            placeholder="••••••••"
                            class={authField}
                            value={password()}
                            onChange={setPassword}
                        />
                        <Show when={error()}>
                            <p class="text-[12px] text-accent">{error()}</p>
                        </Show>
                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            loading={busy()}
                            class="mt-2 w-full"
                        >
                            {busy() ? "Signing in…" : "Sign in"}
                        </Button>
                    </form>

                    <div class="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                        <span class="h-px flex-1 bg-line" />
                        or
                        <span class="h-px flex-1 bg-line" />
                    </div>
                    <div class="grid grid-cols-2 gap-2.5">
                        <button type="button" disabled title="Coming soon" class={oauth}>
                            Google
                        </button>
                        <button type="button" disabled title="Coming soon" class={oauth}>
                            Microsoft
                        </button>
                    </div>
                    <p class="mt-6 text-[13px] text-muted">
                        New here? <span class="font-semibold text-accent">Create an account</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
