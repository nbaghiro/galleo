import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { PublishPolicy, WorkspaceRole } from "@model/workspace";
import type { ArtifactAccess } from "@model/artifact";
import { describeUsage } from "@model/credits";
import { Avatar } from "@ui/avatar";
import { Button, Eyebrow, Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Dropdown } from "@ui/select";
import { Meter } from "@ui/status";
import { ConfirmModal } from "@ui/overlay";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import { ApiError, api, type LedgerEntry, type WorkspaceMember } from "@app/api";
import { billing, loadBilling, openPortal } from "@app/stores/billing";
import {
    inviteMember,
    leaveWorkspace,
    loadWorkspace,
    removeMember,
    renameWorkspace,
    revokeInvite,
    updateWorkspaceSettings,
    setMemberRole,
    transferOwnership,
    workspaceState,
} from "@app/stores/workspace";

const Section: Component<{ title: string; children: JSX.Element }> = (props) => (
    <section class="mb-8">
        <Eyebrow as="div" class="mb-2">
            {props.title}
        </Eyebrow>
        {props.children}
    </section>
);

const StatCard: Component<{
    label: string;
    value: string;
    caption?: string;
    meter?: { value: number; max: number };
    action?: JSX.Element;
}> = (props) => (
    <div class="rounded-xl border border-line bg-panel px-4 py-3">
        <div class="flex items-baseline justify-between gap-1.5">
            <Eyebrow as="div">{props.label}</Eyebrow>
            {props.action}
        </div>
        <div class="mt-1 text-[20px] font-bold tabular-nums">{props.value}</div>
        <Show when={props.meter}>
            {(m) => <Meter value={m().value} max={m().max} trackTone="canvas" class="mt-2" />}
        </Show>
        <Show when={props.caption}>
            {(t) => <div class="mt-1.5 text-[11.5px] text-muted">{t()}</div>}
        </Show>
    </div>
);

const PolicyRow: Component<{ label: string; hint: string; children: JSX.Element }> = (props) => (
    <div class="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
        <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold text-ink">{props.label}</div>
            <div class="mt-0.5 text-[11.5px] text-muted">{props.hint}</div>
        </div>
        <div class="flex-none">{props.children}</div>
    </div>
);

// "none" is deliberately not offered as a workspace default: a default that hides every new artifact
// from everyone reads as broken, and the same effect is available per artifact.
const ACCESS_OPTIONS = [
    { label: "Can edit", value: "edit" },
    { label: "Can comment", value: "comment" },
    { label: "Can view", value: "view" },
];

const roleLabel: Record<WorkspaceRole, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
};

export const WorkspaceSettingsView: Component = () => {
    const navigate = useNavigate();
    onMount(loadWorkspace);
    onMount(loadBilling);

    const st = workspaceState;
    const myRole = (): WorkspaceRole => st()?.role ?? "member";
    const isOwner = (): boolean => myRole() === "owner";
    const isAdmin = (): boolean => myRole() !== "member";
    const seatsUsed = createMemo(() => (st()?.members.length ?? 0) + (st()?.invites.length ?? 0));
    const seats = (): number => st()?.workspace.seats ?? 1;

    const b = billing;
    const creditsLeft = (): number => b()?.credits.balance ?? 0;
    const unlimited = (n: number): boolean => n < 0;
    // "/ ∞" over a bare number, so no cap reads as unlimited rather than as a missing denominator
    const storageValue = (): string => {
        const u = b()?.usage;
        if (!u) return "—";
        return unlimited(u.maxStorageMb)
            ? `${u.storageMb} MB / ∞`
            : `${u.storageMb} / ${u.maxStorageMb} MB`;
    };
    const artifactsCaption = (): string => {
        const u = b()?.usage;
        if (!u) return "";
        if (unlimited(u.maxArtifacts)) return `${u.artifacts} / ∞ artifacts`;
        const left = Math.max(0, u.maxArtifacts - u.artifacts);
        return `${u.artifacts} / ${u.maxArtifacts} artifacts · ${left} left`;
    };

    // policies (admin+); the two dropdowns save on change, the cap has a field so it needs a submit
    const savePolicy = async (patch: Parameters<typeof updateWorkspaceSettings>[0]) => {
        await updateWorkspaceSettings(patch).catch(() => {});
    };
    const [cap, setCap] = createSignal<string | null>(null);
    const storedCap = (): string => {
        const n = st()?.workspace.memberCreditCap;
        return n == null ? "" : String(n);
    };
    const capValue = (): string => cap() ?? storedCap();
    const capDirty = (): boolean => cap() !== null && cap() !== storedCap();
    const submitCap = async (e: Event): Promise<void> => {
        e.preventDefault();
        if (!capDirty()) return;
        const raw = capValue().trim();
        const n = Number(raw);
        if (raw && (!Number.isFinite(n) || n < 0)) return;
        await savePolicy({ memberCreditCap: raw ? Math.trunc(n) : null });
        setCap(null);
    };

    // rename (admin+)
    const [name, setName] = createSignal<string | null>(null);
    const [savingName, setSavingName] = createSignal(false);
    const submitName = async (e: Event): Promise<void> => {
        e.preventDefault();
        const next = name()?.trim();
        if (!next || next === st()?.workspace.name || savingName()) return;
        setSavingName(true);
        try {
            await renameWorkspace(next);
            setName(null);
        } finally {
            setSavingName(false);
        }
    };

    // invite (admin+)
    const [email, setEmail] = createSignal("");
    const [inviteRole, setInviteRole] = createSignal<"admin" | "member">("member");
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    // the accept URL is only known at creation, so offer it once for copy
    const [lastInvite, setLastInvite] = createSignal<{ url: string; sent: boolean } | null>(null);

    const submitInvite = async (e: Event): Promise<void> => {
        e.preventDefault();
        const target = email().trim();
        if (!target || busy()) return;
        setBusy(true);
        setError(null);
        setLastInvite(null);
        try {
            setLastInvite(await inviteMember(target, inviteRole()));
            setEmail("");
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "the invite failed. Try again");
        } finally {
            setBusy(false);
        }
    };

    // leave / transfer confirmations
    const [confirm, setConfirm] = createSignal<
        { kind: "leave" } | { kind: "transfer"; member: WorkspaceMember } | null
    >(null);
    const [acting, setActing] = createSignal(false);
    const runConfirm = async (): Promise<void> => {
        const c = confirm();
        if (!c || acting()) return;
        setActing(true);
        try {
            if (c.kind === "leave") await leaveWorkspace();
            else await transferOwnership(c.member.userId);
            setConfirm(null);
        } finally {
            setActing(false);
        }
    };

    // ledger, first page eagerly + load-more
    const [ledger, setLedger] = createSignal<LedgerEntry[]>([]);
    const [ledgerCursor, setLedgerCursor] = createSignal<string | null>(null);
    const [ledgerLoading, setLedgerLoading] = createSignal(false);
    const loadLedger = async (cursor?: string | null): Promise<void> => {
        if (ledgerLoading()) return;
        setLedgerLoading(true);
        try {
            const page = await api.getLedger(cursor);
            setLedger(cursor ? [...ledger(), ...page.entries] : page.entries);
            setLedgerCursor(page.nextCursor);
        } catch {
            /* the section just stays empty */
        } finally {
            setLedgerLoading(false);
        }
    };
    onMount(() => void loadLedger());

    // a settle now rewrites the charge's own row, so the suffixes only appear on rows written
    // before that change
    const reasonLabel = (r: string): string =>
        r.replace(":settle", " (adjusted)").replace(":refund", " (refunded)").replace(/-/g, " ");

    return (
        <div class="flex h-dvh bg-canvas text-ink">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto">
                <SidebarToggle />
                <div class="mx-auto max-w-260 px-5 py-6 md:px-8 md:py-10">
                    <header class="mb-6">
                        <h1 class="text-[26px] font-bold tracking-[-0.02em]">Workspace settings</h1>
                        <p class="mt-1 text-[14px] text-muted">
                            Members, plan, and usage for{" "}
                            <span class="font-semibold text-ink">{st()?.workspace.name}</span>.
                        </p>
                    </header>

                    <Show when={st()}>
                        {(state) => (
                            <>
                                <Section title="General">
                                    <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                        <Show
                                            when={isAdmin()}
                                            fallback={
                                                <div class="text-[14px] font-semibold">
                                                    {state().workspace.name}
                                                </div>
                                            }
                                        >
                                            <form
                                                class="flex items-center gap-2"
                                                onSubmit={submitName}
                                            >
                                                <TextField
                                                    class="flex-1"
                                                    value={name() ?? state().workspace.name}
                                                    onChange={setName}
                                                    aria-label="Workspace name"
                                                />
                                                <Button
                                                    type="submit"
                                                    variant="outline"
                                                    disabled={
                                                        savingName() ||
                                                        !name()?.trim() ||
                                                        name()?.trim() === state().workspace.name
                                                    }
                                                >
                                                    {savingName() ? "Saving…" : "Rename"}
                                                </Button>
                                            </form>
                                        </Show>
                                        <Show when={!isOwner()}>
                                            <div class="mt-3 border-t border-line pt-3">
                                                <Button
                                                    variant="ghost"
                                                    class="text-[12.5px]"
                                                    onClick={() => setConfirm({ kind: "leave" })}
                                                >
                                                    Leave this workspace
                                                </Button>
                                            </div>
                                        </Show>
                                    </div>
                                </Section>

                                <Show when={isAdmin()}>
                                    <Section title="Policies">
                                        <div class="rounded-xl border border-line bg-panel px-4 py-1">
                                            <PolicyRow
                                                label="Default access to new work"
                                                hint="What everyone else in the workspace gets on an artifact that sets no level of its own. The person who made it, and admins, always keep full access."
                                            >
                                                <div class="w-44">
                                                    <Dropdown
                                                        // an absent value is the ship default, never
                                                        // a lock: a missing key must not read as none
                                                        value={
                                                            state().workspace
                                                                .defaultArtifactAccess ?? "edit"
                                                        }
                                                        options={ACCESS_OPTIONS}
                                                        onChange={(v) =>
                                                            void savePolicy({
                                                                defaultArtifactAccess:
                                                                    v as ArtifactAccess,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </PolicyRow>
                                            <PolicyRow
                                                label="Who can publish"
                                                hint="Publishing puts an artifact on a public URL, outside the workspace."
                                            >
                                                <div class="w-44">
                                                    <Dropdown
                                                        value={state().workspace.publishPolicy}
                                                        options={[
                                                            {
                                                                label: "Everyone",
                                                                value: "members",
                                                            },
                                                            {
                                                                label: "Admins only",
                                                                value: "admins",
                                                            },
                                                        ]}
                                                        onChange={(v) =>
                                                            void savePolicy({
                                                                publishPolicy: v as PublishPolicy,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </PolicyRow>
                                            <PolicyRow
                                                label="Credit limit per member"
                                                hint="The most one member can spend from the shared pool each cycle. Admins are never limited. Leave it empty for no limit."
                                            >
                                                <form
                                                    class="flex items-center gap-2"
                                                    onSubmit={submitCap}
                                                >
                                                    <TextField
                                                        type="number"
                                                        min={0}
                                                        class="w-28"
                                                        placeholder="No limit"
                                                        aria-label="Credit limit per member"
                                                        value={capValue()}
                                                        onChange={setCap}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        variant="outline"
                                                        disabled={!capDirty()}
                                                    >
                                                        Save
                                                    </Button>
                                                </form>
                                            </PolicyRow>
                                        </div>
                                    </Section>
                                </Show>

                                <Section title="Plan & usage">
                                    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <StatCard
                                            label="Plan"
                                            value={
                                                (b()?.plan ?? state().workspace.plan)
                                                    .charAt(0)
                                                    .toUpperCase() +
                                                (b()?.plan ?? state().workspace.plan).slice(1)
                                            }
                                            caption={
                                                b()?.status === "past_due"
                                                    ? "Payment failed. Update your card"
                                                    : b()?.cancelAtPeriodEnd
                                                      ? "Ends at the period close"
                                                      : undefined
                                            }
                                            action={
                                                <button
                                                    class="text-[12px] font-semibold text-soft underline hover:text-ink"
                                                    onClick={() =>
                                                        b()?.status === "past_due"
                                                            ? void openPortal()
                                                            : navigate("/pricing")
                                                    }
                                                >
                                                    {b()?.status === "past_due"
                                                        ? "Fix billing →"
                                                        : "Manage plan →"}
                                                </button>
                                            }
                                        />
                                        <StatCard
                                            label="AI credits left"
                                            value={creditsLeft().toLocaleString()}
                                            meter={{
                                                value: creditsLeft(),
                                                max: b()?.credits.monthlyGrant ?? 1,
                                            }}
                                            caption={`+${(b()?.credits.monthlyGrant ?? 0).toLocaleString()} a month · you used ${(
                                                b()?.credits.mySpend ?? 0
                                            ).toLocaleString()} this cycle`}
                                        />
                                        <StatCard
                                            label="Seats"
                                            value={`${seatsUsed()} / ${seats()}`}
                                            meter={{ value: seatsUsed(), max: seats() }}
                                            action={
                                                <Show when={isOwner()}>
                                                    <button
                                                        class="text-[12px] font-semibold text-soft underline hover:text-ink"
                                                        onClick={() => navigate("/pricing")}
                                                    >
                                                        Add seats →
                                                    </button>
                                                </Show>
                                            }
                                        />
                                        <StatCard
                                            label="Storage"
                                            value={storageValue()}
                                            meter={
                                                unlimited(b()?.usage.maxStorageMb ?? 0)
                                                    ? undefined
                                                    : {
                                                          value: b()?.usage.storageMb ?? 0,
                                                          max: b()?.usage.maxStorageMb ?? 1,
                                                      }
                                            }
                                            caption={artifactsCaption()}
                                        />
                                    </div>
                                </Section>

                                <Section title="Members">
                                    <Show when={isAdmin()}>
                                        <form
                                            class="mb-2 flex items-start gap-2"
                                            onSubmit={submitInvite}
                                        >
                                            <TextField
                                                type="email"
                                                placeholder="teammate@company.com"
                                                value={email()}
                                                onChange={setEmail}
                                                class="flex-1"
                                            />
                                            {/* the plain trigger is w-full; unboxed it starves the email field */}
                                            <div class="w-28 flex-none">
                                                <Dropdown
                                                    value={inviteRole()}
                                                    options={[
                                                        { label: "Member", value: "member" },
                                                        { label: "Admin", value: "admin" },
                                                    ]}
                                                    onChange={(v) =>
                                                        setInviteRole(
                                                            v === "admin" ? "admin" : "member",
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Button
                                                type="submit"
                                                variant="primary"
                                                disabled={busy() || !email().trim()}
                                            >
                                                <Show when={busy()}>
                                                    <Spinner size={13} tone="current" />
                                                </Show>
                                                {busy() ? "Inviting…" : "Invite"}
                                            </Button>
                                        </form>
                                        <Show when={error()}>
                                            <p class="mb-3 text-[12.5px] text-accent">{error()}</p>
                                        </Show>
                                        <Show when={lastInvite()}>
                                            {(inv) => (
                                                <div class="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[12.5px] text-ink">
                                                    {inv().sent
                                                        ? "Invite sent."
                                                        : "Invite created (email isn't configured on this server)."}{" "}
                                                    Share this link, which works once:
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
                                                    <Avatar
                                                        src={m.avatarUrl}
                                                        name={m.name}
                                                        email={m.email}
                                                    />
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
                                                    <Show
                                                        when={isOwner() && !m.isOwner}
                                                        fallback={
                                                            <span class="flex-none text-[11px] font-semibold uppercase tracking-wide text-muted">
                                                                {roleLabel[m.role]}
                                                            </span>
                                                        }
                                                    >
                                                        <Dropdown
                                                            value={m.role}
                                                            options={[
                                                                {
                                                                    label: "Member",
                                                                    value: "member",
                                                                },
                                                                { label: "Admin", value: "admin" },
                                                            ]}
                                                            compact
                                                            onChange={(v) =>
                                                                void setMemberRole(
                                                                    m.userId,
                                                                    v === "admin"
                                                                        ? "admin"
                                                                        : "member",
                                                                ).catch(() => {})
                                                            }
                                                        />
                                                        <button
                                                            class="flex-none text-[12px] font-medium text-soft underline hover:text-ink"
                                                            title="Make workspace owner"
                                                            onClick={() =>
                                                                setConfirm({
                                                                    kind: "transfer",
                                                                    member: m,
                                                                })
                                                            }
                                                        >
                                                            Transfer
                                                        </button>
                                                    </Show>
                                                    <Show
                                                        when={
                                                            isAdmin() &&
                                                            !m.isOwner &&
                                                            (isOwner() || m.role !== "admin")
                                                        }
                                                    >
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
                                                            Invited · expires{" "}
                                                            {new Date(
                                                                inv.expiresAt,
                                                            ).toLocaleDateString()}
                                                        </span>
                                                    </span>
                                                    <button
                                                        class="flex-none text-[12px] font-medium text-soft underline hover:text-ink"
                                                        onClick={() =>
                                                            void inviteMember(inv.email).catch(
                                                                () => {},
                                                            )
                                                        }
                                                    >
                                                        Resend
                                                    </button>
                                                    <button
                                                        class="flex-none text-[12px] font-medium text-soft underline hover:text-ink"
                                                        onClick={() =>
                                                            void revokeInvite(inv.id).catch(
                                                                () => {},
                                                            )
                                                        }
                                                    >
                                                        Revoke
                                                    </button>
                                                </li>
                                            )}
                                        </For>
                                    </ul>
                                </Section>

                                <Section title="Credit activity">
                                    <Show
                                        when={ledger().length}
                                        fallback={
                                            <p class="text-[12.5px] text-muted">
                                                No credit activity yet.
                                            </p>
                                        }
                                    >
                                        <ul class="divide-y divide-line rounded-xl border border-line bg-panel">
                                            <For each={ledger()}>
                                                {(e) => (
                                                    <li class="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                                                        <span class="min-w-0 flex-1">
                                                            <span class="block truncate font-medium">
                                                                {reasonLabel(e.reason)}
                                                            </span>
                                                            <span class="block text-[11px] text-muted">
                                                                {e.user?.name ??
                                                                    e.user?.email ??
                                                                    "System"}{" "}
                                                                · {new Date(e.at).toLocaleString()}
                                                                <Show when={e.usage}>
                                                                    {(u) => (
                                                                        <> · {describeUsage(u())}</>
                                                                    )}
                                                                </Show>
                                                            </span>
                                                        </span>
                                                        <span
                                                            class={`flex-none font-mono tabular-nums ${e.delta > 0 ? "text-accent" : "text-soft"}`}
                                                        >
                                                            {e.delta > 0 ? "+" : ""}
                                                            {e.delta.toLocaleString()}
                                                        </span>
                                                        <span class="w-16 flex-none text-right font-mono text-[11px] tabular-nums text-muted">
                                                            {e.balanceAfter.toLocaleString()}
                                                        </span>
                                                    </li>
                                                )}
                                            </For>
                                        </ul>
                                        <Show when={ledgerCursor()}>
                                            <Button
                                                variant="ghost"
                                                class="mt-2 text-[12px]"
                                                disabled={ledgerLoading()}
                                                onClick={() => void loadLedger(ledgerCursor())}
                                            >
                                                {ledgerLoading() ? "Loading…" : "Show older"}
                                            </Button>
                                        </Show>
                                    </Show>
                                </Section>
                            </>
                        )}
                    </Show>
                </div>
            </main>

            <Show when={confirm()}>
                {(c) => (
                    <ConfirmModal
                        title={
                            c().kind === "leave" ? "Leave this workspace?" : "Transfer ownership?"
                        }
                        body={
                            c().kind === "leave" ? (
                                <>You'll lose access to its artifacts until you're invited back.</>
                            ) : (
                                <>
                                    <span class="font-semibold">
                                        {(c() as { member: WorkspaceMember }).member.name ??
                                            (c() as { member: WorkspaceMember }).member.email}
                                    </span>{" "}
                                    becomes the owner and takes over billing. You stay on as an
                                    admin.
                                </>
                            )
                        }
                        confirmLabel={c().kind === "leave" ? "Leave" : "Transfer"}
                        danger
                        busy={acting()}
                        onConfirm={() => void runConfirm()}
                        onCancel={() => setConfirm(null)}
                    />
                )}
            </Show>
        </div>
    );
};
