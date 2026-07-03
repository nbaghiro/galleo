import type { ArtifactContent } from "@model/artifact";
import type { Component } from "solid-js";
import {
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
import { useNavigate, useParams } from "@solidjs/router";
import { resolveTheme } from "@themes/library";
import { fontStack } from "@themes/theme";
import { type ArtifactSummary } from "../data/api";
import { FORMAT_IDS, formatLabel, formatLabelPlural, relativeTime } from "../data/format";
import { appTheme } from "../theme/theme";
import { folders } from "../data/folders";
import { ConfirmModal } from "../components/ConfirmModal";
import {
    CheckIcon,
    ChevronDownIcon,
    CloseIcon,
    DuplicateIcon,
    FolderIcon,
    MoreIcon,
    SearchIcon,
    SparkleIcon,
    TrashIcon,
} from "../components/icons";
import {
    contents,
    artifacts,
    artifactsLoaded,
    duplicateArtifact,
    loadContents,
    loadLibrary,
    moveArtifact,
    moveArtifacts,
    removeArtifact,
    removeArtifacts,
    setDraggingArtifact,
} from "../data/library";
import { SectionThumb } from "../components/SectionThumb";
import { Sidebar } from "../components/Sidebar";

// One skeleton artifact behind the empty state — four silhouettes (deck / doc / site / accent deck) so the
// backdrop reads as a real library. Fills use `soft`/`accent` tints (mid-tones that stay legible on light
// AND dark themes, unlike `line` which vanishes on dark). Purely decorative.
const GhostCard: Component<{ variant: number }> = (p) => (
    <div class="flex min-h-[150px] flex-col gap-2.5 rounded-xl border border-soft/15 bg-panel p-3">
        <Switch>
            <Match when={p.variant === 0}>
                {/* deck — a big cover + title */}
                <div class="flex-1 rounded-lg bg-gradient-to-br from-soft/25 to-soft/6" />
                <div class="h-2 w-3/4 rounded-full bg-soft/30" />
            </Match>
            <Match when={p.variant === 1}>
                {/* doc — a header then body lines */}
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
                {/* site — a hero over a row of sections */}
                <div class="flex-1 rounded-lg bg-gradient-to-br from-soft/22 to-soft/6" />
                <div class="flex gap-1.5">
                    <div class="h-7 flex-1 rounded-md bg-soft/14" />
                    <div class="h-7 flex-1 rounded-md bg-soft/14" />
                    <div class="h-7 flex-1 rounded-md bg-soft/14" />
                </div>
            </Match>
            <Match when={p.variant === 3}>
                {/* deck — a cover with a hint of the brand accent */}
                <div class="flex-1 rounded-lg bg-gradient-to-br from-accent/30 to-accent/6" />
                <div class="h-2 w-2/3 rounded-full bg-soft/30" />
                <div class="h-1.5 w-2/5 rounded-full bg-soft/16" />
            </Match>
        </Switch>
    </div>
);

// The library's first-run empty state: a ghost gallery of faint artifacts fading toward the center,
// with a card that names the two ways to start — generate one, or begin from a template.
const EmptyLibrary: Component<{ onGenerate: () => void; onTemplates: () => void }> = (p) => (
    <div class="relative flex min-h-[540px] items-center justify-center overflow-hidden px-6 py-16">
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

        <div class="relative z-10 max-w-[440px] rounded-2xl border border-line bg-panel/95 px-9 py-8 text-center shadow-2xl backdrop-blur-sm">
            <div class="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                A clean slate
            </div>
            <h2
                class="font-display text-[24px] font-semibold text-ink"
                style={{ "text-wrap": "balance" }}
            >
                Nothing here yet — it fills up fast.
            </h2>
            <p class="mx-auto mt-2 max-w-[340px] text-[14px] text-soft">
                Spin up your first deck, doc, or site. Everything you make lands right here.
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
    const [loading, setLoading] = createSignal(!artifactsLoaded());
    const [query, setQuery] = createSignal("");
    const [fmt, setFmt] = createSignal("all");
    const [sort, setSort] = createSignal<"recent" | "az">("recent");

    onMount(() => {
        (async () => {
            if (!artifactsLoaded()) await loadLibrary();
            setLoading(false);
            await loadContents();
        })();
    });

    const folderId = (): string | undefined => params.id;
    const folder = createMemo(() => folders().find((f) => f.id === folderId()));
    // everything in scope (current folder, or all) — before search/format filters
    const scope = createMemo(() => {
        const fid = folderId();
        return fid ? artifacts().filter((d) => d.folderId === fid) : artifacts();
    });
    const shown = createMemo(() => {
        let list = scope();
        const q = query().trim().toLowerCase();
        if (q)
            list = list.filter(
                (d) =>
                    d.title.toLowerCase().includes(q) ||
                    (d.cover?.title ?? "").toLowerCase().includes(q),
            );
        if (fmt() !== "all") list = list.filter((d) => d.formatId === fmt());
        if (sort() === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
        return list;
    });
    const FORMATS: [string, string][] = [
        ["all", "All"],
        ...FORMAT_IDS.map((id): [string, string] => [id, formatLabelPlural(id)]),
    ];

    // --- multi-select: shift-click (or click while any is selected) toggles a card; a floating bar then
    // offers the only two batch actions on artifacts — move-to-folder and delete. ---
    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const [batchMenu, setBatchMenu] = createSignal(false);
    const isSelected = (id: string): boolean => selected().has(id);
    // The bar reflects what's actually on screen — a filter/folder change narrows it to visible cards.
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
        setBatchMenu(false);
    };
    const moveSelected = (folderId: string | null): void => {
        moveArtifacts(selectedVisible(), folderId);
        clearSelection();
    };
    // Esc clears an active selection.
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape" && selectMode()) clearSelection();
    };
    onMount(() => window.addEventListener("keydown", onKey));
    onCleanup(() => window.removeEventListener("keydown", onKey));

    // shared confirm modal for the card menu's destructive/duplicating actions + batch delete
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

    // one artifact = a draggable cover-photo card + a header (with a move menu) + a section carousel
    const Band: Component<{ d: ArtifactSummary }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(p.d.themeId).tokens;
        // Previews render in the app theme so the library reads as one cohesive set; each artifact's
        // saved theme is still shown as metadata + offered on open.
        const appTk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(appTheme()).tokens;
        const cv = (): NonNullable<ArtifactSummary["cover"]> => p.d.cover ?? {};
        const img = (): string | undefined => cv().image;
        const secs = () => p.d.sections ?? [];
        const content = (): ArtifactContent | undefined => contents()[p.d.id];
        const [menu, setMenu] = createSignal(false);
        const [askAt, setAskAt] = createSignal<{ x: number; y: number } | null>(null);
        // open in the saved theme normally; if the app theme differs, offer to view in it instead. The
        // choice popup opens at the click point (the cover OR the "Open" button), not a fixed corner.
        const open = (e: MouseEvent): void => {
            if (p.d.themeId === appTheme()) navigate(`/edit/${p.d.id}`);
            else setAskAt({ x: e.clientX, y: e.clientY });
        };
        const [hovered, setHovered] = createSignal(false);
        // Shift-click — or any click once a selection is active — toggles selection instead of opening.
        const onCardClick = (e: MouseEvent): void => {
            if (e.shiftKey || selectMode()) {
                e.preventDefault();
                toggleSelect(p.d.id);
                return;
            }
            open(e);
        };
        const openWith = (asApp: boolean): void => {
            setAskAt(null);
            navigate(asApp ? `/edit/${p.d.id}?as=app` : `/edit/${p.d.id}`);
        };
        return (
            <section
                class={`flex items-center gap-7 border-b border-line px-9 py-7 ${isSelected(p.d.id) ? "bg-accent/5" : ""}`}
            >
                <div
                    class="relative flex-none"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    <button
                        class="relative block h-[190px] w-[300px] overflow-hidden"
                        style={{
                            background: appTk().bg,
                            "box-shadow": "var(--shadow)",
                            "border-radius": "var(--radius)",
                        }}
                        draggable={true}
                        onDragStart={(e) => {
                            setDraggingArtifact(p.d.id);
                            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingArtifact(null)}
                        onClick={onCardClick}
                    >
                        {/* selection ring + checkbox — the checkbox shows on hover or once selecting is active */}
                        <Show when={isSelected(p.d.id)}>
                            <span
                                class="pointer-events-none absolute inset-0 z-10 border-2 border-accent"
                                style={{ "border-radius": "var(--radius)" }}
                            />
                        </Show>
                        {/* just the artifact's cover image — clean, no synthesized text overlay (the real slides
                            live in the carousel, the title/meta in the header beside it) */}
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
                            class={`absolute left-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-md border transition-colors ${
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
                    <Show when={askAt()}>
                        {(pos) => (
                            <>
                                <div class="fixed inset-0 z-40" onClick={() => setAskAt(null)} />
                                <div
                                    class="fixed z-50 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-xl"
                                    style={{
                                        left: `${Math.min(pos().x, window.innerWidth - 252)}px`,
                                        top: `${Math.min(pos().y, window.innerHeight - 130)}px`,
                                    }}
                                >
                                    <div class="px-2.5 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                        Open in…
                                    </div>
                                    <button
                                        class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-soft hover:bg-canvas"
                                        onClick={() => openWith(false)}
                                    >
                                        <span class="flex min-w-0 items-center gap-2">
                                            <span
                                                class="h-3 w-3 flex-none rounded-[3px]"
                                                style={{
                                                    background: resolveTheme(p.d.themeId).tokens
                                                        .accent,
                                                }}
                                            />
                                            <span class="truncate font-medium text-ink">
                                                {resolveTheme(p.d.themeId).name}
                                            </span>
                                        </span>
                                        <span class="flex-none text-[11px] text-muted">saved</span>
                                    </button>
                                    <button
                                        class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-soft hover:bg-canvas"
                                        onClick={() => openWith(true)}
                                    >
                                        <span class="flex min-w-0 items-center gap-2">
                                            <span
                                                class="h-3 w-3 flex-none rounded-[3px]"
                                                style={{
                                                    background:
                                                        resolveTheme(appTheme()).tokens.accent,
                                                }}
                                            />
                                            <span class="truncate font-medium text-ink">
                                                {resolveTheme(appTheme()).name}
                                            </span>
                                        </span>
                                        <span class="flex-none text-[11px] text-muted">
                                            app theme
                                        </span>
                                    </button>
                                </div>
                            </>
                        )}
                    </Show>
                </div>

                <div class="flex min-w-0 flex-1 flex-col gap-3.5">
                    <div class="flex items-center gap-3">
                        {/* Theme indicator: an "Aa" specimen in the artifact's saved theme — its display
                            font, palette (surface/ink/accent) and corner radius, so each theme reads
                            distinctly at a glance. */}
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
                            </div>
                        </div>
                        <div class="relative ml-auto flex-none">
                            <button
                                class="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink"
                                title="Move to folder"
                                onClick={() => setMenu((x) => !x)}
                            >
                                <MoreIcon size={16} />
                            </button>
                            <Show when={menu()}>
                                <div class="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                                <div class="absolute right-0 top-8 z-20 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                                    <button
                                        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-soft hover:bg-canvas"
                                        onClick={() => {
                                            setMenu(false);
                                            setConfirm({ kind: "duplicate", doc: p.d });
                                        }}
                                    >
                                        <span class="grid h-4 w-4 flex-none place-items-center text-muted">
                                            <DuplicateIcon size={15} />
                                        </span>{" "}
                                        Duplicate
                                    </button>
                                    <div class="my-1 h-px bg-line" />
                                    <div class="px-2.5 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                        Move to
                                    </div>
                                    <Show when={p.d.folderId}>
                                        <button
                                            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-soft hover:bg-canvas"
                                            onClick={() => {
                                                setMenu(false);
                                                moveArtifact(p.d.id, null);
                                            }}
                                        >
                                            ↑ Remove from folder
                                        </button>
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
                                                <button
                                                    class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${f.id === p.d.folderId ? "font-semibold text-accent" : "text-soft hover:bg-canvas"}`}
                                                    onClick={() => {
                                                        setMenu(false);
                                                        moveArtifact(p.d.id, f.id);
                                                    }}
                                                >
                                                    <span class="grid h-4 w-4 flex-none place-items-center">
                                                        <FolderIcon size={14} />
                                                    </span>
                                                    <span class="truncate">{f.name}</span>
                                                </button>
                                            )}
                                        </For>
                                    </div>
                                    <div class="my-1 h-px bg-line" />
                                    <button
                                        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-[#C0392B] hover:bg-[#C0392B]/10"
                                        onClick={() => {
                                            setMenu(false);
                                            setConfirm({ kind: "delete", doc: p.d });
                                        }}
                                    >
                                        <span class="grid h-4 w-4 flex-none place-items-center">
                                            <TrashIcon size={15} />
                                        </span>{" "}
                                        Delete
                                    </button>
                                </div>
                            </Show>
                        </div>
                        <button
                            class="flex-none text-[11.5px] font-semibold text-accent"
                            onClick={open}
                        >
                            Open →
                        </button>
                    </div>
                    <div class="flex gap-3 overflow-x-auto pb-2 pt-0.5">
                        <Show
                            when={content()}
                            fallback={
                                <Index each={Array.from({ length: secs().length || 6 })}>
                                    {() => (
                                        <div class="h-[99px] w-[176px] flex-none animate-pulse rounded-lg border border-line bg-line/40" />
                                    )}
                                </Index>
                            }
                        >
                            <For each={content()!.sections}>
                                {(sec, i) => (
                                    <SectionThumb
                                        section={sec}
                                        themeId={appTheme()}
                                        formatId={p.d.formatId}
                                        label={`Section ${i() + 1}`}
                                        onOpen={onCardClick}
                                    />
                                )}
                            </For>
                        </Show>
                    </div>
                </div>
            </section>
        );
    };

    return (
        <div class="flex h-full">
            <Sidebar />
            <main class="flex-1 overflow-y-auto bg-canvas">
                <div class="border-b border-line px-9 py-6">
                    <div class="flex flex-wrap items-end justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <Show when={folder()}>
                                <span class="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent/10 text-accent">
                                    <FolderIcon size={20} />
                                </span>
                            </Show>
                            <div>
                                <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                                    {folder() ? "Folder" : "Atelier Studio"}
                                </div>
                                <h1 class="mt-0.5 font-display text-[26px] font-semibold text-ink">
                                    {folder()?.name ?? "Library"}
                                </h1>
                                <p class="mt-0.5 text-[13px] text-muted">
                                    {shown().length === scope().length
                                        ? `${scope().length} ${scope().length === 1 ? "artifact" : "artifacts"}`
                                        : `${shown().length} of ${scope().length} artifacts`}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-soft">
                                <SearchIcon size={15} />
                                <input
                                    class="w-44 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
                                    placeholder="Search artifacts…"
                                    value={query()}
                                    onInput={(e) => setQuery(e.currentTarget.value)}
                                />
                            </div>
                            <button
                                class="rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] font-medium text-soft hover:text-ink"
                                onClick={() => setSort((s) => (s === "recent" ? "az" : "recent"))}
                            >
                                Sort:{" "}
                                <span class="text-ink">
                                    {sort() === "recent" ? "Recent" : "A–Z"}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-1.5">
                        <For each={FORMATS}>
                            {([k, label]) => (
                                <button
                                    class={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${fmt() === k ? "bg-accent text-onaccent" : "border border-line text-soft hover:bg-panel"}`}
                                    onClick={() => setFmt(k)}
                                >
                                    {label}
                                </button>
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
                                when={scope().length === 0 && !folderId()}
                                fallback={
                                    <div class="flex h-64 flex-col items-center justify-center gap-1 text-[13px] text-muted">
                                        <Show
                                            when={scope().length}
                                            fallback={
                                                <>
                                                    <span>This folder is empty.</span>
                                                    <span class="text-[12px]">
                                                        Drag artifacts onto this folder to add them.
                                                    </span>
                                                </>
                                            }
                                        >
                                            <span>No artifacts match your filters.</span>
                                            <button
                                                class="text-[12px] font-semibold text-accent"
                                                onClick={() => {
                                                    setQuery("");
                                                    setFmt("all");
                                                }}
                                            >
                                                Clear filters
                                            </button>
                                        </Show>
                                    </div>
                                }
                            >
                                <EmptyLibrary
                                    onGenerate={() => navigate("/new")}
                                    onTemplates={() => navigate("/templates")}
                                />
                            </Show>
                        }
                    >
                        <For each={shown()}>{(d) => <Band d={d} />}</For>
                    </Show>
                </Show>
            </main>

            {/* the batch action bar — appears whenever ≥1 artifact is selected; only two actions apply
                to a batch of artifacts: move them to a folder, or delete them. */}
            <Show when={selectMode()}>
                <div class="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-panel/95 px-2.5 py-2 shadow-2xl backdrop-blur-md">
                    <span class="px-2 text-[13px] font-semibold text-ink">
                        {selectedVisible().length} selected
                    </span>
                    <span class="mx-0.5 h-6 w-px bg-line" />
                    <div class="relative">
                        <button
                            class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-soft hover:bg-canvas hover:text-ink"
                            onClick={() => setBatchMenu((x) => !x)}
                        >
                            <FolderIcon size={15} /> Move to folder
                            <ChevronDownIcon size={12} />
                        </button>
                        <Show when={batchMenu()}>
                            <div class="fixed inset-0 z-10" onClick={() => setBatchMenu(false)} />
                            <div class="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                                <div class="px-2.5 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                    Move to
                                </div>
                                <button
                                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-soft hover:bg-canvas"
                                    onClick={() => moveSelected(null)}
                                >
                                    ↑ No folder
                                </button>
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
                                            <button
                                                class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-soft hover:bg-canvas"
                                                onClick={() => moveSelected(f.id)}
                                            >
                                                <span class="grid h-4 w-4 flex-none place-items-center">
                                                    <FolderIcon size={14} />
                                                </span>
                                                <span class="truncate">{f.name}</span>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </Show>
                    </div>
                    <button
                        class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#C0392B] hover:bg-[#C0392B]/10"
                        onClick={() => setConfirm({ kind: "delete-batch", ids: selectedVisible() })}
                    >
                        <TrashIcon size={15} /> Delete
                    </button>
                    <span class="mx-0.5 h-6 w-px bg-line" />
                    <button
                        class="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink"
                        title="Clear selection (Esc)"
                        onClick={clearSelection}
                    >
                        <CloseIcon size={15} />
                    </button>
                </div>
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
                                        {n} artifact{plural} will be moved to Trash — you can
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
