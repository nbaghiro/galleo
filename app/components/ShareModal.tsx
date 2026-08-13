import type { Component } from "solid-js";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useNavigate } from "@solidjs/router";
import { api, type LinkState, type ShareRecipient, type Visibility } from "../api";
import { closeShare, shareRequest, type ShareRequest } from "../stores/share";
import { flushAutosave } from "../stores/save";
import { can, isComingSoon, loadFeatures } from "../stores/features";
import { relativeTime } from "../stores/library";
import { overlayThemeVars } from "../stores/theme";
import {
    ArrowUpRightIcon,
    CheckIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CloseIcon,
    CopyIcon,
    EyeIcon,
    GlobeIcon,
    LockIcon,
    MailIcon,
    PlusIcon,
} from "@ui/icons";
import { Modal } from "@ui/overlay";
import { Badge, Button, Chip, IconButton } from "@ui/button";
import { Segmented, TextField } from "@ui/inputs";
import { StatusDot } from "@ui/status";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (s: string): boolean => EMAIL_RE.test(s.trim());
const errText = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong");

const TYPES: { id: Visibility; label: string; hint: string; icon: Component<{ size?: number }> }[] =
    [
        { id: "public", label: "Public", hint: "Anyone with the link can view.", icon: GlobeIcon },
        {
            id: "protected",
            label: "Protected",
            hint: "Anyone with the link + the password.",
            icon: LockIcon,
        },
        {
            id: "private",
            label: "Private",
            hint: "Only the people you invite by email.",
            icon: MailIcon,
        },
    ];
const typeOf = (v: Visibility): (typeof TYPES)[number] => TYPES.find((t) => t.id === v)!;
const views = (n: number): string => `${n} view${n === 1 ? "" : "s"}`;

export const ShareModal: Component = () => (
    <Show when={shareRequest()}>{(req) => <SharePanel req={req()} />}</Show>
);

const SharePanel: Component<{ req: ShareRequest }> = (props) => {
    const navigate = useNavigate();
    const vars = overlayThemeVars(); // stamp the editor theme at open

    const [links, setLinks] = createSignal<LinkState[]>([]);
    const [loading, setLoading] = createSignal(true);
    const [creating, setCreating] = createSignal(false);
    const [expanded, setExpanded] = createSignal<string | null>(null);
    const [err, setErr] = createSignal("");
    const [copied, setCopied] = createSignal<string | null>(null);

    const gated = (): boolean => !can("publicLinks");

    onMount(async () => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") closeShare();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
        // re-pull entitlements with the links — a failed boot-time /features fetch must not gate the modal
        const [res] = await Promise.allSettled([
            api.getArtifactLinks(props.req.artifactId),
            loadFeatures(),
        ]);
        if (res.status === "fulfilled") setLinks(res.value.links);
        setLoading(false);
    });

    const copy = (url: string): void => {
        void navigator.clipboard.writeText(url);
        setCopied(url);
        window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1600);
    };

    const patchLink = (id: string, patch: Partial<LinkState>): void => {
        setLinks(links().map((l) => (l.id === id ? { ...l, ...patch } : l)));
    };

    const create = async (body: {
        name: string | null;
        visibility: Visibility;
        password?: string;
        recipients?: string[];
    }): Promise<boolean> => {
        setErr("");
        try {
            await flushAutosave(); // push edits still in the autosave debounce before the first view
            const { link } = await api.createLink(props.req.artifactId, body);
            setLinks([link, ...links()]);
            setCreating(false);
            setExpanded(null);
            return true;
        } catch (e) {
            setErr(errText(e));
            return false;
        }
    };

    const remove = async (id: string): Promise<void> => {
        setErr("");
        try {
            await api.deleteLink(id);
            setLinks(links().filter((l) => l.id !== id));
        } catch (e) {
            setErr(errText(e));
        }
    };

    return (
        <Modal
            onClose={() => closeShare()}
            scrim="light"
            size="md"
            vars={vars}
            class="flex max-h-[90vh] flex-col overflow-hidden"
        >
            <header class="flex flex-none items-center justify-between border-b border-line py-3.5 pl-5 pr-12">
                <div class="min-w-0">
                    <div class="text-[13px] font-semibold">Share</div>
                    <div class="truncate text-[11.5px] text-muted">{props.req.title}</div>
                </div>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <Show when={!loading()} fallback={<Loading />}>
                    <Show when={!gated()} fallback={<Upgrade onGo={() => navigate("/pricing")} />}>
                        <Show
                            when={links().length}
                            fallback={
                                <>
                                    <p class="mb-3 text-[12px] text-muted">
                                        Not shared yet — create a link to share this. Make as many
                                        links as you need: one per audience or channel, each with
                                        its own access and view stats.
                                    </p>
                                    <CreateForm onCreate={create} />
                                </>
                            }
                        >
                            <div class="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                                Share links
                            </div>
                            <div class="flex flex-col gap-2">
                                <For each={links()}>
                                    {(link) => (
                                        <LinkRow
                                            link={link}
                                            expanded={expanded() === link.id}
                                            onToggle={() =>
                                                setExpanded(expanded() === link.id ? null : link.id)
                                            }
                                            copied={copied()}
                                            onCopy={copy}
                                            onPatched={(p) => patchLink(link.id, p)}
                                            onDelete={() => void remove(link.id)}
                                            onError={setErr}
                                        />
                                    )}
                                </For>
                            </div>
                            <Show when={creating()}>
                                <div class="mt-3 rounded-xl border border-line bg-canvas p-3">
                                    <div class="mb-2 text-[12px] font-medium text-ink">
                                        New link
                                    </div>
                                    <CreateForm
                                        onCreate={create}
                                        onCancel={() => setCreating(false)}
                                    />
                                </div>
                            </Show>
                        </Show>

                        <Show when={err()}>
                            <p class="mt-3 text-[12px] text-red-500">{err()}</p>
                        </Show>

                        <Show when={links().length}>
                            <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                                <div class="flex items-center gap-1.5 text-[12px] font-medium text-accent">
                                    <StatusDot tone="accent" /> Sharing is on ·{" "}
                                    {links().length === 1 ? "1 link" : `${links().length} links`}
                                </div>
                                <Show when={!creating()}>
                                    <Button
                                        variant="tool"
                                        size="sm"
                                        class="flex-none"
                                        onClick={() => setCreating(true)}
                                    >
                                        <PlusIcon size={13} /> New link
                                    </Button>
                                </Show>
                            </div>
                        </Show>
                    </Show>
                </Show>
            </div>
        </Modal>
    );
};

const CreateForm: Component<{
    onCreate: (body: {
        name: string | null;
        visibility: Visibility;
        password?: string;
        recipients?: string[];
    }) => Promise<boolean>;
    onCancel?: () => void;
}> = (props) => {
    const [name, setName] = createSignal("");
    const [vis, setVis] = createSignal<Visibility>("public");
    const [password, setPassword] = createSignal("");
    const [emailDraft, setEmailDraft] = createSignal("");
    const [pending, setPending] = createSignal<string[]>([]); // emails staged as chips
    const [busy, setBusy] = createSignal(false);

    const stageEmail = (): void => {
        const e = emailDraft().trim().toLowerCase();
        if (isEmail(e) && !pending().includes(e)) setPending([...pending(), e]);
        setEmailDraft("");
    };

    const submit = async (): Promise<void> => {
        stageEmail();
        setBusy(true);
        const ok = await props.onCreate({
            name: name().trim() || null,
            visibility: vis(),
            password: vis() === "protected" && password() ? password() : undefined,
            recipients: vis() === "private" ? [...pending()] : undefined,
        });
        setBusy(false);
        if (ok) {
            setName("");
            setPassword("");
            setPending([]);
            setVis("public");
        }
    };

    return (
        <div>
            <TextField
                placeholder="Label, only you see it — e.g. “Investor update”"
                value={name()}
                onChange={setName}
            />
            <div class="mt-2">
                <Segmented
                    variant="accent"
                    value={vis()}
                    options={TYPES.map((t) => ({ label: t.label, value: t.id }))}
                    onChange={(v) => setVis(v as Visibility)}
                />
            </div>
            <p class="mb-2 mt-1.5 text-[11.5px] text-muted">{typeOf(vis()).hint}</p>

            <Show when={vis() === "protected"}>
                <TextField
                    type="password"
                    placeholder="Choose a password"
                    value={password()}
                    onChange={setPassword}
                />
            </Show>

            <Show when={vis() === "private"}>
                <EmailChips
                    pending={pending()}
                    draft={emailDraft()}
                    onDraft={setEmailDraft}
                    onStage={stageEmail}
                    onRemove={(e) => setPending(pending().filter((x) => x !== e))}
                />
            </Show>

            <div class="mt-2.5 flex items-center gap-2">
                <Button
                    variant="primary"
                    size="sm"
                    loading={busy()}
                    disabled={vis() === "protected" && !password()}
                    onClick={() => void submit()}
                >
                    {busy()
                        ? "Creating…"
                        : vis() === "private"
                          ? "Create link & invite"
                          : "Create link"}
                </Button>
                <Show when={props.onCancel}>
                    <Button variant="ghost" size="sm" onClick={() => props.onCancel!()}>
                        Cancel
                    </Button>
                </Show>
            </div>
        </div>
    );
};

const LinkRow: Component<{
    link: LinkState;
    expanded: boolean;
    onToggle: () => void;
    copied: string | null;
    onCopy: (url: string) => void;
    onPatched: (patch: Partial<LinkState>) => void;
    onDelete: () => void;
    onError: (msg: string) => void;
}> = (props) => {
    const [busy, setBusy] = createSignal(false);
    const [nameDraft, setNameDraft] = createSignal(props.link.name ?? "");
    const [password, setPassword] = createSignal("");
    const [stagedVis, setStagedVis] = createSignal<Visibility | null>(null); // protected pending its password
    const [emailDraft, setEmailDraft] = createSignal("");
    const [pending, setPending] = createSignal<string[]>([]);

    const vis = (): Visibility => stagedVis() ?? props.link.visibility;
    const isPrivate = (): boolean => props.link.visibility === "private";
    const title = (): string => props.link.name ?? `${typeOf(props.link.visibility).label} link`;
    const openedCount = (): number =>
        props.link.recipients.filter((r) => r.lastViewedAt !== null).length;

    const apply = async (patch: {
        name?: string | null;
        visibility?: Visibility;
        password?: string | null;
    }): Promise<void> => {
        setBusy(true);
        props.onError("");
        try {
            const { link: u } = await api.updateLink(props.link.id, patch);
            props.onPatched(u);
            setStagedVis(null);
            setPassword("");
        } catch (e) {
            props.onError(errText(e));
        }
        setBusy(false);
    };

    // switch live when possible; protected without a password stages until one is typed
    const selectVis = (v: Visibility): void => {
        if (v === props.link.visibility) {
            setStagedVis(null);
            return;
        }
        if (v === "protected" && !props.link.hasPassword && !password()) {
            setStagedVis(v);
            return;
        }
        void apply({
            visibility: v,
            password: v === "protected" && password() ? password() : null,
        });
    };

    const commitName = (): void => {
        const next = nameDraft().trim() || null;
        if (next !== props.link.name) void apply({ name: next });
    };

    const stageEmail = (): void => {
        const e = emailDraft().trim().toLowerCase();
        if (isEmail(e) && !pending().includes(e)) setPending([...pending(), e]);
        setEmailDraft("");
    };

    const invite = async (): Promise<void> => {
        stageEmail();
        const emails = pending();
        if (!emails.length) {
            props.onError("Enter a valid email address.");
            return;
        }
        setBusy(true);
        props.onError("");
        try {
            const { recipients } = await api.addRecipients(props.link.id, emails);
            props.onPatched({ recipients: [...props.link.recipients, ...recipients] });
            setPending([]);
        } catch (e) {
            props.onError(errText(e));
        }
        setBusy(false);
    };

    const revoke = async (r: ShareRecipient): Promise<void> => {
        props.onPatched({
            recipients: props.link.recipients.filter((x) => x.id !== r.id), // optimistic
        });
        try {
            await api.removeRecipient(props.link.id, r.id);
        } catch {
            props.onPatched({ recipients: props.link.recipients });
        }
    };

    return (
        <div class="rounded-xl border border-line bg-canvas">
            <div class="flex items-center gap-2 px-3 py-2.5">
                <span class="grid h-7 w-7 flex-none place-items-center rounded-lg bg-accent/12 text-accent">
                    <Dynamic component={typeOf(props.link.visibility).icon} size={14} />
                </span>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <span class="truncate text-[12.5px] font-medium text-ink">{title()}</span>
                        <Badge tone="outline" size="sm">
                            {typeOf(props.link.visibility).label}
                        </Badge>
                    </div>
                    <div class="flex items-center gap-1 font-mono text-[10.5px] text-muted">
                        <span class="inline-flex items-center gap-1">
                            <EyeIcon size={11} /> {views(props.link.viewCount)}
                        </span>
                        <Show when={isPrivate()}>
                            <span>·</span>
                            <span>
                                {openedCount()}/{props.link.recipients.length} opened
                            </span>
                        </Show>
                        <Show when={props.link.lastViewedAt}>
                            <span>·</span>
                            <span>viewed {relativeTime(props.link.lastViewedAt!)}</span>
                        </Show>
                    </div>
                </div>
                <Show when={!isPrivate()}>
                    <IconButton
                        size="sm"
                        tone="muted"
                        class="flex-none"
                        title={props.copied === props.link.url ? "Copied" : "Copy link"}
                        onClick={() => props.onCopy(props.link.url)}
                    >
                        <Show
                            when={props.copied === props.link.url}
                            fallback={<CopyIcon size={13} />}
                        >
                            <span class="text-accent">
                                <CheckIcon size={13} />
                            </span>
                        </Show>
                    </IconButton>
                    <a
                        href={props.link.url}
                        target="_blank"
                        rel="noopener"
                        class="grid h-6 w-6 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink"
                        title="Open link"
                    >
                        <ArrowUpRightIcon size={13} />
                    </a>
                </Show>
                <IconButton
                    size="sm"
                    tone="muted"
                    class="flex-none"
                    title={props.expanded ? "Collapse" : "Manage"}
                    onClick={() => props.onToggle()}
                >
                    <Show when={props.expanded} fallback={<ChevronDownIcon size={14} />}>
                        <ChevronUpIcon size={14} />
                    </Show>
                </IconButton>
            </div>

            <Show when={props.expanded}>
                <div class="border-t border-line px-3 py-2.5">
                    <Show when={!isPrivate()}>
                        <div class="mb-2.5 flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
                            <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink">
                                {props.link.url}
                            </span>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => props.onCopy(props.link.url)}
                            >
                                <Show when={props.copied === props.link.url} fallback="Copy">
                                    <span class="inline-flex items-center gap-1">
                                        <CheckIcon size={12} /> Copied
                                    </span>
                                </Show>
                            </Button>
                        </div>
                    </Show>

                    <TextField
                        placeholder="Label, only you see it"
                        value={nameDraft()}
                        onChange={setNameDraft}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitName();
                        }}
                    />

                    <div class="mt-2">
                        <Segmented
                            variant="accent"
                            value={vis()}
                            options={TYPES.map((t) => ({ label: t.label, value: t.id }))}
                            onChange={(v) => selectVis(v as Visibility)}
                        />
                    </div>
                    <p class="mb-2 mt-1.5 text-[11.5px] text-muted">{typeOf(vis()).hint}</p>

                    <Show when={vis() === "protected"}>
                        <div class="mb-2 flex items-center gap-2">
                            <div class="flex-1">
                                <TextField
                                    type="password"
                                    placeholder={
                                        props.link.hasPassword
                                            ? "Set a new password (leave blank to keep)"
                                            : "Choose a password"
                                    }
                                    value={password()}
                                    onChange={setPassword}
                                />
                            </div>
                            <Show when={password()}>
                                <Button
                                    variant="tool"
                                    size="sm"
                                    disabled={busy()}
                                    onClick={() =>
                                        void apply({
                                            visibility: "protected",
                                            password: password(),
                                        })
                                    }
                                >
                                    {props.link.hasPassword && !stagedVis()
                                        ? "Update password"
                                        : "Set password"}
                                </Button>
                            </Show>
                        </div>
                    </Show>

                    <Show when={vis() === "private" && !stagedVis()}>
                        <EmailChips
                            pending={pending()}
                            draft={emailDraft()}
                            onDraft={setEmailDraft}
                            onStage={stageEmail}
                            onRemove={(e) => setPending(pending().filter((x) => x !== e))}
                        />
                        <Button
                            variant="tool"
                            size="sm"
                            class="mt-2"
                            disabled={busy()}
                            onClick={() => void invite()}
                        >
                            Send invites
                        </Button>

                        <Show when={!props.link.recipients.length}>
                            <p class="mt-2.5 text-[11.5px] text-muted">
                                No one can view this yet — add people above to grant access.
                            </p>
                        </Show>
                        <Show when={props.link.recipients.length}>
                            <div class="mt-2.5 rounded-lg border border-line">
                                <For each={props.link.recipients}>
                                    {(r) => (
                                        <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
                                            <div class="min-w-0 flex-1">
                                                <div class="truncate">{r.email}</div>
                                                <div class="text-[10.5px] text-muted">
                                                    {r.lastViewedAt
                                                        ? `Opened ${relativeTime(r.lastViewedAt)}`
                                                        : "Invited"}
                                                </div>
                                            </div>
                                            <Button
                                                variant="tool"
                                                size="sm"
                                                title="Copy their link"
                                                onClick={() => props.onCopy(r.url)}
                                            >
                                                <Show when={props.copied === r.url} fallback="Copy">
                                                    <span class="text-accent">Copied</span>
                                                </Show>
                                            </Button>
                                            <IconButton
                                                size="sm"
                                                tone="muted"
                                                title="Revoke access"
                                                onClick={() => void revoke(r)}
                                            >
                                                <CloseIcon size={13} />
                                            </IconButton>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </Show>

                    <div class="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                        <span class="font-mono text-[10.5px] text-muted">
                            created {relativeTime(props.link.publishedAt)}
                        </span>
                        <Button
                            variant="dangerGhost"
                            size="sm"
                            disabled={busy()}
                            title="Delete this link — its URL stops working"
                            onClick={() => props.onDelete()}
                        >
                            Delete link
                        </Button>
                    </div>
                </div>
            </Show>
        </div>
    );
};

const EmailChips: Component<{
    pending: string[];
    draft: string;
    onDraft: (v: string) => void;
    onStage: () => void;
    onRemove: (email: string) => void;
}> = (props) => (
    <div class="flex flex-wrap gap-1.5 rounded-lg border border-line bg-canvas px-2 py-2">
        <For each={props.pending}>
            {(e) => (
                <Chip variant="soft" rounded="md" onRemove={() => props.onRemove(e)}>
                    {e}
                </Chip>
            )}
        </For>
        <input
            class="min-w-35 flex-1 bg-transparent px-1 py-0.5 text-[13px] text-ink outline-none placeholder:text-muted"
            placeholder="Add people by email…"
            value={props.draft}
            onInput={(e) => props.onDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    props.onStage();
                }
            }}
            onBlur={() => props.onStage()}
        />
    </div>
);

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
        <p class="mx-auto mb-4 max-w-85 text-[12px] leading-relaxed text-muted">
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
