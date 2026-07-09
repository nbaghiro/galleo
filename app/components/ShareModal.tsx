import type { Component } from "solid-js";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api, type LinkState, type Visibility } from "../api";
import { closeShare, shareRequest, type ShareRequest } from "../share";
import { can, isComingSoon } from "../stores/features";
import { overlayThemeVars } from "../theme";
import { CheckIcon, CloseIcon } from "@ui/icons";
import { Modal } from "@ui/overlay";
import { Button, Chip, IconButton } from "@ui/button";
import { Segmented, TextField } from "@ui/inputs";
import { StatusDot } from "@ui/status";

// The unified Share modal — publish an artifact and manage its public link across all three access
// policies (public · protected · private) from one surface. Mounted once at the app root (like the theme
// editor + media picker); opened from the editor topbar via the `requestShare` bridge. Follows the theme
// editor's overlay conventions (light scrim, mount-on-open theming, segmented mode header).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (s: string): boolean => EMAIL_RE.test(s.trim());
const errText = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong");

const TYPES: { id: Visibility; label: string; hint: string }[] = [
    { id: "public", label: "Public", hint: "Anyone with the link can view." },
    { id: "protected", label: "Protected", hint: "Anyone with the link + the password." },
    { id: "private", label: "Private", hint: "Only the people you invite by email." },
];

export const ShareModal: Component = () => (
    <Show when={shareRequest()}>{(req) => <SharePanel req={req()} />}</Show>
);

const SharePanel: Component<{ req: ShareRequest }> = (props) => {
    const navigate = useNavigate();
    const vars = overlayThemeVars(); // stamp the editor theme at open (the modal never outlives a nav)

    const [link, setLink] = createSignal<LinkState | null>(null);
    const [loading, setLoading] = createSignal(true);
    const [vis, setVis] = createSignal<Visibility>("public");
    const [password, setPassword] = createSignal("");
    const [emailDraft, setEmailDraft] = createSignal("");
    const [pending, setPending] = createSignal<string[]>([]); // emails staged in the input as chips
    const [busy, setBusy] = createSignal(false);
    const [err, setErr] = createSignal("");
    const [copied, setCopied] = createSignal<string | null>(null);

    const gated = (): boolean => !can("publicLinks");
    const published = (): boolean => link() !== null;

    onMount(async () => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") closeShare();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
        try {
            const { link: l } = await api.getLinkState(props.req.artifactId);
            if (l) {
                setLink(l);
                setVis(l.visibility);
            }
        } catch {
            /* not published / signed out — start fresh */
        }
        setLoading(false);
    });

    const copy = (url: string): void => {
        void navigator.clipboard.writeText(url);
        setCopied(url);
        window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1600);
    };

    const reload = async (): Promise<void> => {
        const { link: l } = await api.getLinkState(props.req.artifactId);
        if (l) {
            setLink(l);
            setVis(l.visibility);
        }
    };

    // stage an email chip from the input (Enter / comma / blur)
    const stageEmail = (): void => {
        const e = emailDraft().trim().toLowerCase();
        if (isEmail(e) && !pending().includes(e)) setPending([...pending(), e]);
        setEmailDraft("");
    };

    // First publish (or re-publish from the unpublished state) with the chosen policy.
    const publish = async (): Promise<void> => {
        if (vis() === "protected" && !password() && !link()?.hasPassword) {
            setErr("Set a password for a protected link.");
            return;
        }
        setBusy(true);
        setErr("");
        try {
            await api.publishArtifact(props.req.artifactId, {
                visibility: vis(),
                password: vis() === "protected" && password() ? password() : undefined,
                recipients: vis() === "private" ? [...pending()] : undefined,
            });
            await reload();
            setPending([]);
            setPassword("");
        } catch (e) {
            setErr(errText(e));
        }
        setBusy(false);
    };

    // Change policy / password on an already-published link (no re-snapshot).
    const applyUpdate = async (patch: {
        visibility?: Visibility;
        password?: string | null;
    }): Promise<void> => {
        const l = link();
        if (!l) return;
        setBusy(true);
        setErr("");
        try {
            const { link: u } = await api.updateLink(l.id, patch);
            setLink({ ...l, ...u, recipients: l.recipients });
            setVis(u.visibility);
            setPassword("");
        } catch (e) {
            setErr(errText(e));
        }
        setBusy(false);
    };

    // Segmented-control click: stage locally when unpublished, else switch policy live (protected waits
    // for a password before it can take effect).
    const selectVis = (v: Visibility): void => {
        setVis(v);
        setErr("");
        if (!published()) return;
        if (v === "protected" && !link()!.hasPassword && !password()) return;
        void applyUpdate({
            visibility: v,
            password: v === "protected" && password() ? password() : null,
        });
    };

    // Re-snapshot the current draft into the live link (keeps the policy + recipients).
    const republish = async (): Promise<void> => {
        setBusy(true);
        setErr("");
        try {
            await api.publishArtifact(props.req.artifactId, {});
            await reload();
        } catch (e) {
            setErr(errText(e));
        }
        setBusy(false);
    };

    const unpublish = async (): Promise<void> => {
        setBusy(true);
        setErr("");
        try {
            await api.unpublishArtifact(props.req.artifactId);
            setLink(null);
            setVis("public");
        } catch (e) {
            setErr(errText(e));
        }
        setBusy(false);
    };

    // Send staged invites on a published private link.
    const invite = async (): Promise<void> => {
        const l = link();
        if (!l) return;
        stageEmail();
        const emails = pending();
        if (!emails.length) {
            setErr("Enter a valid email address.");
            return;
        }
        setBusy(true);
        setErr("");
        try {
            const { recipients } = await api.addRecipients(l.id, emails);
            setLink({ ...l, recipients: [...l.recipients, ...recipients] });
            setPending([]);
        } catch (e) {
            setErr(errText(e));
        }
        setBusy(false);
    };

    const revoke = async (rid: string): Promise<void> => {
        const l = link();
        if (!l) return;
        setLink({ ...l, recipients: l.recipients.filter((r) => r.id !== rid) }); // optimistic
        try {
            await api.removeRecipient(l.id, rid);
        } catch {
            void reload(); // put it back if the server disagreed
        }
    };

    const CopyBtn: Component<{ url: string }> = (p) => (
        <Button variant="tool" size="sm" onClick={() => copy(p.url)}>
            <Show when={copied() === p.url} fallback="Copy link">
                <span class="inline-flex items-center gap-1 text-accent">
                    <CheckIcon size={12} /> Copied
                </span>
            </Show>
        </Button>
    );

    return (
        <Modal
            onClose={() => closeShare()}
            scrim="light"
            size="md"
            z={60}
            vars={vars}
            class="flex max-h-[90vh] flex-col overflow-hidden"
        >
            <header class="flex flex-none items-center justify-between border-b border-line px-5 py-3.5">
                <div class="min-w-0">
                    <div class="text-[13px] font-semibold">Share</div>
                    <div class="truncate text-[11.5px] text-muted">{props.req.title}</div>
                </div>
                <IconButton
                    size="lg"
                    tone="muted"
                    class="flex-none"
                    title="Close"
                    onClick={() => closeShare()}
                >
                    <CloseIcon size={15} />
                </IconButton>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <Show when={!loading()} fallback={<Loading />}>
                    <Show when={!gated()} fallback={<Upgrade onGo={() => navigate("/pricing")} />}>
                        {/* ── access-policy segmented control ── */}
                        <Segmented
                            variant="accent"
                            value={vis()}
                            options={TYPES.map((t) => ({ label: t.label, value: t.id }))}
                            onChange={(v) => selectVis(v as Visibility)}
                        />
                        <p class="mb-3 mt-2 text-[11.5px] text-muted">
                            {TYPES.find((t) => t.id === vis())?.hint}
                        </p>

                        {/* ── protected: password ── */}
                        <Show when={vis() === "protected"}>
                            <div class="mb-3">
                                <TextField
                                    type="text"
                                    placeholder={
                                        link()?.hasPassword
                                            ? "Set a new password (leave blank to keep)"
                                            : "Set a password"
                                    }
                                    value={password()}
                                    onChange={setPassword}
                                />
                                <Show when={published()}>
                                    <Button
                                        variant="tool"
                                        size="sm"
                                        class="mt-2"
                                        disabled={busy() || !password()}
                                        onClick={() =>
                                            applyUpdate({
                                                visibility: "protected",
                                                password: password(),
                                            })
                                        }
                                    >
                                        {link()?.hasPassword ? "Change password" : "Set password"}
                                    </Button>
                                </Show>
                            </div>
                        </Show>

                        {/* ── private: recipient composer ── */}
                        <Show when={vis() === "private"}>
                            <div class="mb-3">
                                <div class="flex flex-wrap gap-1.5 rounded-lg border border-line bg-canvas px-2 py-2">
                                    <For each={pending()}>
                                        {(e) => (
                                            <Chip
                                                variant="soft"
                                                rounded="md"
                                                onRemove={() =>
                                                    setPending(pending().filter((x) => x !== e))
                                                }
                                            >
                                                {e}
                                            </Chip>
                                        )}
                                    </For>
                                    <input
                                        class="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-ink outline-none placeholder:text-muted"
                                        placeholder="Add people by email…"
                                        value={emailDraft()}
                                        onInput={(e) => setEmailDraft(e.currentTarget.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === ",") {
                                                e.preventDefault();
                                                stageEmail();
                                            }
                                        }}
                                        onBlur={() => stageEmail()}
                                    />
                                </div>
                                <Show when={published()}>
                                    <Button
                                        variant="tool"
                                        size="sm"
                                        class="mt-2"
                                        disabled={busy()}
                                        onClick={() => void invite()}
                                    >
                                        Send invites
                                    </Button>
                                </Show>
                            </div>

                            <Show when={published() && link()!.recipients.length}>
                                <div class="mb-3 rounded-lg border border-line">
                                    <For each={link()!.recipients}>
                                        {(r) => (
                                            <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
                                                <div class="min-w-0 flex-1">
                                                    <div class="truncate">{r.email}</div>
                                                    <div class="text-[10.5px] text-muted">
                                                        {r.lastViewedAt ? "Opened" : "Invited"}
                                                    </div>
                                                </div>
                                                <button
                                                    class="text-muted hover:text-accent"
                                                    title="Copy their link"
                                                    onClick={() => copy(r.url)}
                                                >
                                                    <Show when={copied() === r.url} fallback="Copy">
                                                        <span class="text-accent">Copied</span>
                                                    </Show>
                                                </button>
                                                <button
                                                    class="text-muted hover:text-ink"
                                                    title="Revoke access"
                                                    onClick={() => void revoke(r.id)}
                                                >
                                                    <CloseIcon size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </Show>

                        {/* ── the live link (public / protected) ── */}
                        <Show when={published() && vis() !== "private"}>
                            <div class="mb-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                                <span class="min-w-0 flex-1 truncate text-[12px] text-soft">
                                    {link()!.url}
                                </span>
                                <CopyBtn url={link()!.url} />
                            </div>
                        </Show>

                        <Show when={err()}>
                            <p class="mb-3 text-[12px] text-red-500">{err()}</p>
                        </Show>

                        {/* ── actions ── */}
                        <div class="flex items-center gap-2">
                            <Show
                                when={published()}
                                fallback={
                                    <Button
                                        variant="primary"
                                        loading={busy()}
                                        onClick={() => void publish()}
                                    >
                                        {busy() ? "Publishing…" : "Publish"}
                                    </Button>
                                }
                            >
                                <span class="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent">
                                    <StatusDot tone="accent" /> Live
                                </span>
                                <span class="flex-1" />
                                <Button
                                    variant="tool"
                                    size="sm"
                                    disabled={busy()}
                                    onClick={() => void republish()}
                                    title="Push the current draft to the live link"
                                >
                                    Update to current
                                </Button>
                                <Button
                                    variant="dangerGhost"
                                    size="sm"
                                    disabled={busy()}
                                    onClick={() => void unpublish()}
                                >
                                    Unpublish
                                </Button>
                            </Show>
                        </div>
                    </Show>
                </Show>
            </div>
        </Modal>
    );
};

const Loading: Component = () => (
    <div class="grid place-items-center py-10 text-[12px] text-muted">Loading…</div>
);

const Upgrade: Component<{ onGo: () => void }> = (props) => (
    <div class="py-4 text-center">
        <div class="mb-1 text-[14px] font-semibold">
            {isComingSoon("publicLinks")
                ? "Public links — coming soon"
                : "Publishing is a paid feature"}
        </div>
        <p class="mx-auto mb-4 max-w-[340px] text-[12px] leading-relaxed text-muted">
            Publish your work to a public, protected, or invite-only link. Available on Pro and
            Premium.
        </p>
        <Show when={!isComingSoon("publicLinks")}>
            <Button variant="primary" onClick={() => (closeShare(), props.onGo())}>
                See plans
            </Button>
        </Show>
    </div>
);
