import type { Component } from "solid-js";
import {
    createEffect,
    createMemo,
    createResource,
    createSignal,
    For,
    onMount,
    Show,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { api, type ArtifactSummary, type LinkSummary, type Visibility } from "../api";
import { artifacts, formatLabel, loadLibrary, relativeTime } from "../stores/library";
import { links, loadLinks } from "../stores/links";
import { openShare, shareRequest } from "../share";
import { ArrowUpRightIcon, ChevronRightIcon, EditIcon, PlusIcon } from "@ui/icons";
import { Badge, Button, Chip, Eyebrow, IconButton } from "@ui/button";
import { EmptyState } from "@ui/status";
import { Modal } from "@ui/overlay";
import { TextField } from "@ui/inputs";
import { Sidebar } from "../components/Sidebar";

// The Shared tab — an aggregated view over the workspace's links (it IS the links list, filtered by type).
// A stat strip summarizes reach; type filters narrow the grid; each link leads with its live URL and
// carries a lightweight per-link insights view (audience, engagement, recipient opens).

// A merged row: a link + the artifact it points at (joined from the library store for cover/title/etc).
interface Item {
    link: LinkSummary;
    art: ArtifactSummary;
}

const AUDIENCE: Record<Visibility, { badge: string; blurb: string; glyph: GlyphName }> = {
    public: { badge: "Public", blurb: "Anyone with the link can view.", glyph: "globe" },
    protected: { badge: "Protected", blurb: "Opens with the link and a password.", glyph: "lock" },
    private: { badge: "Invite-only", blurb: "Only the people you invite by email.", glyph: "mail" },
};
const FILTERS: [string, string][] = [
    ["all", "All"],
    ["public", "Public"],
    ["protected", "Protected"],
    ["private", "Invite-only"],
];

type GlyphName = "globe" | "lock" | "mail" | "copy" | "eye";
const Glyph: Component<{ name: GlyphName; size?: number }> = (p) => {
    const s = (): number => p.size ?? 13;
    return (
        <svg
            width={s()}
            height={s()}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <Show when={p.name === "globe"}>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <ellipse cx="12" cy="12" rx="4" ry="9" />
            </Show>
            <Show when={p.name === "lock"}>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </Show>
            <Show when={p.name === "mail"}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
            </Show>
            <Show when={p.name === "copy"}>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </Show>
            <Show when={p.name === "eye"}>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
            </Show>
        </svg>
    );
};

const people = (n: number): string => `${n} ${n === 1 ? "person" : "people"}`;
const bareUrl = (url: string): string => url.replace(/^https?:\/\//, "");

export const SharedView: Component = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = createSignal(true);
    const [filter, setFilter] = createSignal<string>("all");
    const [picker, setPicker] = createSignal(false);
    const [insight, setInsight] = createSignal<Item | null>(null);
    const [query, setQuery] = createSignal("");
    const [copied, setCopied] = createSignal<string | null>(null);

    const refresh = async (): Promise<void> => {
        await Promise.all([loadLinks(), loadLibrary()]);
    };
    onMount(async () => {
        await refresh();
        setLoading(false);
    });

    // Re-pull whenever the Share modal closes — a publish / unpublish / recipient change should reflect here.
    let wasOpen = false;
    createEffect(() => {
        const open = shareRequest() !== null;
        if (wasOpen && !open) void refresh();
        wasOpen = open;
    });

    const items = createMemo((): Item[] =>
        links()
            .map((link) => ({ link, art: artifacts().find((a) => a.id === link.artifactId) }))
            .filter((x): x is Item => x.art !== undefined),
    );
    const countFor = (v: string): number =>
        v === "all" ? items().length : items().filter((x) => x.link.visibility === v).length;
    const shown = createMemo((): Item[] =>
        filter() === "all" ? items() : items().filter((x) => x.link.visibility === filter()),
    );

    const stats = createMemo(() => ({
        total: items().length,
        public: countFor("public"),
        protected: countFor("protected"),
        private: countFor("private"),
        people: links().reduce((s, l) => s + l.recipientCount, 0),
    }));

    const copy = (url: string): void => {
        void navigator.clipboard.writeText(url);
        setCopied(url);
        window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1600);
    };
    const share = (a: ArtifactSummary): void => {
        setPicker(false);
        setInsight(null);
        openShare({ artifactId: a.id, title: a.title });
    };
    const alreadyShared = (id: string): boolean => links().some((l) => l.artifactId === id);

    const pickList = createMemo(() => {
        const q = query().trim().toLowerCase();
        const list = q
            ? artifacts().filter((a) => a.title.toLowerCase().includes(q))
            : [...artifacts()];
        return list.sort((a, b) => Number(alreadyShared(a.id)) - Number(alreadyShared(b.id)));
    });

    // ── one link card ──
    const Card: Component<{ it: Item }> = (p) => {
        const meta = (): (typeof AUDIENCE)[Visibility] => AUDIENCE[p.it.link.visibility];
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(p.it.art.themeId).tokens;
        const isPrivate = (): boolean => p.it.link.visibility === "private";
        return (
            <div class="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-accent/40">
                <button
                    class="relative block h-[128px] w-full overflow-hidden text-left"
                    style={{ background: tk().bg }}
                    title="View insights"
                    onClick={() => setInsight(p.it)}
                >
                    <Show
                        when={p.it.art.cover?.image}
                        fallback={
                            <div
                                class="h-full w-full"
                                style={{
                                    background: `radial-gradient(120% 120% at 20% 0%, ${tk().accent}22, transparent 60%), ${tk().bg}`,
                                }}
                            />
                        }
                    >
                        <div
                            class="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
                            style={{
                                "background-image": `url(${p.it.art.cover!.image})`,
                                "background-size": "cover",
                                "background-position": "center",
                            }}
                        />
                    </Show>
                    <div class="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/25" />
                    <div class="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                        <Glyph name={meta().glyph} size={12} /> {meta().badge}
                    </div>
                    <div class="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-white/90 backdrop-blur-sm">
                        {formatLabel(p.it.art.formatId)}
                    </div>
                    <div class="absolute inset-x-3 bottom-2.5">
                        <div class="truncate font-display text-[16px] font-semibold text-white drop-shadow">
                            {p.it.art.title}
                        </div>
                    </div>
                </button>

                <div class="flex flex-1 flex-col p-3.5">
                    <div class="mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
                        <span>{resolveTheme(p.it.art.themeId).name}</span>
                        <span>·</span>
                        <span>shared {relativeTime(p.it.link.publishedAt)}</span>
                        <Show when={isPrivate()}>
                            <span>·</span>
                            <span class="text-accent">
                                {p.it.link.openedCount}/{p.it.link.recipientCount} opened
                            </span>
                        </Show>
                    </div>

                    <Show
                        when={!isPrivate()}
                        fallback={
                            <div class="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[11.5px] text-soft">
                                <Glyph name="mail" size={13} />
                                <span class="flex-1">
                                    {p.it.link.recipientCount
                                        ? `Invited ${people(p.it.link.recipientCount)}`
                                        : "No one invited yet"}
                                </span>
                                <button
                                    class="font-medium text-accent hover:underline"
                                    onClick={() => share(p.it.art)}
                                >
                                    Manage
                                </button>
                            </div>
                        }
                    >
                        <div class="flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                            <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-soft">
                                {bareUrl(p.it.link.url)}
                            </span>
                            <IconButton
                                size="sm"
                                tone="muted"
                                title={copied() === p.it.link.url ? "Copied" : "Copy link"}
                                onClick={() => copy(p.it.link.url)}
                            >
                                <span classList={{ "text-accent": copied() === p.it.link.url }}>
                                    <Glyph name="copy" size={13} />
                                </span>
                            </IconButton>
                            <a
                                href={p.it.link.url}
                                target="_blank"
                                rel="noopener"
                                class="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink"
                                title="Open public page"
                            >
                                <ArrowUpRightIcon size={14} />
                            </a>
                        </div>
                    </Show>

                    <div class="mt-2.5 flex items-center gap-1.5">
                        <Button variant="tool" size="sm" onClick={() => setInsight(p.it)}>
                            <Glyph name="eye" size={13} /> Insights
                        </Button>
                        <Button variant="tool" size="sm" onClick={() => share(p.it.art)}>
                            Manage
                        </Button>
                        <span class="flex-1" />
                        <IconButton
                            size="lg"
                            tone="muted"
                            title="Edit artifact"
                            onClick={() => navigate(`/edit/${p.it.art.id}`)}
                        >
                            <EditIcon size={15} />
                        </IconButton>
                    </div>
                </div>
            </div>
        );
    };

    const Stat: Component<{ label: string; value: number; accent?: boolean }> = (p) => (
        <div class="min-w-[110px] flex-1 rounded-xl border border-line bg-panel px-4 py-3">
            <div
                class="font-display text-[22px] font-semibold leading-none"
                classList={{ "text-accent": p.accent, "text-ink": !p.accent }}
            >
                {p.value}
            </div>
            <div class="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                {p.label}
            </div>
        </div>
    );

    return (
        <div class="flex h-full">
            <Sidebar />
            <main class="flex-1 overflow-y-auto bg-canvas">
                <div class="border-b border-line px-9 py-7">
                    <div class="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <Eyebrow tracking="widest" as="div">
                                Sharing
                            </Eyebrow>
                            <h1 class="mt-1 font-display text-[26px] font-semibold text-ink">
                                Shared
                            </h1>
                            <p class="mt-1 text-[13px] text-muted">
                                Every link you’ve published — filter by audience, and dig into each
                                one.
                            </p>
                        </div>
                        <Button variant="primary" onClick={() => setPicker(true)}>
                            <PlusIcon size={15} /> Share an artifact
                        </Button>
                    </div>

                    <Show when={!loading() && stats().total}>
                        <div class="mt-6 flex flex-wrap gap-3">
                            <Stat label="Live links" value={stats().total} accent />
                            <Stat label="Public" value={stats().public} />
                            <Stat label="Protected" value={stats().protected} />
                            <Stat label="Invite-only" value={stats().private} />
                            <Stat label="People invited" value={stats().people} />
                        </div>
                    </Show>
                </div>

                <Show
                    when={!loading()}
                    fallback={
                        <div class="flex h-64 items-center justify-center text-[13px] text-muted">
                            Loading…
                        </div>
                    }
                >
                    <Show
                        when={items().length}
                        fallback={
                            <EmptyState
                                class="h-[58vh]"
                                icon={
                                    <span class="opacity-40">
                                        <Glyph name="globe" size={30} />
                                    </span>
                                }
                                title="Nothing shared yet"
                                subtitle="Publish an artifact to a public, password-protected, or invite-only link — and track them all here."
                                action={
                                    <Button variant="primary" onClick={() => setPicker(true)}>
                                        <PlusIcon size={15} /> Share an artifact
                                    </Button>
                                }
                            />
                        }
                    >
                        {/* type filters */}
                        <div class="flex flex-wrap gap-2 border-b border-line px-9 py-4">
                            <For each={FILTERS}>
                                {([k, label]) => (
                                    <Chip
                                        variant="solid"
                                        size="md"
                                        selected={filter() === k}
                                        onClick={() => setFilter(k)}
                                    >
                                        {label}
                                        <span class="ml-1.5 opacity-60">{countFor(k)}</span>
                                    </Chip>
                                )}
                            </For>
                        </div>

                        <Show
                            when={shown().length}
                            fallback={
                                <div class="flex h-40 items-center justify-center text-[13px] text-muted">
                                    No {filter() === "all" ? "" : filter()} links.
                                </div>
                            }
                        >
                            <div
                                class="grid gap-4 px-9 py-6"
                                style={{
                                    "grid-template-columns":
                                        "repeat(auto-fill, minmax(300px, 1fr))",
                                }}
                            >
                                <For each={shown()}>{(it) => <Card it={it} />}</For>
                            </div>
                        </Show>
                    </Show>
                </Show>
            </main>

            <Show when={picker()}>
                <ArtifactPicker
                    list={pickList()}
                    query={query()}
                    onQuery={setQuery}
                    shared={alreadyShared}
                    onPick={share}
                    onClose={() => setPicker(false)}
                />
            </Show>

            <Show when={insight()}>
                {(it) => (
                    <InsightsModal
                        it={it()}
                        onManage={() => share(it().art)}
                        onEdit={() => navigate(`/edit/${it().art.id}`)}
                        onCopy={copy}
                        copied={copied()}
                        onClose={() => setInsight(null)}
                    />
                )}
            </Show>
        </div>
    );
};

// ── per-link insights: audience, the live link, and engagement (recipient opens for private links) ──
const InsightsModal: Component<{
    it: Item;
    onManage: () => void;
    onEdit: () => void;
    onCopy: (url: string) => void;
    copied: string | null;
    onClose: () => void;
}> = (p) => {
    const meta = AUDIENCE[p.it.link.visibility];
    const isPrivate = p.it.link.visibility === "private";
    // Full state (recipients + opened timestamps) is loaded on demand for the engagement table.
    const [state] = createResource(
        () => (isPrivate ? p.it.art.id : null),
        (id) => api.getLinkState(id).then((r) => r.link),
    );
    return (
        <Modal onClose={p.onClose} scrim="light" size="md" class="flex flex-col">
            <header class="flex items-center gap-3 border-b border-line px-5 py-4">
                <span class="grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent/12 text-accent">
                    <Glyph name={meta.glyph} size={16} />
                </span>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px] font-semibold text-ink">{p.it.art.title}</div>
                    <div class="text-[11.5px] text-muted">
                        {meta.badge} · shared {relativeTime(p.it.link.publishedAt)}
                    </div>
                </div>
                <Badge tone="outline" size="sm" uppercase>
                    {formatLabel(p.it.art.formatId)}
                </Badge>
            </header>

            <div class="px-5 py-4">
                {/* engagement tiles */}
                <div class="mb-4 grid grid-cols-3 gap-2.5">
                    <Show
                        when={isPrivate}
                        fallback={
                            <>
                                <Tile label="Audience" value={meta.badge} />
                                <Tile label="Format" value={formatLabel(p.it.art.formatId)} />
                                <Tile label="Theme" value={resolveTheme(p.it.art.themeId).name} />
                            </>
                        }
                    >
                        <Tile label="Invited" value={`${p.it.link.recipientCount}`} />
                        <Tile label="Opened" value={`${p.it.link.openedCount}`} accent />
                        <Tile
                            label="Open rate"
                            value={
                                p.it.link.recipientCount
                                    ? `${Math.round((p.it.link.openedCount / p.it.link.recipientCount) * 100)}%`
                                    : "—"
                            }
                        />
                    </Show>
                </div>

                {/* the live link */}
                <Show when={!isPrivate}>
                    <div class="mb-4 flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-soft">
                            {bareUrl(p.it.link.url)}
                        </span>
                        <IconButton
                            size="sm"
                            tone="muted"
                            title="Copy link"
                            onClick={() => p.onCopy(p.it.link.url)}
                        >
                            <span classList={{ "text-accent": p.copied === p.it.link.url }}>
                                <Glyph name="copy" size={13} />
                            </span>
                        </IconButton>
                        <a
                            href={p.it.link.url}
                            target="_blank"
                            rel="noopener"
                            class="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink"
                            title="Open public page"
                        >
                            <ArrowUpRightIcon size={14} />
                        </a>
                    </div>
                </Show>

                {/* recipient engagement (private) */}
                <Show when={isPrivate}>
                    <div class="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                        Recipients
                    </div>
                    <div class="max-h-[240px] overflow-y-auto rounded-lg border border-line">
                        <Show
                            when={state()?.recipients.length}
                            fallback={
                                <div class="px-3 py-4 text-center text-[12px] text-muted">
                                    {state.loading ? "Loading…" : "No one invited yet."}
                                </div>
                            }
                        >
                            <For each={state()!.recipients}>
                                {(r) => (
                                    <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
                                        <span class="min-w-0 flex-1 truncate">{r.email}</span>
                                        <Show
                                            when={r.lastViewedAt}
                                            fallback={
                                                <span class="text-[11px] text-muted">Invited</span>
                                            }
                                        >
                                            <span class="inline-flex items-center gap-1 text-[11px] text-accent">
                                                <Glyph name="eye" size={11} /> Opened{" "}
                                                {relativeTime(r.lastViewedAt!)}
                                            </span>
                                        </Show>
                                    </div>
                                )}
                            </For>
                        </Show>
                    </div>
                </Show>

                {/* traffic analytics seam — richer per-view metrics arrive with the Analytics feature */}
                <Show when={!isPrivate}>
                    <div class="rounded-lg border border-dashed border-line px-3 py-3 text-[11.5px] text-muted">
                        Views over time and top referrers arrive with{" "}
                        <span class="text-soft">Analytics</span>.
                    </div>
                </Show>

                <div class="mt-4 flex items-center gap-2">
                    <Button variant="primary" onClick={p.onManage}>
                        Manage sharing
                    </Button>
                    <Button variant="tool" size="sm" onClick={p.onEdit}>
                        Edit artifact
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

const Tile: Component<{ label: string; value: string; accent?: boolean }> = (p) => (
    <div class="rounded-lg border border-line bg-canvas px-3 py-2.5">
        <div
            class="truncate font-display text-[18px] font-semibold leading-none"
            classList={{ "text-accent": p.accent, "text-ink": !p.accent }}
        >
            {p.value}
        </div>
        <div class="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{p.label}</div>
    </div>
);

const ArtifactPicker: Component<{
    list: ArtifactSummary[];
    query: string;
    onQuery: (v: string) => void;
    shared: (id: string) => boolean;
    onPick: (a: ArtifactSummary) => void;
    onClose: () => void;
}> = (p) => (
    <Modal
        onClose={p.onClose}
        scrim="light"
        size="md"
        class="flex max-h-[80vh] flex-col overflow-hidden"
    >
        <header class="flex-none border-b border-line px-5 py-4">
            <div class="text-[14px] font-semibold text-ink">Share an artifact</div>
            <div class="mb-3 text-[11.5px] text-muted">
                Pick something to publish — choose its audience next.
            </div>
            <TextField
                value={p.query}
                onChange={p.onQuery}
                type="search"
                icon="search"
                placeholder="Search your artifacts…"
            />
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto">
            <Show
                when={p.list.length}
                fallback={
                    <div class="grid h-32 place-items-center text-[12px] text-muted">
                        No artifacts found.
                    </div>
                }
            >
                <For each={p.list}>
                    {(a) => {
                        const tk = (): ReturnType<typeof resolveTheme>["tokens"] =>
                            resolveTheme(a.themeId).tokens;
                        return (
                            <button
                                class="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-canvas"
                                onClick={() => p.onPick(a)}
                            >
                                <div
                                    class="h-9 w-14 flex-none overflow-hidden rounded-md border border-line"
                                    style={{ background: tk().bg }}
                                >
                                    <Show when={a.cover?.image}>
                                        <div
                                            class="h-full w-full"
                                            style={{
                                                "background-image": `url(${a.cover!.image})`,
                                                "background-size": "cover",
                                                "background-position": "center",
                                            }}
                                        />
                                    </Show>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <div class="truncate text-[13px] font-medium text-ink">
                                        {a.title}
                                    </div>
                                    <div class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                                        {formatLabel(a.formatId)} · {resolveTheme(a.themeId).name}
                                    </div>
                                </div>
                                <Show when={p.shared(a.id)}>
                                    <Badge tone="accentSoft" size="sm">
                                        Shared
                                    </Badge>
                                </Show>
                                <span class="text-muted">
                                    <ChevronRightIcon size={16} />
                                </span>
                            </button>
                        );
                    }}
                </For>
            </Show>
        </div>
    </Modal>
);
