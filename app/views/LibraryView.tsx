import type { Section, SectionSummary } from "@model/artifact";
import { emptyRegion } from "@model/artifact";
import type { Component } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Index,
    Match,
    onCleanup,
    onMount,
    Show,
    Switch,
} from "solid-js";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { resolveTheme, fontStack } from "@themes";
import { type ArtifactSummary, type SearchHit } from "@app/api";
import {
    cardSection,
    FORMAT_IDS,
    formatLabel,
    formatLabelPlural,
    artifacts,
    artifactsLoaded,
    duplicateArtifact,
    ensureCardSections,
    loadLibrary,
    loadMoreArtifacts,
    moveArtifact,
    moveArtifacts,
    nextCursor,
    removeArtifact,
    removeArtifacts,
    setDraggingArtifact,
    type LibraryQuery,
} from "@app/stores/library";
import { relativeTime } from "@ui/time";
import type { ArtifactAccess } from "@model/artifact";
import { appTheme } from "@app/stores/theme";
import { openGenerate } from "@app/stores/generate";
import { folders } from "@app/stores/folders";
import { fetchHitPage, LIBRARY_LIMIT } from "@app/stores/search";
import { ConfirmModal, FloatingBar } from "@ui/overlay";
import { Button, Chip, Eyebrow, IconButton, Spinner } from "@ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@ui/menu";
import { Separator, TextField } from "@ui/inputs";
import { bindingLabel } from "@ui/keys";
import { EmptyState } from "@ui/status";
import {
    CheckIcon,
    ChevronDownIcon,
    CloseIcon,
    DuplicateIcon,
    FolderIcon,
    MoreIcon,
    SparkleIcon,
    TrashIcon,
} from "@ui/icons";
import { SectionThumb } from "@app/components/previews";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";

// fills use soft/accent tints, legible on light and dark unlike line
// only the levels worth saying out loud; edit is the norm and `none` never reaches the client
const limitedAccess = (access?: ArtifactAccess): string | undefined =>
    access === "comment" ? "Comment only" : access === "view" ? "View only" : undefined;

const TILE_W = 176;
const TILE_LEAD = "0px 400px"; // how far beyond the viewport a tile counts as worth loading
const TILE_SETTLE = 90; // ms of quiet before the visible tiles are asked for

const GhostCard: Component<{ variant: number }> = (p) => (
    <div class="flex min-h-37.5 flex-col gap-2.5 rounded-xl border border-soft/15 bg-panel p-3">
        <Switch>
            <Match when={p.variant === 0}>
                <div class="flex-1 rounded-lg bg-gradient-to-br from-soft/25 to-soft/6" />
                <div class="h-2 w-3/4 rounded-full bg-soft/30" />
            </Match>
            <Match when={p.variant === 1}>
                <div class="h-7 rounded-lg bg-soft/18" />
                <div class="flex flex-1 flex-col justify-center gap-1.5 py-1">
                    <div class="h-1.5 w-full rounded-full bg-soft/16" />
                    <div class="h-1.5 w-full rounded-full bg-soft/16" />
                    <div class="h-1.5 w-5/6 rounded-full bg-soft/16" />
                    <div class="h-1.5 w-2/3 rounded-full bg-soft/16" />
                </div>
                <div class="h-2 w-1/2 rounded-full bg-soft/28" />
            </Match>
            <Match when={p.variant === 2}>
                <div class="flex-1 rounded-lg bg-gradient-to-br from-soft/22 to-soft/6" />
                <div class="flex gap-1.5">
                    <div class="h-7 flex-1 rounded-md bg-soft/14" />
                    <div class="h-7 flex-1 rounded-md bg-soft/14" />
                    <div class="h-7 flex-1 rounded-md bg-soft/14" />
                </div>
            </Match>
            <Match when={p.variant === 3}>
                <div class="flex-1 rounded-lg bg-gradient-to-br from-accent/30 to-accent/6" />
                <div class="h-2 w-2/3 rounded-full bg-soft/30" />
                <div class="h-1.5 w-2/5 rounded-full bg-soft/16" />
            </Match>
        </Switch>
    </div>
);

const EmptyLibrary: Component<{ onGenerate: () => void; onTemplates: () => void }> = (p) => (
    <div class="relative flex min-h-135 items-center justify-center overflow-hidden px-6 py-16">
        <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 grid grid-cols-2 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            style={{
                "-webkit-mask-image":
                    "radial-gradient(115% 95% at 50% 46%, transparent 26%, #000 64%)",
                "mask-image": "radial-gradient(115% 95% at 50% 46%, transparent 26%, #000 64%)",
            }}
        >
            <Index each={Array.from({ length: 15 }, (_, i) => i % 4)}>
                {(v) => <GhostCard variant={v()} />}
            </Index>
        </div>

        <div class="relative z-raised max-w-110 rounded-2xl border border-line bg-panel/95 px-9 py-8 text-center shadow-2xl backdrop-blur-sm">
            <h2
                class="font-display text-[24px] font-semibold text-ink"
                style={{ "text-wrap": "balance" }}
            >
                Nothing here yet
            </h2>
            <p class="mx-auto mt-2 max-w-85 text-[14px] text-soft">
                Make a deck, a doc, or a site. Everything you create shows up here.
            </p>
            <div class="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <button
                    class="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-onaccent transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={p.onGenerate}
                >
                    <SparkleIcon size={15} /> Generate an artifact
                </button>
                <button
                    class="rounded-xl border border-line bg-canvas px-4 py-2.5 text-[13.5px] font-semibold text-soft transition hover:border-accent hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={p.onTemplates}
                >
                    Browse templates
                </button>
            </div>
        </div>
    </div>
);

export const LibraryView: Component = () => {
    const navigate = useNavigate();
    const params = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const [loading, setLoading] = createSignal(!artifactsLoaded());
    // ?q= carries a query in from ⌘K's "show all results"
    const [query, setQuery] = createSignal(
        typeof searchParams.q === "string" ? searchParams.q : "",
    );
    const [fmt, setFmt] = createSignal("all");
    const [sort, setSort] = createSignal<"recent" | "az">("recent");

    const folderId = (): string | undefined => params.id;
    const folder = createMemo(() => folders().find((f) => f.id === folderId()));

    // filters are server-side, so any change refetches page one
    createEffect(() => {
        const q: LibraryQuery = { folderId: folderId() ?? null, format: fmt(), sort: sort() };
        void loadLibrary(q).then(() => setLoading(false));
    });

    const setSearch = (v: string): void => {
        setQuery(v);
        setSearchParams({ q: v || null }, { replace: true });
    };

    // a query switches the list to ranked results, its own paged source
    const [hits, setHits] = createSignal<SearchHit[] | null>(null);
    const [hitsDone, setHitsDone] = createSignal(false);
    const [searching, setSearching] = createSignal(false);
    let debounce = 0;
    let inflight: AbortController | null = null;
    createEffect(() => {
        const q = query().trim();
        inflight?.abort();
        window.clearTimeout(debounce);
        if (!q) {
            setHits(null);
            setHitsDone(false);
            return;
        }
        const ctrl = new AbortController();
        inflight = ctrl;
        setSearching(true);
        debounce = window.setTimeout(() => {
            fetchHitPage(q, 0, LIBRARY_LIMIT, ctrl.signal)
                .then((page) => {
                    if (ctrl.signal.aborted) return;
                    setHits(page);
                    setHitsDone(page.length < LIBRARY_LIMIT);
                })
                .catch(() => {
                    /* keep the local pass; search degrades, it doesn't break */
                })
                .finally(() => {
                    if (!ctrl.signal.aborted) setSearching(false);
                });
        }, 160);
    });
    onCleanup(() => {
        inflight?.abort();
        window.clearTimeout(debounce);
    });

    const loadMoreHits = async (): Promise<void> => {
        const q = query().trim();
        const have = hits();
        if (!q || !have || hitsDone() || searching()) return;
        setSearching(true);
        try {
            const page = await fetchHitPage(q, have.length, LIBRARY_LIMIT);
            const seen = new Set(have.map((h) => h.id));
            setHits([...have, ...page.filter((h) => !seen.has(h.id))]);
            setHitsDone(page.length < LIBRARY_LIMIT);
        } catch {
            /* the sentinel will try again on the next intersection */
        } finally {
            setSearching(false);
        }
    };

    // instant pass over what is already loaded, until the server answers
    const localMatches = createMemo(() => {
        const q = query().trim().toLowerCase();
        if (!q) return [];
        return artifacts().filter(
            (d) =>
                d.title.toLowerCase().includes(q) ||
                (d.cover?.title ?? "").toLowerCase().includes(q),
        );
    });

    const shown = createMemo((): ArtifactSummary[] =>
        query().trim() ? (hits() ?? localMatches()) : artifacts(),
    );
    const exhausted = (): boolean => (query().trim() ? hitsDone() : !nextCursor());
    const loadMore = (): void => {
        if (query().trim()) void loadMoreHits();
        else void loadMoreArtifacts();
    };

    // any narrowing is on, so an empty list means "no matches" rather than "no artifacts"
    const filtering = (): boolean => !!query().trim() || fmt() !== "all";

    // one observer, re-pointed at whichever sentinel element is currently mounted
    let sentinelObserver: IntersectionObserver | null = null;
    const observeSentinel = (el: HTMLElement): void => {
        sentinelObserver?.disconnect();
        sentinelObserver = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) loadMore();
            },
            { rootMargin: "600px" },
        );
        sentinelObserver.observe(el);
    };
    onCleanup(() => sentinelObserver?.disconnect());

    // visible rows that matched only on body text
    const contentOnly = createMemo(() => {
        const q = query().trim().toLowerCase();
        if (!q) return 0;
        return shown().filter(
            (d) =>
                !d.title.toLowerCase().includes(q) &&
                !(d.cover?.title ?? "").toLowerCase().includes(q),
        ).length;
    });
    const FORMATS: [string, string][] = [
        ["all", "All"],
        ...FORMAT_IDS.map((id): [string, string] => [id, formatLabelPlural(id)]),
    ];

    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const isSelected = (id: string): boolean => selected().has(id);
    // a filter or folder change narrows the selection to what is on screen
    const selectedVisible = createMemo((): string[] => {
        const vis = new Set(shown().map((d) => d.id));
        return [...selected()].filter((id) => vis.has(id));
    });
    const selectMode = (): boolean => selectedVisible().length > 0;
    const toggleSelect = (id: string): void => {
        setSelected((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const clearSelection = (): void => {
        setSelected(new Set<string>());
    };
    const moveSelected = (folderId: string | null): void => {
        moveArtifacts(selectedVisible(), folderId);
        clearSelection();
    };
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape" && selectMode()) clearSelection();
    };
    onMount(() => window.addEventListener("keydown", onKey));
    onCleanup(() => window.removeEventListener("keydown", onKey));

    const [confirm, setConfirm] = createSignal<
        | { kind: "delete" | "duplicate"; doc: ArtifactSummary }
        | { kind: "delete-batch"; ids: string[] }
        | null
    >(null);
    const [acting, setActing] = createSignal(false);
    const runConfirm = async (): Promise<void> => {
        const c = confirm();
        if (!c) return;
        setActing(true);
        try {
            if (c.kind === "delete-batch") {
                removeArtifacts(c.ids);
                clearSelection();
            } else if (c.kind === "delete") removeArtifact(c.doc.id);
            else await duplicateArtifact(c.doc);
            setConfirm(null);
        } finally {
            setActing(false);
        }
    };

    const Band: Component<{ d: ArtifactSummary }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(p.d.themeId).tokens;
        // previews use the app theme for a cohesive set; saved theme shown as metadata
        const appTk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(appTheme()).tokens;
        const cv = (): NonNullable<ArtifactSummary["cover"]> => p.d.cover ?? {};
        const img = (): string | undefined => cv().image;
        // the digest names every section, so the strip is its full length from the first frame
        const secs = (): SectionSummary[] => p.d.sections ?? [];
        const tileId = (s: SectionSummary, i: number): string => s.id ?? `s${i}`;
        // opens in the artifact's saved theme; the editor offers "switch to app theme"
        const open = (): void => navigate(`/edit/${p.d.id}`);
        const [hovered, setHovered] = createSignal(false);

        // Each tile reports its own visibility, so what loads is what the viewer can actually see:
        // a wide monitor showing twelve tiles loads twelve, a phone showing two loads two. An
        // observer against the viewport already accounts for the strip's horizontal clipping, so one
        // observer covers both axes and neither needs tile geometry.
        const onScreen = new Set<string>();
        let settle = 0;
        const flush = (): void => {
            if (onScreen.size) void ensureCardSections(p.d.id, [...onScreen]);
        };
        const observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const id = (e.target as HTMLElement).dataset.tile;
                    if (!id) continue;
                    if (e.isIntersecting) onScreen.add(id);
                    else onScreen.delete(id);
                }
                window.clearTimeout(settle);
                settle = window.setTimeout(flush, TILE_SETTLE);
            },
            { rootMargin: TILE_LEAD },
        );
        const watchTile = (el: HTMLElement, id: string): void => {
            el.dataset.tile = id;
            observer.observe(el);
        };
        onCleanup(() => {
            observer.disconnect();
            window.clearTimeout(settle);
        });
        const onCardClick = (e: MouseEvent): void => {
            if (e.shiftKey || selectMode()) {
                e.preventDefault();
                toggleSelect(p.d.id);
                return;
            }
            open();
        };
        // stacked: children stretch, else the text column sizes to the strip's max-content
        return (
            <section
                class={`flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:gap-7 md:px-9 md:py-7 ${isSelected(p.d.id) ? "bg-accent/5" : ""}`}
            >
                <div
                    class="relative w-full flex-none sm:w-auto"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    <button
                        class="relative block aspect-[300/190] h-auto w-full overflow-hidden sm:h-47.5 sm:w-75"
                        style={{
                            background: appTk().bg,
                            "box-shadow": "var(--shadow)",
                            "border-radius": "var(--radius)",
                        }}
                        draggable={true}
                        onDragStart={(e) => {
                            setDraggingArtifact(p.d.id);
                            if (!e.dataTransfer) return;
                            e.dataTransfer.effectAllowed = "move";
                            // preview sits above the cursor (the spacer keeps the hotspot
                            // in-bounds) so the targeted folder row stays visible
                            const W = 200;
                            const H = 126;
                            const GAP = 18;
                            const ghost = document.createElement("div");
                            ghost.style.cssText = `position:fixed;left:-9999px;top:0;width:${W}px;height:${H + GAP}px;pointer-events:none;`;
                            const card = document.createElement("div");
                            card.style.cssText =
                                `width:${W}px;height:${H}px;border-radius:10px;overflow:hidden;` +
                                `border:1px solid ${appTk().line};background-color:${appTk().bg};` +
                                `background-image:${img() ? `url(${img()})` : `linear-gradient(150deg, ${appTk().surface}, ${appTk().bg})`};` +
                                `background-size:cover;background-position:center;`;
                            ghost.appendChild(card);
                            document.body.appendChild(ghost);
                            e.dataTransfer.setDragImage(ghost, W / 2, H + GAP);
                            window.setTimeout(() => ghost.remove(), 0);
                        }}
                        onDragEnd={() => setDraggingArtifact(null)}
                        onClick={onCardClick}
                    >
                        <Show when={isSelected(p.d.id)}>
                            <span
                                class="pointer-events-none absolute inset-0 z-raised border-2 border-accent"
                                style={{ "border-radius": "var(--radius)" }}
                            />
                        </Show>
                        <Show
                            when={img()}
                            fallback={
                                <div
                                    class="absolute inset-0 grid place-items-center"
                                    style={{
                                        background: `linear-gradient(150deg, ${appTk().surface}, ${appTk().bg})`,
                                    }}
                                >
                                    <span
                                        class="h-8 w-8 rounded-xl"
                                        style={{ background: appTk().accent, opacity: "0.9" }}
                                    />
                                </div>
                            }
                        >
                            <div
                                class="absolute inset-0"
                                style={{
                                    "background-image": `url(${img()})`,
                                    "background-size": "cover",
                                    "background-position": "center",
                                }}
                            />
                        </Show>
                    </button>
                    <Show when={hovered() || selectMode()}>
                        <button
                            class={`absolute left-2 top-2 z-panel grid h-6 w-6 place-items-center rounded-md border transition-colors ${
                                isSelected(p.d.id)
                                    ? "border-accent bg-accent text-onaccent"
                                    : "border-line bg-panel/90 text-transparent hover:border-accent hover:text-soft"
                            }`}
                            title={isSelected(p.d.id) ? "Deselect" : "Select"}
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                toggleSelect(p.d.id);
                            }}
                        >
                            <CheckIcon size={14} />
                        </button>
                    </Show>
                </div>

                <div class="flex min-w-0 flex-1 flex-col gap-3.5">
                    <div class="flex items-center gap-3">
                        {/* "Aa" specimen in the artifact's saved theme, not the app theme */}
                        <span
                            class="grid h-9 w-9 flex-none place-items-center"
                            style={{
                                background: tk().surface,
                                "font-family": fontStack("display", tk()),
                                "font-weight": `${tk().headingWeight}`,
                                "border-radius": `${Math.min(10, tk().radius)}px`,
                                "box-shadow": `inset 0 0 0 1px ${tk().line}`,
                            }}
                            title={`${resolveTheme(p.d.themeId).name} theme`}
                        >
                            <span class="text-[14px] leading-none" style={{ color: tk().ink }}>
                                A<span style={{ color: tk().accent }}>a</span>
                            </span>
                        </span>
                        <div class="min-w-0">
                            <div class="truncate text-[16px] font-semibold text-ink">
                                {p.d.title}
                            </div>
                            <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                                <span class="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-accent">
                                    {formatLabel(p.d.formatId)}
                                </span>
                                <span>·</span>
                                <span>{resolveTheme(p.d.themeId).name}</span>
                                <span>·</span>
                                <span>{secs().length} sections</span>
                                <span>·</span>
                                <span>{relativeTime(p.d.updatedAt)}</span>
                                <Show when={limitedAccess(p.d.access)}>
                                    {(label) => (
                                        <>
                                            <span>·</span>
                                            <span class="font-semibold text-soft">{label()}</span>
                                        </>
                                    )}
                                </Show>
                            </div>
                        </div>
                        <div class="ml-auto flex-none">
                            <Menu
                                align="end"
                                width={224}
                                trigger={(m) => (
                                    <IconButton
                                        ref={m.ref}
                                        size="md"
                                        rounded="md"
                                        tone="muted"
                                        title="Move to folder"
                                        onClick={m.toggle}
                                    >
                                        <MoreIcon size={16} />
                                    </IconButton>
                                )}
                            >
                                <MenuItem
                                    icon={<DuplicateIcon size={15} />}
                                    onClick={() => setConfirm({ kind: "duplicate", doc: p.d })}
                                >
                                    Duplicate
                                </MenuItem>
                                <MenuSeparator />
                                <MenuLabel>Move to</MenuLabel>
                                <Show when={p.d.folderId}>
                                    <MenuItem onClick={() => moveArtifact(p.d.id, null)}>
                                        ↑ Remove from folder
                                    </MenuItem>
                                </Show>
                                <div class="max-h-56 overflow-y-auto">
                                    <For
                                        each={folders()}
                                        fallback={
                                            <p class="px-2.5 py-1.5 text-[12px] text-muted">
                                                No folders yet.
                                            </p>
                                        }
                                    >
                                        {(f) => (
                                            <MenuItem
                                                icon={<FolderIcon size={14} />}
                                                selected={f.id === p.d.folderId}
                                                onClick={() => moveArtifact(p.d.id, f.id)}
                                            >
                                                {f.name}
                                            </MenuItem>
                                        )}
                                    </For>
                                </div>
                                <MenuSeparator />
                                <MenuItem
                                    tone="danger"
                                    icon={<TrashIcon size={15} />}
                                    onClick={() => setConfirm({ kind: "delete", doc: p.d })}
                                >
                                    Delete
                                </MenuItem>
                            </Menu>
                        </div>
                        <Button variant="link" class="flex-none text-[11.5px]" onClick={open}>
                            Open →
                        </Button>
                    </div>
                    <div class="flex items-center gap-3 overflow-x-auto overscroll-x-contain pb-2 pt-0.5">
                        <For each={secs()}>
                            {(summary, i) => {
                                const id = (): string => tileId(summary, i());
                                const loaded = (): Section | undefined => cardSection(p.d.id, id());
                                return (
                                    <span ref={(el) => watchTile(el, id())} class="flex-none">
                                        <SectionThumb
                                            section={loaded() ?? { id: id(), root: emptyRegion() }}
                                            ghost={loaded() ? undefined : summary}
                                            themeId={appTheme()}
                                            formatId={p.d.formatId}
                                            page={p.d.page}
                                            label={summary.title ?? `Section ${i() + 1}`}
                                            width={TILE_W}
                                            onOpen={onCardClick}
                                        />
                                    </span>
                                );
                            }}
                        </For>
                    </div>
                </div>
            </section>
        );
    };

    return (
        <div class="flex h-full">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto bg-canvas">
                <SidebarToggle />
                <div class="border-b border-line px-5 py-6 md:px-9">
                    <div class="flex flex-wrap items-end justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <Show when={folder()}>
                                <span class="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent/10 text-accent">
                                    <FolderIcon size={20} />
                                </span>
                            </Show>
                            <div>
                                <Eyebrow as="div" tracking="widest">
                                    {folder() ? "Folder" : "Atelier Studio"}
                                </Eyebrow>
                                <h1 class="mt-0.5 font-display text-[26px] font-semibold text-ink">
                                    {folder()?.name ?? "Library"}
                                </h1>
                                <p class="mt-0.5 text-[13px] text-muted">
                                    {`${shown().length}${exhausted() ? "" : "+"} ${
                                        shown().length === 1 ? "artifact" : "artifacts"
                                    }`}
                                    <Show when={contentOnly()}>
                                        {(n) => <> · {n()} matched inside</>}
                                    </Show>
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <TextField
                                icon="search"
                                class="w-56"
                                placeholder="Search artifacts…"
                                value={query()}
                                onChange={(v) => setSearch(v)}
                                trailing={
                                    // reads the live binding, so the hint can't outlive the shortcut
                                    <Show when={!query() && bindingLabel("view.commandPalette")}>
                                        {(label) => (
                                            <kbd
                                                class="flex-none rounded border border-line px-1 py-0.5 font-mono text-[10.5px] leading-none text-muted"
                                                title="Search everywhere"
                                            >
                                                {label()}
                                            </kbd>
                                        )}
                                    </Show>
                                }
                            />
                            <Show when={!query().trim()}>
                                <button
                                    class="rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] font-medium text-soft hover:text-ink"
                                    onClick={() =>
                                        setSort((s) => (s === "recent" ? "az" : "recent"))
                                    }
                                >
                                    Sort:{" "}
                                    <span class="text-ink">
                                        {sort() === "recent" ? "Recent" : "A–Z"}
                                    </span>
                                </button>
                            </Show>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-1.5">
                        <For each={FORMATS}>
                            {([k, label]) => (
                                <Chip
                                    variant="solid"
                                    size="md"
                                    selected={fmt() === k}
                                    onClick={() => setFmt(k)}
                                >
                                    {label}
                                </Chip>
                            )}
                        </For>
                    </div>
                </div>
                <Show
                    when={!loading()}
                    fallback={
                        <div class="flex h-full items-center justify-center text-[13px] text-muted">
                            Loading your studio…
                        </div>
                    }
                >
                    <Show
                        when={shown().length}
                        fallback={
                            <Show
                                when={filtering()}
                                fallback={
                                    <Show
                                        when={folderId()}
                                        fallback={
                                            <EmptyLibrary
                                                onGenerate={openGenerate}
                                                onTemplates={() => navigate("/templates")}
                                            />
                                        }
                                    >
                                        <EmptyState
                                            class="h-64"
                                            title="This folder is empty."
                                            subtitle="Drag artifacts onto this folder to add them."
                                        />
                                    </Show>
                                }
                            >
                                <EmptyState
                                    class="h-64"
                                    title="No artifacts match your filters."
                                    action={
                                        <Button
                                            variant="link"
                                            class="text-[12px]"
                                            onClick={() => {
                                                setSearch("");
                                                setFmt("all");
                                            }}
                                        >
                                            Clear filters
                                        </Button>
                                    }
                                />
                            </Show>
                        }
                    >
                        <For each={shown()}>{(d) => <Band d={d} />}</For>
                        {/* sentinel: crossing it requests the next page */}
                        <Show when={!exhausted()}>
                            <div
                                ref={(el) => observeSentinel(el)}
                                class="flex h-20 items-center justify-center text-[12px] text-muted"
                            >
                                <Spinner size={16} />
                            </div>
                        </Show>
                    </Show>
                </Show>
            </main>

            <Show when={selectMode()}>
                <FloatingBar
                    tone="panel"
                    rounded="2xl"
                    anchor="free"
                    class="fixed bottom-6 left-1/2 z-chrome -translate-x-1/2"
                >
                    <span class="px-2 text-[13px] font-semibold text-ink">
                        {selectedVisible().length} selected
                    </span>
                    <Separator vertical class="mx-0.5" />
                    <Menu
                        width={224}
                        trigger={(m) => (
                            <button
                                ref={m.ref}
                                class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-soft hover:bg-canvas hover:text-ink"
                                onClick={m.toggle}
                            >
                                <FolderIcon size={15} /> Move to folder
                                <ChevronDownIcon size={12} />
                            </button>
                        )}
                    >
                        <MenuLabel>Move to</MenuLabel>
                        <MenuItem onClick={() => moveSelected(null)}>↑ No folder</MenuItem>
                        <div class="max-h-56 overflow-y-auto">
                            <For
                                each={folders()}
                                fallback={
                                    <p class="px-2.5 py-1.5 text-[12px] text-muted">
                                        No folders yet.
                                    </p>
                                }
                            >
                                {(f) => (
                                    <MenuItem
                                        icon={<FolderIcon size={14} />}
                                        onClick={() => moveSelected(f.id)}
                                    >
                                        {f.name}
                                    </MenuItem>
                                )}
                            </For>
                        </div>
                    </Menu>
                    <button
                        class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#C0392B] hover:bg-[#C0392B]/10"
                        onClick={() => setConfirm({ kind: "delete-batch", ids: selectedVisible() })}
                    >
                        <TrashIcon size={15} /> Delete
                    </button>
                    <Separator vertical class="mx-0.5" />
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="muted"
                        title="Clear selection (Esc)"
                        onClick={clearSelection}
                    >
                        <CloseIcon size={15} />
                    </IconButton>
                </FloatingBar>
            </Show>

            <Show when={confirm()}>
                {(c) => {
                    const cur = c();
                    const isDup = cur.kind === "duplicate";
                    const isBatch = cur.kind === "delete-batch";
                    const n = cur.kind === "delete-batch" ? cur.ids.length : 0;
                    const plural = n === 1 ? "" : "s";
                    return (
                        <ConfirmModal
                            title={
                                isBatch
                                    ? `Delete ${n} artifact${plural}?`
                                    : isDup
                                      ? "Duplicate artifact?"
                                      : "Delete artifact?"
                            }
                            body={
                                cur.kind === "delete-batch" ? (
                                    <>
                                        {n} artifact{plural} will be moved to Trash, and you can
                                        restore
                                        {n === 1 ? " it" : " them"} from there.
                                    </>
                                ) : cur.kind === "delete" ? (
                                    <>
                                        “{cur.doc.title}” will be permanently deleted. This can’t be
                                        undone.
                                    </>
                                ) : (
                                    <>
                                        A copy of “{cur.doc.title}” will be added to your library
                                        {cur.doc.folderId ? " in the same folder" : ""}.
                                    </>
                                )
                            }
                            confirmLabel={isDup ? "Duplicate" : "Delete"}
                            danger={!isDup}
                            busy={acting()}
                            onConfirm={() => runConfirm()}
                            onCancel={() => setConfirm(null)}
                        />
                    );
                }}
            </Show>
        </div>
    );
};
