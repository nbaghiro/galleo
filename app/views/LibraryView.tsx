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
import { resolveTheme, fontStack } from "@themes";
import { type ArtifactSummary } from "../api";
import {
    FORMAT_IDS,
    formatLabel,
    formatLabelPlural,
    relativeTime,
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
} from "../stores/library";
import { appTheme } from "../stores/theme";
import { openGenerate } from "../stores/generate";
import { folders } from "../stores/folders";
import { ConfirmModal, FloatingBar, Popover } from "@ui/overlay";
import { Button, Chip, Eyebrow, IconButton } from "@ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@ui/menu";
import { Separator, TextField } from "@ui/inputs";
import { EmptyState } from "@ui/status";
import { ThemeSwatch } from "@ui/color";
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
import { SectionThumb } from "../components/previews";
import { Sidebar } from "../components/Sidebar";

// fills use soft/accent tints — legible on light and dark, unlike line
const GhostCard: Component<{ variant: number }> = (p) => (
    <div class="flex min-h-[150px] flex-col gap-2.5 rounded-xl border border-soft/15 bg-panel p-3">
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

        <div class="relative z-raised max-w-[440px] rounded-2xl border border-line bg-panel/95 px-9 py-8 text-center shadow-2xl backdrop-blur-sm">
            <Eyebrow as="div" tracking="widest" class="mb-2">
                A clean slate
            </Eyebrow>
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
            // always revalidate on entry so editor edits + new artifacts show on return
            await loadLibrary();
            setLoading(false);
            await loadContents();
        })();
    });

    const folderId = (): string | undefined => params.id;
    const folder = createMemo(() => folders().find((f) => f.id === folderId()));
    // current folder (or all), before search/format filters
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

    // multi-select: shift-click toggles; batch actions are move-to-folder and delete
    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const isSelected = (id: string): boolean => selected().has(id);
    // reflect only on-screen cards — a filter/folder change narrows the selection
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

    // confirm modal for delete/duplicate + batch delete
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
        const secs = () => p.d.sections ?? [];
        const content = (): ArtifactContent | undefined => contents()[p.d.id];
        const [askAt, setAskAt] = createSignal<{ x: number; y: number } | null>(null);
        // open in the saved theme; if app theme differs, offer it — popup at the click point
        const open = (e: MouseEvent): void => {
            if (p.d.themeId === appTheme()) navigate(`/edit/${p.d.id}`);
            else setAskAt({ x: e.clientX, y: e.clientY });
        };
        const [hovered, setHovered] = createSignal(false);
        // shift-click, or any click while selecting, toggles instead of opening
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
                    <Show when={askAt()}>
                        {(pos) => (
                            <Popover
                                open={true}
                                at={() => ({ x: pos().x, y: pos().y })}
                                onClose={() => setAskAt(null)}
                                estHeight={130}
                                fixedWidth={240}
                                panelClass="p-1.5"
                            >
                                <MenuLabel>Open in…</MenuLabel>
                                <MenuItem
                                    icon={<ThemeSwatch themeId={p.d.themeId} />}
                                    trailing={
                                        <span class="flex-none text-[11px] text-muted">saved</span>
                                    }
                                    onClick={() => openWith(false)}
                                >
                                    {resolveTheme(p.d.themeId).name}
                                </MenuItem>
                                <MenuItem
                                    icon={<ThemeSwatch themeId={appTheme()} />}
                                    trailing={
                                        <span class="flex-none text-[11px] text-muted">
                                            app theme
                                        </span>
                                    }
                                    onClick={() => openWith(true)}
                                >
                                    {resolveTheme(appTheme()).name}
                                </MenuItem>
                            </Popover>
                        )}
                    </Show>
                </div>

                <div class="flex min-w-0 flex-1 flex-col gap-3.5">
                    <div class="flex items-center gap-3">
                        {/* "Aa" specimen in the artifact's saved theme — font, palette, radius */}
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
                                <Eyebrow as="div" tracking="widest">
                                    {folder() ? "Folder" : "Atelier Studio"}
                                </Eyebrow>
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
                            <TextField
                                icon="search"
                                class="w-56"
                                placeholder="Search artifacts…"
                                value={query()}
                                onChange={(v) => setQuery(v)}
                            />
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
                                when={scope().length === 0 && !folderId()}
                                fallback={
                                    <Show
                                        when={scope().length}
                                        fallback={
                                            <EmptyState
                                                class="h-64"
                                                title="This folder is empty."
                                                subtitle="Drag artifacts onto this folder to add them."
                                            />
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
                                                        setQuery("");
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
                                <EmptyLibrary
                                    onGenerate={openGenerate}
                                    onTemplates={() => navigate("/templates")}
                                />
                            </Show>
                        }
                    >
                        <For each={shown()}>{(d) => <Band d={d} />}</For>
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
