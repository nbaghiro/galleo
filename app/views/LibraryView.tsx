import type { ArtifactContent } from "@model/content";
import type { Component } from "solid-js";
import { createMemo, createSignal, For, Index, onMount, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { resolveTheme } from "@themes/library";
import { type ArtifactSummary } from "../data/api";
import { FORMAT_IDS, formatLabel, formatLabelPlural, relativeTime } from "../data/format";
import { appTheme } from "../theme/theme";
import { folders } from "../data/folders";
import { ConfirmModal } from "../ui/ConfirmModal";
import { DuplicateIcon, FolderIcon, SearchIcon, TrashIcon } from "../ui/icons";
import {
    contents,
    artifacts,
    artifactsLoaded,
    duplicateArtifact,
    loadContents,
    loadLibrary,
    moveArtifact,
    removeArtifact,
    setDraggingArtifact,
} from "../data/library";
import { SectionThumb } from "../ui/SectionThumb";
import { Sidebar } from "../ui/Sidebar";

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

    // shared confirm modal for the card menu's destructive/duplicating actions
    const [confirm, setConfirm] = createSignal<{
        kind: "delete" | "duplicate";
        doc: ArtifactSummary;
    } | null>(null);
    const [acting, setActing] = createSignal(false);
    const runConfirm = async (): Promise<void> => {
        const c = confirm();
        if (!c) return;
        setActing(true);
        try {
            if (c.kind === "delete") removeArtifact(c.doc.id);
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
        const cv = (): NonNullable<ArtifactSummary["cover"]> => p.d.cover ?? {};
        const img = (): string | undefined => cv().image;
        const secs = () => p.d.sections ?? [];
        const content = (): ArtifactContent | undefined => contents()[p.d.id];
        const [menu, setMenu] = createSignal(false);
        const [askOpen, setAskOpen] = createSignal(false);
        // open in the saved theme normally; if the app theme differs, offer to view in it instead
        const open = (): void => {
            if (p.d.themeId === appTheme()) navigate(`/edit/${p.d.id}`);
            else setAskOpen(true);
        };
        const openWith = (asApp: boolean): void => {
            setAskOpen(false);
            navigate(asApp ? `/edit/${p.d.id}?as=app` : `/edit/${p.d.id}`);
        };
        return (
            <section class="flex items-center gap-7 border-b border-line px-9 py-7">
                <div class="relative flex-none">
                    <button
                        class="relative block h-[190px] w-[300px] overflow-hidden"
                        style={{
                            background: tk().bg,
                            "box-shadow": "var(--shadow)",
                            "border-radius": "var(--radius)",
                        }}
                        draggable={true}
                        onDragStart={(e) => {
                            setDraggingArtifact(p.d.id);
                            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingArtifact(null)}
                        onClick={open}
                    >
                        {/* just the artifact's cover image — clean, no synthesized text overlay (the real slides
                            live in the carousel, the title/meta in the header beside it) */}
                        <Show
                            when={img()}
                            fallback={
                                <div
                                    class="absolute inset-0 grid place-items-center"
                                    style={{
                                        background: `linear-gradient(150deg, ${tk().surface}, ${tk().bg})`,
                                    }}
                                >
                                    <span
                                        class="h-8 w-8 rounded-xl"
                                        style={{ background: tk().accent, opacity: "0.9" }}
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
                    <Show when={askOpen()}>
                        <div class="fixed inset-0 z-20" onClick={() => setAskOpen(false)} />
                        <div class="absolute left-3 top-3 z-30 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
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
                                            background: resolveTheme(p.d.themeId).tokens.accent,
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
                                            background: resolveTheme(appTheme()).tokens.accent,
                                        }}
                                    />
                                    <span class="truncate font-medium text-ink">
                                        {resolveTheme(appTheme()).name}
                                    </span>
                                </span>
                                <span class="flex-none text-[11px] text-muted">app theme</span>
                            </button>
                        </div>
                    </Show>
                </div>

                <div class="flex min-w-0 flex-1 flex-col gap-3.5">
                    <div class="flex items-center gap-3">
                        <span
                            class="grid h-8 w-8 flex-none place-items-center rounded-lg"
                            style={{
                                background: tk().bg,
                                "box-shadow": "inset 0 0 0 1px rgba(0,0,0,0.1)",
                            }}
                        >
                            <span
                                class="h-3 w-3 rounded-[3px]"
                                style={{ background: tk().accent }}
                            />
                        </span>
                        <div class="min-w-0">
                            <div class="truncate text-[16px] font-semibold text-ink">
                                {p.d.title}
                            </div>
                            <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                                <span
                                    class="font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
                                    style={{ color: tk().accent }}
                                >
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
                                class="rounded-md px-2 py-1 text-[15px] leading-none text-muted hover:bg-canvas hover:text-ink"
                                title="Move to folder"
                                onClick={() => setMenu((x) => !x)}
                            >
                                ⋯
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
                                        themeId={p.d.themeId}
                                        formatId={p.d.formatId}
                                        label={`Section ${i() + 1}`}
                                        onOpen={open}
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
                            <div class="flex h-64 flex-col items-center justify-center gap-1 text-[13px] text-muted">
                                <Show
                                    when={scope().length}
                                    fallback={
                                        <>
                                            <span>
                                                {folderId()
                                                    ? "This folder is empty."
                                                    : "No artifacts yet."}
                                            </span>
                                            <span class="text-[12px]">
                                                {folderId()
                                                    ? "Drag artifacts onto this folder to add them."
                                                    : "Use ＋ New artifact."}
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
                        <For each={shown()}>{(d) => <Band d={d} />}</For>
                    </Show>
                </Show>
            </main>
            <Show when={confirm()}>
                {(c) => (
                    <ConfirmModal
                        title={c().kind === "delete" ? "Delete artifact?" : "Duplicate artifact?"}
                        body={
                            c().kind === "delete" ? (
                                <>
                                    “{c().doc.title}” will be permanently deleted. This can’t be
                                    undone.
                                </>
                            ) : (
                                <>
                                    A copy of “{c().doc.title}” will be added to your library
                                    {c().doc.folderId ? " in the same folder" : ""}.
                                </>
                            )
                        }
                        confirmLabel={c().kind === "delete" ? "Delete" : "Duplicate"}
                        danger={c().kind === "delete"}
                        busy={acting()}
                        onConfirm={() => runConfirm()}
                        onCancel={() => setConfirm(null)}
                    />
                )}
            </Show>
        </div>
    );
};
