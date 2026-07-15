import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { user } from "../stores/auth";
import { api } from "../api";

// Dismissible pill nudging unverified email/password users to confirm their address. OAuth users land
// verified so they never see it.
export const VerifyBanner: Component = () => {
    const [sent, setSent] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    const [dismissed, setDismissed] = createSignal(false);

    const resend = async (): Promise<void> => {
        setBusy(true);
        try {
            await api.resendVerification();
            setSent(true);
        } catch {
            // best-effort — a resend failure isn't worth interrupting the user
        } finally {
            setBusy(false);
        }
    };

    return (
        <Show when={user() && !user()!.emailVerified && !dismissed()}>
            <div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel px-4 py-2 text-[12.5px] text-soft shadow-lg">
                <Show
                    when={!sent()}
                    fallback={<span class="text-ink">Verification sent — check your inbox.</span>}
                >
                    <span>Verify your email to secure your account.</span>
                    <button
                        type="button"
                        disabled={busy()}
                        onClick={() => void resend()}
                        class="font-semibold text-accent hover:underline disabled:opacity-60"
                    >
                        {busy() ? "Sending…" : "Resend link"}
                    </button>
                </Show>
                <button
                    type="button"
                    title="Dismiss"
                    onClick={() => setDismissed(true)}
                    class="text-muted hover:text-ink"
                >
                    ✕
                </button>
            </div>
        </Show>
    );
};
