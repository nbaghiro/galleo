import type { Component } from "solid-js";
import { createResource, createSignal, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { Spinner } from "@ui/button";
import { api, ApiError } from "@app/api";

const VERB: Record<string, string> = {
    view: "read",
    comment: "read and comment on",
    edit: "edit",
};

// Reached from the emailed collaborator link; possession of the token is the credential. Accepting
// binds the grant to this account, so the link is spent and a forwarded copy does nothing.
export const CollabInviteView: Component = () => {
    const params = useParams<{ token: string }>();
    const [info] = createResource(
        () => params.token,
        (token) => api.collabInviteInfo(token),
    );
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const accept = async (): Promise<void> => {
        if (busy()) return;
        setBusy(true);
        setError(null);
        try {
            const { artifactId } = await api.acceptCollabInvite(params.token);
            window.location.href = `/edit/${artifactId}`;
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "that did not work. Try again");
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
                                This invitation is invalid, was already used, or was revoked. Ask
                                whoever sent it for a fresh one.
                            </p>
                        </>
                    }
                >
                    <Show when={info()} fallback={<Spinner size={18} tone="current" />}>
                        {(inv) => (
                            <>
                                <h1 class="text-[19px] font-bold">
                                    Open <span class="text-accent">{inv().title}</span>
                                </h1>
                                <p class="mt-2 text-[13px] text-muted">
                                    You have been invited to {VERB[inv().access] ?? "open"} this
                                    document from {inv().workspaceName}. It shows up under Shared
                                    with me.
                                </p>
                                <button
                                    class="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-canvas transition-colors hover:opacity-90 disabled:opacity-60"
                                    disabled={busy()}
                                    onClick={() => void accept()}
                                >
                                    <Show when={busy()}>
                                        <Spinner size={13} tone="current" />
                                    </Show>
                                    {busy() ? "Opening…" : "Open document"}
                                </button>
                                <Show when={error()}>
                                    <p class="mt-3 text-[12.5px] text-fail">{error()}</p>
                                </Show>
                            </>
                        )}
                    </Show>
                </Show>
            </div>
        </div>
    );
};
