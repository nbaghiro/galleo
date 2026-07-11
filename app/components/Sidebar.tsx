import type { Component, JSX } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { api, type ApiFolder } from "../api";
import { logout, user } from "../stores/auth";
import { billing, loadBilling } from "../stores/billing";
import {
    blankArtifact,
    formatLabel,
    artifacts,
    draggingArtifact,
    moveArtifact,
    setDraggingArtifact,
} from "../stores/library";
import {
    addFolder,
    folderColor,
    folders,
    loadFolders,
    removeFolder,
    renameFolderById,
} from "../stores/folders";
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
} from "@ui/icons";
import { CreateModal } from "../components/modals";
import { openThemeEditor } from "../theme";
import { openGenerate } from "../stores/generate";
import { Button, Eyebrow, IconButton } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Meter } from "@ui/status";
import { Mark } from "@ui/brand";

// Shared, route-aware app sidebar (Library / Templates / Folders…) + workspace, create menu, theme,
// and sign-out. Built on the theme tokens so it recolors with the app theme. Folders are drop targets:
// drag an artifact card onto a folder (or onto Library) to move it in / out.
export const Sidebar: Component = () => {
    const navigate = useNavigate();
    const location = useLocation();
    onMount(loadBilling);
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
            <Button
                variant="primary"
                rounded="xl"
                class="w-full"
                onClick={() => setCreateOpen(true)}
            >
                <PlusIcon size={15} /> New artifact
            </Button>
            <Show when={createOpen()}>
                <CreateModal
                    onClose={() => setCreateOpen(false)}
                    onGenerate={() => {
                        setCreateOpen(false);
                        openGenerate();
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
        <TextField
            class="mx-0.5 rounded-lg border-accent pr-2.5"
            style={{ "padding-left": pad(depth) }}
            placeholder={placeholder}
            value={newName()}
            ref={(el) => queueMicrotask(() => el.focus())}
            onChange={setNewName}
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
                        <TextField
                            class="mx-0.5 rounded-lg border-accent pr-2.5"
                            style={{ "padding-left": pad(np.depth) }}
                            value={renameName()}
                            ref={(el) => queueMicrotask(() => el.focus())}
                            onChange={setRenameName}
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
                            <IconButton
                                size="2xs"
                                tone="muted"
                                class="flex-none"
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
                            </IconButton>
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
                            <IconButton
                                size="xs"
                                tone="muted"
                                title="New subfolder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    startCreate(np.f.id);
                                }}
                            >
                                <PlusIcon size={11} />
                            </IconButton>
                            <IconButton
                                size="xs"
                                tone="muted"
                                title="Rename"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRenaming(np.f.id);
                                    setRenameName(np.f.name);
                                }}
                            >
                                <EditIcon size={12} />
                            </IconButton>
                            <IconButton
                                size="xs"
                                tone="muted"
                                title="Delete folder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (active()) navigate("/");
                                    removeFolder(np.f.id);
                                }}
                            >
                                <CloseIcon size={12} />
                            </IconButton>
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
            {/* the website is a separate build at "/" (outside the app's /app router base), so this is
                a real navigation, not a router link */}
            <a
                href="/"
                title="Galleo — home"
                class="flex items-center gap-2.5 px-1.5 pb-3 font-mono text-[14px] font-bold tracking-[0.06em] text-accent transition-opacity hover:opacity-70"
            >
                <Mark size={24} rounded="md" />
                GALLEO
            </a>
            <div class="mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-canvas px-2.5 py-2">
                <Mark size={28} />
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
                {navItem(<SharedIcon />, "Shared", "/shared", route() === "/shared")}
                {navItem(<TrashIcon />, "Trash", "/trash", route() === "/trash")}
            </nav>

            {/* Folders */}
            <div class="mt-4 flex items-center justify-between px-2.5 pb-1">
                <Eyebrow tracking="wider">Folders</Eyebrow>
                <IconButton
                    size="xs"
                    tone="muted"
                    title="New folder"
                    onClick={() => startCreate(null)}
                >
                    <PlusIcon size={13} />
                </IconButton>
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

            <Show when={billing()}>
                {(b) => (
                    <div class="mt-3 flex-none rounded-xl border border-line bg-canvas p-3">
                        <div class="flex items-center justify-between text-[11.5px] font-semibold text-soft">
                            <span class="capitalize">{b().plan} plan</span>
                            <span class="font-mono text-muted">
                                {b().usage.artifacts}
                                {b().usage.maxArtifacts < 0 ? "" : ` / ${b().usage.maxArtifacts}`}
                            </span>
                        </div>
                        <Show when={b().usage.maxArtifacts > 0}>
                            <Meter
                                value={b().usage.artifacts}
                                max={b().usage.maxArtifacts}
                                trackTone="line"
                                class="my-2"
                            />
                        </Show>
                        <a
                            class="mt-1 block cursor-pointer text-[11.5px] font-semibold text-accent"
                            onClick={() => navigate("/pricing")}
                        >
                            {b().plan === "free" ? "Upgrade for unlimited →" : "Manage plan →"}
                        </a>
                    </div>
                )}
            </Show>
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
                <IconButton
                    size="lg"
                    tone="muted"
                    class="flex-none"
                    title="Sign out"
                    onClick={() => logout().then(() => navigate("/"))}
                >
                    <SignOutIcon />
                </IconButton>
            </div>
        </aside>
    );
};

// Opens the theme editor modal (the unified picker + custom-theme creation).
const ThemePicker: Component = () => (
    <IconButton
        size="lg"
        tone="muted"
        class="flex-none"
        title="Theme"
        onClick={() => openThemeEditor()}
    >
        <ThemeIcon />
    </IconButton>
);
