import type { Component, JSX } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { api, type ApiFolder } from "../data/api";
import { logout, user } from "../data/auth";
import { blankArtifact } from "../data/blank";
import { formatLabel } from "../data/format";
import {
    addFolder,
    folderColor,
    folders,
    loadFolders,
    removeFolder,
    renameFolderById,
} from "../data/folders";
import {
    ChevronRightIcon,
    CloseIcon,
    EditIcon,
    FolderFillIcon,
    LibraryIcon,
    PlusIcon,
    SharedIcon,
    SignOutIcon,
    TemplatesIcon,
    ThemeIcon,
    TrashIcon,
} from "../components/icons";
import { CreateModal } from "../components/CreateModal";
import { artifacts, draggingArtifact, moveArtifact, setDraggingArtifact } from "../data/library";
import { openThemeDrawer } from "../theme/theme-drawer";

// Shared, route-aware app sidebar (Library / Templates / Folders…) + workspace, create menu, theme,
// and sign-out. Built on the theme tokens so it recolors with the app theme. Folders are drop targets:
// drag an artifact card onto a folder (or onto Library) to move it in / out.
export const Sidebar: Component = () => {
    const navigate = useNavigate();
    const location = useLocation();
    // The router carries base="/app", so pathname is "/app/…"; strip it to compare route-relative.
    const route = (): string => location.pathname.replace(/^\/app/, "") || "/";
    onMount(() => loadFolders());
    const [dragOver, setDragOver] = createSignal<string | null>(null); // folder id, or "root" for Library
    const [creatingParent, setCreatingParent] = createSignal<string | null | undefined>(undefined); // null=root, id=subfolder
    const [newName, setNewName] = createSignal("");
    const [renaming, setRenaming] = createSignal<string | null>(null);
    const [renameName, setRenameName] = createSignal("");
    const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
    const toggleCollapse = (id: string): void => {
        const s = new Set(collapsed());
        if (s.has(id)) s.delete(id);
        else s.add(id);
        setCollapsed(s);
    };

    const create = async (fmt: string): Promise<void> => {
        const { id } = await api.createArtifact({
            title: `Untitled ${formatLabel(fmt).toLowerCase()}`,
            formatId: fmt,
            themeId: "studio",
            draftContent: blankArtifact(fmt),
        });
        navigate(`/edit/${id}`);
    };

    const drop = (folderId: string | null): void => {
        const id = draggingArtifact();
        if (id) moveArtifact(id, folderId);
        setDragOver(null);
        setDraggingArtifact(null);
    };
    const allowDrop =
        (key: string) =>
        (e: DragEvent): void => {
            if (!draggingArtifact()) return;
            e.preventDefault();
            setDragOver(key);
        };

    const startCreate = (parent: string | null): void => {
        if (parent) {
            const s = new Set(collapsed());
            s.delete(parent);
            setCollapsed(s); // expand the parent so the new subfolder input is visible
        }
        setCreatingParent(parent);
        setNewName("");
    };
    const submitNew = async (): Promise<void> => {
        const n = newName().trim();
        const parent = creatingParent();
        setCreatingParent(undefined);
        setNewName("");
        if (!n || parent === undefined) return;
        const f = await addFolder(n, parent);
        if (f) navigate(`/folder/${f.id}`);
    };
    const submitRename = (id: string): void => {
        const n = renameName().trim();
        setRenaming(null);
        if (n) renameFolderById(id, n);
    };

    const [createOpen, setCreateOpen] = createSignal(false);
    const NewButton: Component = () => (
        <>
            <button
                class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-onaccent"
                onClick={() => setCreateOpen(true)}
            >
                <PlusIcon size={15} /> New artifact
            </button>
            <Show when={createOpen()}>
                <CreateModal
                    onClose={() => setCreateOpen(false)}
                    onGenerate={() => {
                        setCreateOpen(false);
                        navigate("/new");
                    }}
                    onBlank={(fmt) => {
                        setCreateOpen(false);
                        create(fmt);
                    }}
                />
            </Show>
        </>
    );

    const navItem = (
        icon: JSX.Element,
        label: string,
        to: string | null,
        active: boolean,
        onDrop?: () => void,
        key?: string,
    ) => (
        <a
            class={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] ${active ? "bg-accent/10 font-semibold text-accent" : "text-soft hover:bg-canvas"} ${onDrop && dragOver() === key ? "ring-2 ring-accent ring-inset" : ""}`}
            onClick={() => to && navigate(to)}
            onDragOver={onDrop && key ? allowDrop(key) : undefined}
            onDragLeave={onDrop ? () => setDragOver(null) : undefined}
            onDrop={onDrop ? () => onDrop() : undefined}
        >
            <span class="grid h-[18px] w-[18px] flex-none place-items-center">{icon}</span> {label}
        </a>
    );

    const pad = (d: number): string => `${8 + d * 14}px`;
    const newInput = (depth: number, placeholder: string) => (
        <input
            class="mx-0.5 rounded-lg border border-accent bg-canvas py-1.5 pr-2.5 text-[13px] text-ink outline-none"
            style={{ "padding-left": pad(depth) }}
            placeholder={placeholder}
            value={newName()}
            ref={(el) => queueMicrotask(() => el.focus())}
            onInput={(e) => setNewName(e.currentTarget.value)}
            onBlur={() => submitNew()}
            onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") setCreatingParent(undefined);
            }}
        />
    );

    // a folder row + (when expanded) its inline new-subfolder input and children — recursively nested
    const FolderNode: Component<{ f: ApiFolder; depth: number }> = (np) => {
        const kids = (): ApiFolder[] => folders().filter((x) => x.parentId === np.f.id);
        const expanded = (): boolean => !collapsed().has(np.f.id);
        const count = (): number => artifacts().filter((d) => d.folderId === np.f.id).length;
        const active = (): boolean => route() === `/folder/${np.f.id}`;
        return (
            <>
                <Show
                    when={renaming() !== np.f.id}
                    fallback={
                        <input
                            class="mx-0.5 rounded-lg border border-accent bg-canvas py-1.5 pr-2.5 text-[13px] text-ink outline-none"
                            style={{ "padding-left": pad(np.depth) }}
                            value={renameName()}
                            ref={(el) => queueMicrotask(() => el.focus())}
                            onInput={(e) => setRenameName(e.currentTarget.value)}
                            onBlur={() => submitRename(np.f.id)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitRename(np.f.id);
                                if (e.key === "Escape") setRenaming(null);
                            }}
                        />
                    }
                >
                    <div
                        class={`group flex cursor-pointer items-center gap-1.5 rounded-lg py-2 pr-2 text-[13.5px] ${active() ? "bg-accent/10 font-semibold text-accent" : "text-soft hover:bg-canvas"} ${dragOver() === np.f.id ? "ring-2 ring-accent ring-inset" : ""}`}
                        style={{ "padding-left": pad(np.depth) }}
                        onClick={() => navigate(`/folder/${np.f.id}`)}
                        onDragOver={allowDrop(np.f.id)}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={() => drop(np.f.id)}
                    >
                        <Show when={kids().length} fallback={<span class="w-3.5 flex-none" />}>
                            <button
                                class="grid h-3.5 w-3.5 flex-none place-items-center text-muted hover:text-ink"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCollapse(np.f.id);
                                }}
                            >
                                <span
                                    class={`transition-transform ${expanded() ? "rotate-90" : ""}`}
                                >
                                    <ChevronRightIcon size={12} />
                                </span>
                            </button>
                        </Show>
                        <span
                            class="grid h-[18px] w-[18px] flex-none place-items-center"
                            style={{ color: folderColor(np.f.id) }}
                        >
                            <FolderFillIcon size={16} />
                        </span>
                        <span class="min-w-0 flex-1 truncate">{np.f.name}</span>
                        <Show when={count()}>
                            <span class="flex-none font-mono text-[10px] text-muted group-hover:hidden">
                                {count()}
                            </span>
                        </Show>
                        <span class="hidden flex-none items-center gap-0.5 group-hover:flex">
                            <button
                                class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
                                title="New subfolder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    startCreate(np.f.id);
                                }}
                            >
                                <PlusIcon size={11} />
                            </button>
                            <button
                                class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
                                title="Rename"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRenaming(np.f.id);
                                    setRenameName(np.f.name);
                                }}
                            >
                                <EditIcon size={12} />
                            </button>
                            <button
                                class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
                                title="Delete folder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (active()) navigate("/");
                                    removeFolder(np.f.id);
                                }}
                            >
                                <CloseIcon size={12} />
                            </button>
                        </span>
                    </div>
                </Show>
                <Show when={expanded()}>
                    <Show when={creatingParent() === np.f.id}>
                        {newInput(np.depth + 1, "Subfolder name…")}
                    </Show>
                    <For each={kids()}>{(k) => <FolderNode f={k} depth={np.depth + 1} />}</For>
                </Show>
            </>
        );
    };

    return (
        <aside class="flex w-[230px] flex-none flex-col gap-1 border-r border-line bg-panel px-3 py-4 text-ink">
            {/* the marketing site is a separate build at "/" (outside the app's /app router base), so this is
                a real navigation, not a router link */}
            <a
                href="/"
                title="Galleo — home"
                class="flex items-center gap-2.5 px-1.5 pb-3 font-mono text-[14px] font-bold tracking-[0.06em] text-accent transition-opacity hover:opacity-70"
            >
                <span class="grid h-6 w-6 place-items-center rounded-md bg-accent text-[13px] text-onaccent">
                    G
                </span>
                GALLEO
            </a>
            <div class="mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-canvas px-2.5 py-2">
                <span class="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[12px] font-bold text-onaccent">
                    A
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-[12.5px] font-bold text-ink">
                        Atelier Studio
                    </span>
                    <span class="block text-[10.5px] text-muted">Personal workspace</span>
                </span>
            </div>
            <NewButton />
            <nav class="mt-3 flex flex-col gap-0.5">
                {navItem(
                    <LibraryIcon />,
                    "Library",
                    "/",
                    route() === "/",
                    () => drop(null),
                    "root",
                )}
                {navItem(<TemplatesIcon />, "Templates", "/templates", route() === "/templates")}
                {navItem(<SharedIcon />, "Shared", null, false)}
                {navItem(<TrashIcon />, "Trash", "/trash", route() === "/trash")}
            </nav>

            {/* Folders */}
            <div class="mt-4 flex items-center justify-between px-2.5 pb-1">
                <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Folders
                </span>
                <button
                    class="grid h-5 w-5 place-items-center rounded text-muted hover:bg-canvas hover:text-ink"
                    title="New folder"
                    onClick={() => startCreate(null)}
                >
                    <PlusIcon size={13} />
                </button>
            </div>
            <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                <For each={folders().filter((f) => !f.parentId)}>
                    {(f) => <FolderNode f={f} depth={0} />}
                </For>
                <Show when={creatingParent() === null}>{newInput(0, "Folder name…")}</Show>
                <Show when={!folders().length && creatingParent() === undefined}>
                    <p class="px-2.5 py-1 text-[11.5px] text-muted">
                        Drag artifacts here to organize.
                    </p>
                </Show>
            </div>

            <div class="mt-3 flex-none rounded-xl border border-line bg-canvas p-3">
                <div class="flex items-center justify-between text-[11.5px] font-semibold text-soft">
                    <span>Free plan</span>
                    <span class="font-mono text-muted">9 / 12</span>
                </div>
                <div class="my-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div class="h-full rounded-full bg-accent" style={{ width: "75%" }} />
                </div>
                <a class="cursor-pointer text-[11.5px] font-semibold text-accent">
                    Upgrade for unlimited →
                </a>
            </div>
            <div class="mt-3 flex items-center gap-2.5 border-t border-line pt-3">
                <span class="grid h-8 w-8 flex-none place-items-center rounded-lg bg-accent text-[12px] font-bold text-onaccent">
                    {(user()?.name ?? user()?.email ?? "U").charAt(0).toUpperCase()}
                </span>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-[12.5px] font-semibold text-ink">
                        {user()?.name ?? "Signed in"}
                    </div>
                    <div class="truncate text-[10.5px] text-muted">{user()?.email}</div>
                </div>
                <ThemePicker />
                <button
                    class="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                    title="Sign out"
                    onClick={() => logout().then(() => navigate("/"))}
                >
                    <SignOutIcon />
                </button>
            </div>
        </aside>
    );
};

// Opens the singular theme drawer (the unified switcher + custom-theme creation).
const ThemePicker: Component = () => (
    <button
        class="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
        title="Theme"
        onClick={() => openThemeDrawer()}
    >
        <ThemeIcon />
    </button>
);
