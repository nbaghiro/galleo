import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { user } from "@app/stores/auth";
import { ConfirmCodeField } from "@app/components/ConfirmCode";
import { api } from "@app/api";
import { Icon } from "@ui/icons";

// The nudge for an account that predates the confirmation gate: it is not held at the onboarding step,
// so this is the only place it can confirm, and a button that only mails a code would be a dead end.
// OAuth users land verified, so they never get it.
export const VerifyBanner: Component = () => {
    const [sent, setSent] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [dismissed, setDismissed] = createSignal(false);

    const resend = async (): Promise<void> => {
        setBusy(true);
        try {
            await api.resendVerification();
            setSent(true);
        } catch {
            // best-effort: a resend failure isn't worth interrupting the user
        } finally {
            setBusy(false);
        }
    };

    return (
        <Show when={user() && !user()!.emailVerified && !dismissed()}>
            <div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel px-4 py-2 text-[12.5px] text-soft shadow-lg">
                <Show
                    when={sent()}
                    fallback={
                        <>
                            <span>Confirm your email to secure your account.</span>
                            <button
                                type="button"
                                disabled={busy()}
                                onClick={() => void resend()}
                                class="font-semibold text-accent hover:underline disabled:opacity-60"
                            >
                                {busy() ? "Sending…" : "Send a code"}
                            </button>
                        </>
                    }
                >
                    <span class={error() ? "text-danger" : "text-ink"}>
                        {error() ?? "Enter the code we sent."}
                    </span>
                    <ConfirmCodeField layout="inline" onError={setError} />
                </Show>
                <button
                    type="button"
                    title="Dismiss"
                    onClick={() => setDismissed(true)}
                    class="text-muted hover:text-ink"
                >
                    <Icon name="close" size={12} />
                </button>
            </div>
        </Show>
    );
};
