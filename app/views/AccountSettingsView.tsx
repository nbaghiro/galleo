import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import type { WorkspaceRole } from "@model/workspace";
import { resolveTheme } from "@themes";
import { Avatar } from "@ui/avatar";
import { Badge, Button, Eyebrow } from "@ui/button";
import { TextField } from "@ui/inputs";
import { ConfirmModal } from "@ui/overlay";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import { ApiError, api, type AccountConnection, type Membership } from "@app/api";
import {
    changePassword,
    loadConnections,
    unlinkConnection,
    updateProfile,
    user,
} from "@app/stores/auth";
import { appTheme, customThemes, openThemeEditor } from "@app/stores/theme";
import { clearModelOverrides, overrideCount } from "@app/stores/models";
import { modelPickerReady, openModelPicker } from "@app/components/ModelPicker";
import { leaveWorkspace, switchWorkspace } from "@app/stores/workspace";

const Section: Component<{ title: string; children: JSX.Element }> = (props) => (
    <section class="mb-8">
        <Eyebrow as="div" class="mb-2">
            {props.title}
        </Eyebrow>
        {props.children}
    </section>
);

const Card: Component<{ children: JSX.Element }> = (props) => (
    <div class="rounded-xl border border-line bg-panel px-4 py-3">{props.children}</div>
);

// the label + control pairing every settings row uses; stacks under sm so a phone gets full width
const Row: Component<{ label: string; hint?: string; children: JSX.Element }> = (props) => (
    <div class="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
        <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold text-ink">{props.label}</div>
            <Show when={props.hint}>
                {(h) => <div class="mt-0.5 text-[11.5px] text-muted">{h()}</div>}
            </Show>
        </div>
        <div class="flex flex-none items-center gap-2">{props.children}</div>
    </div>
);

const roleLabel: Record<WorkspaceRole, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
};

const PROVIDER_LABEL: Record<string, string> = { google: "Google" };
const providerName = (id: string): string => PROVIDER_LABEL[id] ?? id;

// the account page is where a link attempt reports back, since that is where it was started
const LINK_ERRORS: Record<string, string> = {
    oauth_linked_elsewhere: "That account is already connected to a different Galleo account.",
    oauth_state: "The connection attempt expired. Try again.",
    oauth_exchange: "Could not reach the provider. Try again.",
    oauth_email: "The provider did not share a verified email address.",
    oauth_email_taken: "That email already belongs to another account.",
};

export const AccountSettingsView: Component = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    const me = user;
    // OAuth returns here with an outcome in the query; read it once, then drop it from the URL
    const [linkNotice, setLinkNotice] = createSignal<string | null>(null);
    const [linkError, setLinkError] = createSignal<string | null>(null);
    onMount(() => {
        const linked = typeof params.linked === "string" ? params.linked : null;
        const failed = typeof params.authError === "string" ? params.authError : null;
        if (linked) setLinkNotice(`${providerName(linked)} is connected.`);
        if (failed) setLinkError(LINK_ERRORS[failed] ?? "Could not connect that account.");
        if (linked || failed) setParams({ linked: null, authError: null }, { replace: true });
    });

    // profile
    const [name, setName] = createSignal<string | null>(null);
    const [savingName, setSavingName] = createSignal(false);
    const [nameSaved, setNameSaved] = createSignal(false);
    const nameValue = (): string => name() ?? me()?.name ?? "";
    const nameDirty = (): boolean => name() !== null && name()!.trim() !== (me()?.name ?? "");
    const submitName = async (e: Event): Promise<void> => {
        e.preventDefault();
        if (!nameDirty() || savingName()) return;
        setSavingName(true);
        setNameSaved(false);
        try {
            await updateProfile(name()!.trim() || null);
            setName(null);
            setNameSaved(true);
        } catch {
            // the field keeps what was typed, so a retry costs nothing
        } finally {
            setSavingName(false);
        }
    };

    // email verification
    const [resent, setResent] = createSignal(false);
    const [resending, setResending] = createSignal(false);
    const resend = async (): Promise<void> => {
        setResending(true);
        try {
            await api.resendVerification();
            setResent(true);
        } catch {
            // best effort, same as the banner
        } finally {
            setResending(false);
        }
    };

    // password
    const hasPassword = (): boolean => me()?.hasPassword ?? true;
    const [current, setCurrent] = createSignal("");
    const [next, setNext] = createSignal("");
    const [confirmPw, setConfirmPw] = createSignal("");
    const [pwBusy, setPwBusy] = createSignal(false);
    const [pwError, setPwError] = createSignal<string | null>(null);
    const [pwDone, setPwDone] = createSignal(false);
    const pwReady = (): boolean =>
        next().length >= 8 && next() === confirmPw() && (!hasPassword() || current().length > 0);
    const submitPassword = async (e: Event): Promise<void> => {
        e.preventDefault();
        if (!pwReady() || pwBusy()) return;
        setPwBusy(true);
        setPwError(null);
        setPwDone(false);
        try {
            await changePassword(next(), hasPassword() ? current() : undefined);
            setCurrent("");
            setNext("");
            setConfirmPw("");
            setPwDone(true);
        } catch (err) {
            setPwError(err instanceof ApiError ? err.message : "Could not save that password.");
        } finally {
            setPwBusy(false);
        }
    };

    // connections
    const [connections, setConnections] = createSignal<AccountConnection[]>([]);
    const [googleReady, setGoogleReady] = createSignal(false);
    const [connError, setConnError] = createSignal<string | null>(null);
    const refreshConnections = async (): Promise<void> => {
        try {
            setConnections(await loadConnections());
        } catch {
            // signed out; the route guard handles it
        }
    };
    onMount(() => {
        void refreshConnections();
        api.authProviders()
            .then((p) => setGoogleReady(p.google))
            .catch(() => {});
    });
    const linkedGoogle = (): boolean => connections().some((c) => c.provider === "google");
    // the server refuses this too; disabling it here explains why instead of failing on click
    const onlyCredential = (): boolean => !hasPassword() && connections().length < 2;
    const unlink = async (provider: AccountConnection["provider"]): Promise<void> => {
        setConnError(null);
        try {
            await unlinkConnection(provider);
            await refreshConnections();
        } catch (err) {
            setConnError(err instanceof ApiError ? err.message : "Could not disconnect that.");
        }
    };

    // preferences
    const themeName = createMemo(() => {
        customThemes(); // re-resolve once the workspace's own themes load
        return resolveTheme(appTheme()).name;
    });

    // workspaces
    const [memberships, setMemberships] = createSignal<Membership[]>([]);
    const [leaving, setLeaving] = createSignal<Membership | null>(null);
    const [leaveBusy, setLeaveBusy] = createSignal(false);
    const loadMemberships = async (): Promise<void> => {
        try {
            const { memberships: list } = await api.getMemberships();
            setMemberships(list);
        } catch {
            // signed out; the route guard handles it
        }
    };
    onMount(() => void loadMemberships());
    const confirmLeave = async (): Promise<void> => {
        const target = leaving();
        if (!target || leaveBusy()) return;
        setLeaveBusy(true);
        try {
            await leaveWorkspace(target.id);
        } finally {
            setLeaveBusy(false);
        }
    };

    return (
        <div class="flex h-dvh bg-canvas text-ink">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto">
                <SidebarToggle />
                <div class="mx-auto max-w-260 px-5 py-6 md:px-8 md:py-10">
                    <header class="mb-6">
                        <h1 class="text-[26px] font-bold tracking-[-0.02em]">Account</h1>
                        <p class="mt-1 text-[14px] text-muted">
                            Your profile, sign-in, and the settings that follow you across
                            workspaces.
                        </p>
                    </header>

                    <Show when={linkNotice()}>
                        {(t) => (
                            <div class="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                                {t()}
                            </div>
                        )}
                    </Show>
                    <Show when={linkError()}>
                        {(t) => (
                            <div class="mb-5 rounded-xl border border-accent bg-accent/10 px-4 py-3 text-[13px] text-ink">
                                {t()}
                            </div>
                        )}
                    </Show>

                    <Section title="Profile">
                        <Card>
                            <div class="flex items-center gap-3 border-b border-line pb-3">
                                <Avatar
                                    size="lg"
                                    src={me()?.avatarUrl}
                                    name={me()?.name}
                                    email={me()?.email}
                                />
                                <div class="min-w-0 flex-1">
                                    <div class="truncate text-[14px] font-semibold">
                                        {me()?.name ?? me()?.email}
                                    </div>
                                    <div class="truncate text-[12px] text-muted">
                                        Your picture comes from the account you signed in with.
                                    </div>
                                </div>
                            </div>

                            <form class="border-b border-line py-3" onSubmit={submitName}>
                                <label
                                    class="block text-[13px] font-semibold text-ink"
                                    for="account-name"
                                >
                                    Display name
                                </label>
                                <div class="mt-1.5 flex items-center gap-2">
                                    <TextField
                                        id="account-name"
                                        class="flex-1"
                                        placeholder="Your name"
                                        value={nameValue()}
                                        onChange={(v) => {
                                            setName(v);
                                            setNameSaved(false);
                                        }}
                                    />
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        disabled={!nameDirty()}
                                        loading={savingName()}
                                    >
                                        Save
                                    </Button>
                                </div>
                                <Show when={nameSaved()}>
                                    <p class="mt-1.5 text-[11.5px] text-muted">Name updated.</p>
                                </Show>
                            </form>

                            <Row label="Email" hint={me()?.email}>
                                <Show
                                    when={!me()?.emailVerified}
                                    fallback={<Badge tone="accentSoft">Verified</Badge>}
                                >
                                    <Show
                                        when={!resent()}
                                        fallback={
                                            <span class="text-[12px] text-muted">
                                                Check your inbox.
                                            </span>
                                        }
                                    >
                                        <Badge tone="muted">Unverified</Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            loading={resending()}
                                            onClick={() => void resend()}
                                        >
                                            Resend link
                                        </Button>
                                    </Show>
                                </Show>
                            </Row>
                        </Card>
                    </Section>

                    <Section title="Password">
                        <Card>
                            <p class="text-[12.5px] text-muted">
                                <Show
                                    when={hasPassword()}
                                    fallback="You sign in with a connected account. Set a password to add a second way in."
                                >
                                    Changing your password signs out every other device.
                                </Show>
                            </p>
                            <form
                                class="mt-3 flex flex-col gap-2 sm:max-w-100"
                                onSubmit={submitPassword}
                            >
                                <Show when={hasPassword()}>
                                    <TextField
                                        type="password"
                                        autocomplete="current-password"
                                        placeholder="Current password"
                                        aria-label="Current password"
                                        value={current()}
                                        onChange={setCurrent}
                                    />
                                </Show>
                                <TextField
                                    type="password"
                                    autocomplete="new-password"
                                    placeholder="New password"
                                    aria-label="New password"
                                    value={next()}
                                    onChange={(v) => {
                                        setNext(v);
                                        setPwDone(false);
                                    }}
                                />
                                <TextField
                                    type="password"
                                    autocomplete="new-password"
                                    placeholder="Repeat new password"
                                    aria-label="Repeat new password"
                                    value={confirmPw()}
                                    onChange={setConfirmPw}
                                />
                                <div class="flex items-center gap-2">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={!pwReady()}
                                        loading={pwBusy()}
                                    >
                                        {hasPassword() ? "Change password" : "Set password"}
                                    </Button>
                                    <Show when={next() && next().length < 8}>
                                        <span class="text-[11.5px] text-muted">
                                            At least 8 characters.
                                        </span>
                                    </Show>
                                    <Show when={confirmPw() && next() !== confirmPw()}>
                                        <span class="text-[11.5px] text-muted">
                                            Both fields must match.
                                        </span>
                                    </Show>
                                </div>
                            </form>
                            <Show when={pwError()}>
                                {(t) => <p class="mt-2 text-[12.5px] text-accent">{t()}</p>}
                            </Show>
                            <Show when={pwDone()}>
                                <p class="mt-2 text-[12.5px] text-muted">
                                    Password saved. Other devices have been signed out.
                                </p>
                            </Show>
                        </Card>
                    </Section>

                    <Section title="Connected accounts">
                        <Card>
                            <For each={connections()}>
                                {(conn) => (
                                    <Row
                                        label={providerName(conn.provider)}
                                        hint={`Connected ${new Date(conn.linkedAt).toLocaleDateString()}`}
                                    >
                                        <Show
                                            when={!onlyCredential()}
                                            fallback={
                                                <span class="text-[11.5px] text-muted">
                                                    Set a password to disconnect this
                                                </span>
                                            }
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => void unlink(conn.provider)}
                                            >
                                                Disconnect
                                            </Button>
                                        </Show>
                                    </Row>
                                )}
                            </For>
                            <Show when={googleReady() && !linkedGoogle()}>
                                <Row
                                    label="Google"
                                    hint="Sign in with one click, without a password"
                                >
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            window.location.assign("/api/auth/google?link=1")
                                        }
                                    >
                                        Connect
                                    </Button>
                                </Row>
                            </Show>
                            <Show when={!googleReady() && !connections().length}>
                                <p class="py-1 text-[12.5px] text-muted">
                                    No sign-in providers are configured on this server.
                                </p>
                            </Show>
                            <Show when={connError()}>
                                {(t) => <p class="mt-2 text-[12.5px] text-accent">{t()}</p>}
                            </Show>
                        </Card>
                    </Section>

                    <Section title="Preferences">
                        <Card>
                            <Row label="App theme" hint={`Currently ${themeName()}`}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openThemeEditor()}
                                >
                                    Change theme
                                </Button>
                            </Row>
                            <Show when={modelPickerReady()}>
                                <Row
                                    label="AI models"
                                    hint={
                                        overrideCount()
                                            ? `${overrideCount()} step${overrideCount() > 1 ? "s" : ""} pinned to a specific model, on this browser`
                                            : "Every step uses the default model for your plan"
                                    }
                                >
                                    <Show when={overrideCount()}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => clearModelOverrides()}
                                        >
                                            Reset
                                        </Button>
                                    </Show>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openModelPicker()}
                                    >
                                        Pick models
                                    </Button>
                                </Row>
                            </Show>
                        </Card>
                    </Section>

                    <Section title="Your workspaces">
                        <Card>
                            <For each={memberships()}>
                                {(ws) => (
                                    <Row label={ws.name} hint={roleLabel[ws.role]}>
                                        <Show
                                            when={!ws.active}
                                            fallback={<Badge tone="accentSoft">Current</Badge>}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => void switchWorkspace(ws.id)}
                                            >
                                                Switch to
                                            </Button>
                                        </Show>
                                        <Show when={ws.role !== "owner"}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setLeaving(ws)}
                                            >
                                                Leave
                                            </Button>
                                        </Show>
                                    </Row>
                                )}
                            </For>
                            <p class="pt-3 text-[11.5px] text-muted">
                                Members, plan, and billing live in{" "}
                                <button
                                    class="font-semibold text-soft underline hover:text-ink"
                                    onClick={() => navigate("/settings")}
                                >
                                    workspace settings
                                </button>
                                .
                            </p>
                        </Card>
                    </Section>
                </div>
            </main>

            <Show when={leaving()}>
                {(ws) => (
                    <ConfirmModal
                        title="Leave this workspace?"
                        body={
                            <>
                                You'll lose access to <span class="font-semibold">{ws().name}</span>{" "}
                                and its artifacts until someone invites you back.
                            </>
                        }
                        confirmLabel="Leave"
                        danger
                        busy={leaveBusy()}
                        onConfirm={() => void confirmLeave()}
                        onCancel={() => setLeaving(null)}
                    />
                )}
            </Show>
        </div>
    );
};
