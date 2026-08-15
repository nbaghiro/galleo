import type { Component } from "solid-js";
import {
    createEffect,
    createMemo,
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes";
import { api, type ArtifactSummary, type LinkSummary, type Visibility } from "@app/api";
import { artifacts, formatLabel, loadLibrary, relativeTime } from "@app/stores/library";
import { links, loadLinks } from "@app/stores/links";
import { fetchHits } from "@app/stores/search";
import { featuresState, loadFeatures } from "@app/stores/features";
import { openShare, shareRequest } from "@app/stores/share";
import {
    ArrowUpRightIcon,
    CheckIcon,
    ChevronRightIcon,
    CopyIcon,
    EditIcon,
    EyeIcon,
    GlobeIcon,
    LockIcon,
    MailIcon,
    PlusIcon,
} from "@ui/icons";
import { Badge, Button, Chip, Eyebrow, IconButton } from "@ui/button";
import { Modal } from "@ui/overlay";
import { TextField } from "@ui/inputs";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import { PreviewCanvas } from "@app/components/previews";

// an artifact with every link published for it: the Shared page's unit
interface Item {
    art: LinkSummary["artifact"];
    links: LinkSummary[];
}

const AUDIENCE: Record<
    Visibility,
    { badge: string; blurb: string; icon: Component<{ size?: number }> }
> = {
    public: { badge: "Public", blurb: "Anyone with the link can view.", icon: GlobeIcon },
    protected: { badge: "Protected", blurb: "Opens with the link and a password.", icon: LockIcon },
    private: {
        badge: "Invite-only",
        blurb: "Only the people you invite by email.",
        icon: MailIcon,
    },
};
const FILTERS: [string, string][] = [
    ["all", "All"],
    ["public", "Public"],
    ["protected", "Protected"],
    ["private", "Invite-only"],
];

// first-run empty: teaches the three audiences and carries the page's only CTA
// (the header button hides while there is nothing shared)
const EmptyShared: Component<{ onShare: () => void }> = (p) => (
    <div class="flex justify-center px-5 py-10 md:min-h-[52vh] md:items-center md:py-12">
        <div class="w-full max-w-105 sm:max-w-135">
            <div class="text-center">
                <span class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <GlobeIcon size={20} />
                </span>
                <h2 class="font-display text-[20px] font-semibold text-ink">Nothing shared yet</h2>
                <p class="mx-auto mt-1.5 max-w-75 text-[12.5px] leading-relaxed text-muted">
                    Pick an artifact, choose who can open it, and follow every view from here.
                </p>
            </div>
            <div class="mt-6 grid gap-2 sm:grid-cols-3">
                <For each={Object.values(AUDIENCE)}>
                    {(a) => (
                        <div class="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 sm:flex-col sm:gap-2.5 sm:px-4 sm:py-5 sm:text-center">
                            <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent/10 text-accent">
                                <Dynamic component={a.icon} size={15} />
                            </span>
                            <div class="min-w-0">
                                <div class="text-[12.5px] font-medium text-ink">{a.badge}</div>
                                <div class="mt-0.5 text-[11.5px] leading-snug text-muted">
                                    {a.blurb}
                                </div>
                            </div>
                        </div>
                    )}
                </For>
            </div>
            <div class="mt-6 flex justify-center">
                <Button variant="primary" class="w-full sm:w-auto" onClick={p.onShare}>
                    <PlusIcon size={15} /> Share an artifact
                </Button>
            </div>
        </div>
    </div>
);

const bareUrl = (url: string): string => url.replace(/^https?:\/\//, "");
const viewsLabel = (n: number): string => `${n} view${n === 1 ? "" : "s"}`;
const linksLabel = (n: number): string => `${n} link${n === 1 ? "" : "s"}`;
const fmtSeconds = (s: number): string =>
    s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
const linkTitle = (l: LinkSummary): string => l.name ?? `${AUDIENCE[l.visibility].badge} link`;

// last 30 days, zero-filled
const DayBars: Component<{ days: { day: string; views: number }[] }> = (p) => {
    const bars = createMemo((): { day: string; views: number }[] => {
        const byDay = new Map(p.days.map((d) => [d.day, d.views]));
        const out: { day: string; views: number }[] = [];
        for (let i = 29; i >= 0; i--) {
            const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
            out.push({ day, views: byDay.get(day) ?? 0 });
        }
        return out;
    });
    const max = (): number => Math.max(1, ...bars().map((b) => b.views));
    return (
        <div>
            <div class="flex h-20 items-end gap-0.5">
                <For each={bars()}>
                    {(b) => (
                        <div
                            class="flex h-full flex-1 flex-col justify-end"
                            title={`${b.day} — ${viewsLabel(b.views)}`}
                        >
                            <Show
                                when={b.views}
                                fallback={<div class="h-0.5 rounded-t-sm bg-line" />}
                            >
                                <div
                                    class="min-h-1 rounded-t-sm bg-accent"
                                    style={{ height: `${(b.views / max()) * 100}%` }}
                                />
                            </Show>
                        </div>
                    )}
                </For>
            </div>
            <div class="mt-1 flex justify-between font-mono text-[9px] text-muted">
                <span>{bars()[0]!.day}</span>
                <span>{bars()[29]!.day}</span>
            </div>
        </div>
    );
};

const SourceBars: Component<{ rows: { label: string; views: number }[] }> = (p) => {
    const max = (): number => Math.max(1, ...p.rows.map((r) => r.views));
    return (
        <div class="flex flex-col gap-1.5">
            <For each={p.rows}>
                {(r) => (
                    <div
                        class="flex items-center gap-2"
                        title={`${r.label} — ${viewsLabel(r.views)}`}
                    >
                        <span class="w-30 truncate text-[11.5px] text-ink">{r.label}</span>
                        <div class="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                            <div
                                class="h-full rounded-full bg-accent/60"
                                style={{ width: `${(r.views / max()) * 100}%` }}
                            />
                        </div>
                        <span class="w-6 text-right font-mono text-[10.5px] text-muted">
                            {r.views}
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
};

export const SharedView: Component = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = createSignal(true);
    const [filter, setFilter] = createSignal<string>("all");
    const [picker, setPicker] = createSignal(false);
    const [insight, setInsight] = createSignal<{ it: Item; focus: string | null } | null>(null);
    const [query, setQuery] = createSignal("");
    const [copied, setCopied] = createSignal<string | null>(null);

    const refresh = async (): Promise<void> => {
        // entitlements gate the insights pane, so re-pull to self-heal a boot-time failure
        await Promise.all([loadLinks(), loadLibrary(), loadFeatures()]);
    };
    onMount(async () => {
        await refresh();
        setLoading(false);
    });

    // re-pull when the Share modal closes so changes reflect here
    let wasOpen = false;
    createEffect(() => {
        const open = shareRequest() !== null;
        if (wasOpen && !open) void refresh();
        wasOpen = open;
    });

    // one item per artifact, links newest-first (the /links feed is already newest-first)
    const items = createMemo((): Item[] => {
        const byArtifact = new Map<string, LinkSummary[]>();
        for (const link of links()) {
            const list = byArtifact.get(link.artifactId);
            if (list) list.push(link);
            else byArtifact.set(link.artifactId, [link]);
        }
        const out: Item[] = [];
        for (const [, ls] of byArtifact) {
            // the artifact metadata rides along on the link row, so this page never needs the whole library
            const art = ls[0]?.artifact;
            if (art) out.push({ art, links: ls });
        }
        return out;
    });
    const linkCountFor = (v: string): number =>
        v === "all" ? links().length : links().filter((l) => l.visibility === v).length;
    const shown = createMemo((): Item[] =>
        filter() === "all"
            ? items()
            : items().filter((x) => x.links.some((l) => l.visibility === filter())),
    );

    const stats = createMemo(() => ({
        total: links().length,
        public: linkCountFor("public"),
        protected: linkCountFor("protected"),
        private: linkCountFor("private"),
        people: links().reduce((s, l) => s + l.recipientCount, 0),
        views: links().reduce((s, l) => s + l.viewCount, 0),
    }));

    const copy = (url: string): void => {
        void navigator.clipboard.writeText(url);
        setCopied(url);
        window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1600);
    };
    const share = (a: { id: string; title: string }): void => {
        setPicker(false);
        setInsight(null);
        openShare({ artifactId: a.id, title: a.title });
    };
    const alreadyShared = (id: string): boolean => links().some((l) => l.artifactId === id);

    // the picker searches the whole workspace rather than the page the library happens to hold
    const [found, setFound] = createSignal<ArtifactSummary[] | null>(null);
    createEffect(() => {
        const q = query().trim();
        if (!q) {
            setFound(null);
            return;
        }
        const ctrl = new AbortController();
        const t = window.setTimeout(() => {
            fetchHits(q, ctrl.signal, 24)
                .then((hits) => !ctrl.signal.aborted && setFound(hits))
                .catch(() => {
                    /* fall back to the loaded page */
                });
        }, 160);
        onCleanup(() => {
            ctrl.abort();
            window.clearTimeout(t);
        });
    });
    const pickList = createMemo(() => {
        const q = query().trim().toLowerCase();
        const list =
            found() ??
            (q ? artifacts().filter((a) => a.title.toLowerCase().includes(q)) : [...artifacts()]);
        return [...list].sort((a, b) => Number(alreadyShared(a.id)) - Number(alreadyShared(b.id)));
    });

    const Card: Component<{ it: Item }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(p.it.art.themeId).tokens;
        const totalViews = (): number => p.it.links.reduce((s, l) => s + l.viewCount, 0);
        const rows = (): LinkSummary[] =>
            filter() === "all" ? p.it.links : p.it.links.filter((l) => l.visibility === filter());
        return (
            <div class="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-accent/40">
                <button
                    class="relative block h-32 w-full overflow-hidden text-left"
                    style={{ background: tk().bg }}
                    title="View insights"
                    onClick={() => setInsight({ it: p.it, focus: null })}
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
                        <Show
                            when={p.it.links.length === 1}
                            fallback={<>{linksLabel(p.it.links.length)}</>}
                        >
                            <Dynamic
                                component={AUDIENCE[p.it.links[0]!.visibility].icon}
                                size={12}
                            />{" "}
                            {AUDIENCE[p.it.links[0]!.visibility].badge}
                        </Show>
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
                        <span class="inline-flex items-center gap-1">
                            <EyeIcon size={11} /> {totalViews()}
                        </span>
                        <span>·</span>
                        <span>{linksLabel(p.it.links.length)}</span>
                        <span>·</span>
                        <span>shared {relativeTime(p.it.links[0]!.publishedAt)}</span>
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <For each={rows()}>
                            {(l) => (
                                <div
                                    class="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 transition-colors hover:border-accent/50"
                                    title="Link insights"
                                    onClick={() => setInsight({ it: p.it, focus: l.id })}
                                >
                                    <span class="flex-none text-accent">
                                        <Dynamic
                                            component={AUDIENCE[l.visibility].icon}
                                            size={13}
                                        />
                                    </span>
                                    <span class="min-w-0 flex-1 truncate text-[12px] text-ink">
                                        {linkTitle(l)}
                                    </span>
                                    <span class="inline-flex flex-none items-center gap-1 font-mono text-[10.5px] text-muted">
                                        <EyeIcon size={11} /> {l.viewCount}
                                    </span>
                                    <IconButton
                                        size="sm"
                                        tone="muted"
                                        class="flex-none"
                                        title={copied() === l.url ? "Copied" : "Copy link"}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copy(l.url);
                                        }}
                                    >
                                        <Show
                                            when={copied() === l.url}
                                            fallback={<CopyIcon size={12} />}
                                        >
                                            <span class="text-accent">
                                                <CheckIcon size={12} />
                                            </span>
                                        </Show>
                                    </IconButton>
                                    <a
                                        href={l.url}
                                        target="_blank"
                                        rel="noopener"
                                        class="grid h-6 w-6 flex-none place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink"
                                        title="Open link"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ArrowUpRightIcon size={13} />
                                    </a>
                                </div>
                            )}
                        </For>
                    </div>

                    <div class="mt-2.5 flex items-center gap-1.5">
                        <Button
                            variant="tool"
                            size="sm"
                            onClick={() => setInsight({ it: p.it, focus: null })}
                        >
                            <EyeIcon size={13} /> Insights
                        </Button>
                        <Button variant="tool" size="sm" onClick={() => share(p.it.art)}>
                            Manage
                        </Button>
                        <Button
                            variant="tool"
                            size="sm"
                            title="Create another link"
                            onClick={() => share(p.it.art)}
                        >
                            <PlusIcon size={13} />
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
        <div class="min-w-27.5 flex-1 rounded-xl border border-line bg-panel px-4 py-3">
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
            <main class="min-w-0 flex-1 overflow-y-auto bg-canvas">
                <SidebarToggle />
                <div class="border-b border-line px-5 py-7 md:px-9">
                    <div class="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <Eyebrow tracking="widest" as="div">
                                Sharing
                            </Eyebrow>
                            <h1 class="mt-1 font-display text-[26px] font-semibold text-ink">
                                Shared
                            </h1>
                            <p class="mt-1 text-[13px] text-muted">
                                Every artifact you’ve shared, its links, and how each one performs.
                            </p>
                        </div>
                        <Show when={!loading() && items().length}>
                            <Button variant="primary" onClick={() => setPicker(true)}>
                                <PlusIcon size={15} /> Share an artifact
                            </Button>
                        </Show>
                    </div>

                    <Show when={!loading() && stats().total}>
                        <div class="mt-6 flex flex-wrap gap-3">
                            <Stat label="Live links" value={stats().total} accent />
                            <Stat label="Total views" value={stats().views} accent />
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
                        fallback={<EmptyShared onShare={() => setPicker(true)} />}
                    >
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
                                        <span class="ml-1.5 opacity-60">{linkCountFor(k)}</span>
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
                                        "repeat(auto-fill, minmax(320px, 1fr))",
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
                {(sel) => (
                    <InsightsModal
                        it={sel().it}
                        focus={sel().focus}
                        onManage={() => share(sel().it.art)}
                        onEdit={() => navigate(`/edit/${sel().it.art.id}`)}
                        onCopy={copy}
                        copied={copied()}
                        onClose={() => setInsight(null)}
                    />
                )}
            </Show>
        </div>
    );
};

const InsightsModal: Component<{
    it: Item;
    focus: string | null;
    onManage: () => void;
    onEdit: () => void;
    onCopy: (url: string) => void;
    copied: string | null;
    onClose: () => void;
}> = (p) => {
    const navigate = useNavigate();
    // null = entitlements not loaded yet; never show a premature upsell
    const entitled = (): boolean | null => featuresState()?.features.analytics ?? null;
    const [sel, setSel] = createSignal<string>(p.focus ?? "all");
    const selLink = (): LinkSummary | null => p.it.links.find((l) => l.id === sel()) ?? null;
    const totalViews = (): number => p.it.links.reduce((s, l) => s + l.viewCount, 0);

    // full content for the section strip
    const [art] = createResource(
        () => p.it.art.id,
        (id) => api.getArtifact(id).then((r) => r.artifact),
    );
    const [data] = createResource(
        () => (entitled() ? sel() : null),
        (s) =>
            (s === "all" ? api.getArtifactAnalytics(p.it.art.id) : api.getLinkAnalytics(s)).catch(
                () => null,
            ),
    );

    const RailRow: Component<{
        id: string;
        icon?: Component<{ size?: number }>;
        label: string;
        views: number;
    }> = (r) => (
        <button
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
            classList={{
                "bg-accent/10 text-ink": sel() === r.id,
                "text-soft hover:bg-canvas hover:text-ink": sel() !== r.id,
            }}
            onClick={() => setSel(r.id)}
        >
            <Show when={r.icon} fallback={<span class="w-3.5 flex-none" />}>
                <span class="flex-none" classList={{ "text-accent": sel() === r.id }}>
                    <Dynamic component={r.icon!} size={13} />
                </span>
            </Show>
            <span class="min-w-0 flex-1 truncate text-[12.5px] font-medium">{r.label}</span>
            <span class="flex-none font-mono text-[10.5px] text-muted">{r.views}</span>
        </button>
    );

    // where "Copy link" should point when nudging a first share
    const copyTarget = (): string | undefined => selLink()?.url ?? p.it.links[0]?.url;

    return (
        <Modal
            onClose={p.onClose}
            scrim="light"
            size="full"
            class="flex h-[92vh] flex-col overflow-hidden"
        >
            <header class="flex flex-none items-center gap-3 border-b border-line px-5 py-3.5">
                <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px] font-semibold text-ink">{p.it.art.title}</div>
                    <div class="text-[11.5px] text-muted">
                        {linksLabel(p.it.links.length)} · {viewsLabel(totalViews())} · shared{" "}
                        {relativeTime(p.it.links[0]!.publishedAt)}
                    </div>
                </div>
                <span class="mr-9 flex-none">
                    <Badge tone="outline" size="sm" uppercase>
                        {formatLabel(p.it.art.formatId)}
                    </Badge>
                </span>
            </header>

            <div class="flex min-h-0 flex-1">
                <div class="min-w-0 flex-1 border-r border-line bg-canvas">
                    <Show
                        when={art()}
                        fallback={
                            <div class="grid h-full place-items-center text-[12px] text-muted">
                                Loading preview…
                            </div>
                        }
                    >
                        {(a) => (
                            <PreviewCanvas content={a().draftContent} format={() => a().formatId} />
                        )}
                    </Show>
                </div>

                <div class="flex w-80 flex-none flex-col">
                    <div class="min-h-0 flex-1 overflow-y-auto p-3.5">
                        <div class="mb-1.5 px-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                            Links
                        </div>
                        <RailRow id="all" label="All links" views={totalViews()} />
                        <For each={p.it.links}>
                            {(l) => (
                                <RailRow
                                    id={l.id}
                                    icon={AUDIENCE[l.visibility].icon}
                                    label={linkTitle(l)}
                                    views={l.viewCount}
                                />
                            )}
                        </For>
                        <button
                            class="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-accent transition-colors hover:bg-canvas"
                            onClick={p.onManage}
                        >
                            <PlusIcon size={13} /> New link
                        </button>

                        <div class="my-3 border-t border-line" />

                        <Show when={selLink()}>
                            {(l) => (
                                <div class="mb-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                                    <Badge tone="outline" size="sm">
                                        {AUDIENCE[l().visibility].badge}
                                    </Badge>
                                    <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-soft">
                                        {bareUrl(l().url)}
                                    </span>
                                    <IconButton
                                        size="sm"
                                        tone="muted"
                                        title={p.copied === l().url ? "Copied" : "Copy link"}
                                        onClick={() => p.onCopy(l().url)}
                                    >
                                        <Show
                                            when={p.copied === l().url}
                                            fallback={<CopyIcon size={13} />}
                                        >
                                            <span class="text-accent">
                                                <CheckIcon size={13} />
                                            </span>
                                        </Show>
                                    </IconButton>
                                    <a
                                        href={l().url}
                                        target="_blank"
                                        rel="noopener"
                                        class="grid h-6 w-6 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink"
                                        title="Open link"
                                    >
                                        <ArrowUpRightIcon size={14} />
                                    </a>
                                </div>
                            )}
                        </Show>

                        <Show
                            when={entitled() !== false}
                            fallback={
                                <div class="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-3">
                                    <span class="flex-1 text-[11.5px] text-muted">
                                        Views over time, top sources, and read-depth are included
                                        with Premium.
                                    </span>
                                    <Button
                                        variant="tool"
                                        size="sm"
                                        onClick={() => (p.onClose(), navigate("/pricing"))}
                                    >
                                        See plans
                                    </Button>
                                </div>
                            }
                        >
                            <Show
                                when={data()}
                                fallback={
                                    <div class="grid h-40 place-items-center text-[12px] text-muted">
                                        {entitled() === null || data.loading
                                            ? "Loading…"
                                            : "Analytics unavailable."}
                                    </div>
                                }
                            >
                                {(d) => (
                                    <>
                                        <Show
                                            when={d().totals.views}
                                            fallback={
                                                <div class="rounded-xl border border-dashed border-line px-4 py-6 text-center">
                                                    <span class="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
                                                        <EyeIcon size={16} />
                                                    </span>
                                                    <div class="text-[12.5px] font-medium text-ink">
                                                        No views yet
                                                    </div>
                                                    <p class="mx-auto mt-1 max-w-56 text-[11.5px] leading-relaxed text-muted">
                                                        Copy the link and share it — every visit
                                                        lands here live, with sources and
                                                        read-depth.
                                                    </p>
                                                    <Show when={copyTarget()}>
                                                        <Button
                                                            variant="tool"
                                                            size="sm"
                                                            class="mt-3"
                                                            onClick={() => p.onCopy(copyTarget()!)}
                                                        >
                                                            {p.copied === copyTarget()
                                                                ? "Copied"
                                                                : "Copy link"}
                                                        </Button>
                                                    </Show>
                                                </div>
                                            }
                                        >
                                            <div class="rounded-lg border border-line px-3 py-3">
                                                <div class="mb-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                                                    Views · last 30 days
                                                </div>
                                                <DayBars days={d().days} />
                                                <div class="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted">
                                                    <span>{viewsLabel(d().totals.views)}</span>
                                                    <Show when={d().totals.lastViewedAt}>
                                                        <span>·</span>
                                                        <span>
                                                            last viewed{" "}
                                                            {relativeTime(d().totals.lastViewedAt!)}
                                                        </span>
                                                    </Show>
                                                    <Show when={d().totals.avgSeconds !== null}>
                                                        <span>·</span>
                                                        <span>
                                                            {fmtSeconds(d().totals.avgSeconds!)} avg
                                                            on page
                                                        </span>
                                                    </Show>
                                                    <Show when={d().totals.completionPct !== null}>
                                                        <span>·</span>
                                                        <span>
                                                            {d().totals.completionPct}% read
                                                        </span>
                                                    </Show>
                                                </div>
                                            </div>
                                        </Show>

                                        <Show when={d().referrers.length}>
                                            <div class="mt-3 rounded-lg border border-line px-3 py-3">
                                                <div class="mb-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                                                    Top sources
                                                </div>
                                                <SourceBars
                                                    rows={d().referrers.map((r) => ({
                                                        label: r.source ?? "unknown",
                                                        views: r.views,
                                                    }))}
                                                />
                                                <Show when={d().devices.length}>
                                                    <div class="mt-2.5 font-mono text-[10.5px] text-muted">
                                                        {d()
                                                            .devices.map(
                                                                (x) => `${x.device} ${x.views}`,
                                                            )
                                                            .join(" · ")}
                                                    </div>
                                                </Show>
                                            </div>
                                        </Show>

                                        <Show when={d().recipients?.length}>
                                            <div class="mt-3 rounded-lg border border-line">
                                                <div class="border-b border-line px-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                                                    Recipients
                                                </div>
                                                <For each={d().recipients}>
                                                    {(r) => (
                                                        <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
                                                            <div class="min-w-0 flex-1">
                                                                <div class="truncate">
                                                                    {r.email}
                                                                </div>
                                                                <Show when={r.views}>
                                                                    <div class="font-mono text-[10px] text-muted">
                                                                        {viewsLabel(r.views)}
                                                                        <Show
                                                                            when={
                                                                                r.completionPct !==
                                                                                null
                                                                            }
                                                                        >
                                                                            {" "}
                                                                            · read {r.completionPct}
                                                                            %
                                                                        </Show>
                                                                    </div>
                                                                </Show>
                                                            </div>
                                                            <Show
                                                                when={r.lastViewedAt}
                                                                fallback={
                                                                    <span class="text-[11px] text-muted">
                                                                        Invited
                                                                    </span>
                                                                }
                                                            >
                                                                <span class="inline-flex items-center gap-1 text-[11px] text-accent">
                                                                    <EyeIcon size={11} /> Opened{" "}
                                                                    {relativeTime(r.lastViewedAt!)}
                                                                </span>
                                                            </Show>
                                                        </div>
                                                    )}
                                                </For>
                                            </div>
                                        </Show>
                                    </>
                                )}
                            </Show>
                        </Show>
                    </div>

                    <div class="flex flex-none gap-1.5 border-t border-line p-3.5">
                        <Button variant="primary" size="sm" class="flex-1" onClick={p.onManage}>
                            Manage sharing
                        </Button>
                        <Button variant="tool" size="sm" class="flex-1" onClick={p.onEdit}>
                            Edit artifact
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

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
