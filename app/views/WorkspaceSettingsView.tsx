import type { Component } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Eyebrow, Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Meter } from "@ui/status";
import { Sidebar, SidebarToggle } from "../components/Sidebar";
import { ApiError } from "../api";
import { billing, loadBilling } from "../stores/billing";
import {
    inviteMember,
    loadWorkspace,
    removeMember,
    revokeInvite,
    workspaceState,
} from "../stores/workspace";

export const WorkspaceSettingsView: Component = () => {
    const navigate = useNavigate();
    onMount(loadWorkspace);
    onMount(loadBilling);

    const st = workspaceState;
    const isOwner = (): boolean => st()?.role === "owner";
    const seatsUsed = createMemo(() => (st()?.members.length ?? 0) + (st()?.invites.length ?? 0));
    const seats = (): number => st()?.workspace.seats ?? 1;
    const seatPct = (): number => Math.min(100, Math.round((seatsUsed() / seats()) * 100));

    const [email, setEmail] = createSignal("");
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    // the accept URL is only known at creation, so offer it once for copy
    const [lastInvite, setLastInvite] = createSignal<{ url: string; sent: boolean } | null>(null);

    const submit = async (e: Event): Promise<void> => {
        e.preventDefault();
        const target = email().trim();
        if (!target || busy()) return;
        setBusy(true);
        setError(null);
        setLastInvite(null);
        try {
            setLastInvite(await inviteMember(target));
            setEmail("");
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "the invite failed — try again");
        } finally {
            setBusy(false);
        }
    };

    const initial = (name: string | null, mail: string): string =>
        (name?.trim()[0] ?? mail[0] ?? "?").toUpperCase();

    return (
        <div class="flex h-dvh bg-canvas text-ink">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto">
                <SidebarToggle />
                <div class="mx-auto max-w-160 px-5 py-6 md:px-8 md:py-10">
                    <header class="mb-6">
                        <h1 class="text-[26px] font-bold tracking-[-0.02em]">Workspace settings</h1>
                        <p class="mt-1 text-[14px] text-muted">
                            Members, seats, and plan for{" "}
                            <span class="font-semibold text-ink">{st()?.workspace.name}</span>.
                        </p>
                    </header>

                    <Show when={st()}>
                        {(state) => (
                            <>
                                <div class="mb-6 grid gap-3 sm:grid-cols-2">
                                    <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                        <Eyebrow as="div">Plan</Eyebrow>
                                        <div class="mt-1 flex items-baseline justify-between gap-1.5">
                                            <span class="text-[20px] font-bold capitalize">
                                                {billing()?.plan ?? state().workspace.plan}
                                            </span>
                                            <button
                                                class="text-[12px] font-semibold text-soft underline hover:text-ink"
                                                onClick={() => navigate("/pricing")}
                                            >
                                                Manage plan →
                                            </button>
                                        </div>
                                        <div class="mt-2 text-[11.5px] text-muted">
                                            Billing, credits, and upgrades live on the plans page.
                                        </div>
                                    </div>
                                    <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                        <Eyebrow as="div">Seats</Eyebrow>
                                        <div class="mt-1 flex items-baseline justify-between gap-1.5 tabular-nums">
                                            <div>
                                                <span class="text-[20px] font-bold">
                                                    {seatsUsed()}
                                                </span>
                                                <span class="text-[13px] text-muted">
                                                    {" "}
                                                    / {seats()} used
                                                </span>
                                            </div>
                                            <Show when={isOwner()}>
                                                <button
                                                    class="text-[12px] font-semibold text-soft underline hover:text-ink"
                                                    onClick={() => navigate("/pricing")}
                                                >
                                                    Add seats →
                                                </button>
                                            </Show>
                                        </div>
                                        <Meter value={seatPct()} trackTone="canvas" class="mt-2" />
                                    </div>
                                </div>

                                <Eyebrow as="div" class="mb-2">
                                    Members
                                </Eyebrow>
                                <Show when={isOwner()}>
                                    <form class="mb-2 flex items-start gap-2" onSubmit={submit}>
                                        <TextField
                                            type="email"
                                            placeholder="teammate@company.com"
                                            value={email()}
                                            onChange={setEmail}
                                            class="flex-1"
                                        />
                                        <button
                                            type="submit"
                                            class="inline-flex flex-none items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-canvas transition-colors hover:opacity-90 disabled:opacity-50"
                                            disabled={busy() || !email().trim()}
                                        >
                                            <Show when={busy()}>
                                                <Spinner size={13} tone="current" />
                                            </Show>
                                            {busy() ? "Inviting…" : "Invite"}
                                        </button>
                                    </form>
                                    <Show when={error()}>
                                        <p class="mb-3 text-[12.5px] text-red-500">{error()}</p>
                                    </Show>
                                    <Show when={lastInvite()}>
                                        {(inv) => (
                                            <div class="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[12.5px] text-ink">
                                                {inv().sent
                                                    ? "Invite sent."
                                                    : "Invite created (email isn't configured on this server)."}{" "}
                                                Share this link — it works once:
                                                <div class="mt-1.5 flex items-center gap-2">
                                                    <code class="min-w-0 flex-1 truncate rounded-md bg-canvas px-2 py-1 text-[11.5px]">
                                                        {inv().url}
                                                    </code>
                                                    <button
                                                        class="flex-none rounded-md border border-line bg-canvas px-2 py-1 text-[11.5px] font-semibold hover:border-accent"
                                                        onClick={() =>
                                                            void navigator.clipboard.writeText(
                                                                inv().url,
                                                            )
                                                        }
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </Show>
                                </Show>

                                <ul class="divide-y divide-line rounded-xl border border-line bg-panel">
                                    <For each={state().members}>
                                        {(m) => (
                                            <li class="flex items-center gap-3 px-4 py-3">
                                                <span class="flex size-8 flex-none items-center justify-center overflow-hidden rounded-full bg-accent/15 text-[12.5px] font-bold text-accent">
                                                    <Show
                                                        when={m.avatarUrl}
                                                        fallback={initial(m.name, m.email)}
                                                    >
                                                        <img
                                                            src={m.avatarUrl!}
                                                            alt=""
                                                            class="size-full object-cover"
                                                        />
                                                    </Show>
                                                </span>
                                                <span class="min-w-0 flex-1">
                                                    <span class="block truncate text-[13px] font-semibold">
                                                        {m.name ?? m.email}
                                                    </span>
                                                    <Show when={m.name}>
                                                        <span class="block truncate text-[11.5px] text-muted">
                                                            {m.email}
                                                        </span>
                                                    </Show>
                                                </span>
                                                <span class="flex-none text-[11px] font-semibold uppercase tracking-wide text-muted">
                                                    {m.isOwner ? "Owner" : m.role}
                                                </span>
                                                <Show when={isOwner() && !m.isOwner}>
                                                    <button
                                                        class="flex-none text-[12px] font-medium text-soft underline hover:text-ink"
                                                        onClick={() =>
                                                            void removeMember(m.userId).catch(
                                                                () => {},
                                                            )
                                                        }
                                                    >
                                                        Remove
                                                    </button>
                                                </Show>
                                            </li>
                                        )}
                                    </For>
                                    <For each={state().invites}>
                                        {(inv) => (
                                            <li class="flex items-center gap-3 px-4 py-3 opacity-70">
                                                <span class="flex size-8 flex-none items-center justify-center rounded-full border border-dashed border-line text-[12.5px] font-bold text-muted">
                                                    {inv.email[0]?.toUpperCase()}
                                                </span>
                                                <span class="min-w-0 flex-1">
                                                    <span class="block truncate text-[13px] font-semibold">
                                                        {inv.email}
                                                    </span>
                                                    <span class="block text-[11.5px] text-muted">
                                                        Invited — expires{" "}
                                                        {new Date(
                                                            inv.expiresAt,
                                                        ).toLocaleDateString()}
                                                    </span>
                                                </span>
                                                <button
                                                    class="flex-none text-[12px] font-medium text-soft underline hover:text-ink"
                                                    onClick={() =>
                                                        void revokeInvite(inv.id).catch(() => {})
                                                    }
                                                >
                                                    Revoke
                                                </button>
                                            </li>
                                        )}
                                    </For>
                                </ul>
                            </>
                        )}
                    </Show>
                </div>
            </main>
        </div>
    );
};
