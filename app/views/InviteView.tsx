import type { Component } from "solid-js";
import { createResource, createSignal, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { Spinner } from "@ui/button";
import { api, ApiError } from "@app/api";

// reached from the emailed invite link; possession of the token is the credential
export const InviteView: Component = () => {
    const params = useParams<{ token: string }>();
    const [info] = createResource(
        () => params.token,
        (token) => api.inviteInfo(token),
    );
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const accept = async (): Promise<void> => {
        if (busy()) return;
        setBusy(true);
        setError(null);
        try {
            await api.acceptInvite(params.token);
            window.location.href = "/"; // full reload so every store re-fetches under the new workspace
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "joining failed — try again");
            setBusy(false);
        }
    };

    return (
        <div class="flex h-dvh items-center justify-center bg-canvas text-ink">
            <div class="w-full max-w-100 rounded-2xl border border-line bg-panel px-8 py-9 text-center">
                <Show
                    when={!info.error}
                    fallback={
                        <>
                            <h1 class="text-[19px] font-bold">Invite not found</h1>
                            <p class="mt-2 text-[13px] text-muted">
                                This invitation is invalid, expired, or was revoked. Ask the
                                workspace owner to send a fresh one.
                            </p>
                        </>
                    }
                >
                    <Show when={info()} fallback={<Spinner size={18} tone="current" />}>
                        {(inv) => (
                            <>
                                <h1 class="text-[19px] font-bold">
                                    Join <span class="text-accent">{inv().workspace}</span>
                                </h1>
                                <p class="mt-2 text-[13px] text-muted">
                                    You've been invited to collaborate. You can switch between your
                                    workspaces anytime from the sidebar.
                                </p>
                                <button
                                    class="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-canvas transition-colors hover:opacity-90 disabled:opacity-60"
                                    disabled={busy()}
                                    onClick={() => void accept()}
                                >
                                    <Show when={busy()}>
                                        <Spinner size={13} tone="current" />
                                    </Show>
                                    {busy() ? "Joining…" : "Join workspace"}
                                </button>
                                <Show when={error()}>
                                    <p class="mt-3 text-[12.5px] text-red-500">{error()}</p>
                                </Show>
                            </>
                        )}
                    </Show>
                </Show>
            </div>
        </div>
    );
};
