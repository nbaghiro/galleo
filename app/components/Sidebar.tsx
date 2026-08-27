import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import type { ApiFolder, BillingState } from "@app/api";
import { logout, user } from "@app/stores/auth";
import { billing, loadBilling } from "@app/stores/billing";
import { loadWorkspace, switchWorkspace, workspaceState } from "@app/stores/workspace";
import { draggingArtifact, moveArtifact, setDraggingArtifact } from "@app/stores/library";
import {
    addFolder,
    folderColor,
    folders,
    loadFolders,
    removeFolder,
    renameFolderById,
} from "@app/stores/folders";
import {
    ChevronRightIcon,
    CloseIcon,
    ChevronDownIcon,
    EditIcon,
    FolderFillIcon,
    LibraryIcon,
    MenuIcon,
    PlusIcon,
    SharedIcon,
    SignOutIcon,
    TemplatesIcon,
    ThemeIcon,
    TrashIcon,
} from "@ui/icons";
import { openThemeEditor } from "@app/stores/theme";
import { OnboardingChecklist } from "@app/components/OnboardingChecklist";
import { openGenerate } from "@app/stores/generate";
import { Avatar } from "@ui/avatar";
import { Button, Eyebrow, IconButton } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Meter } from "@ui/status";
import { Mark } from "@ui/brand";
import { Menu, MenuItem, MenuLabel } from "@ui/menu";

// Below `md` the sidebar is an overlay drawer; at md+ it is a static column and this stays false.
const [drawerOpen, setDrawerOpen] = createSignal(false);
export const openSidebar = (): void => {
    setDrawerOpen(true);
};
export const closeSidebar = (): void => {
    setDrawerOpen(false);
};

// phone app bar; each management view renders it first inside its <main>
// Two initials where the name gives two words, one otherwise: "Northwind Studio" reads as NS, and a
// single-word workspace still gets a mark rather than a blank.
const initials = (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "W";
    const first = words[0]![0] ?? "";
    const last = words.length > 1 ? (words.at(-1)![0] ?? "") : "";
    return (first + last).toUpperCase();
};

const WorkspaceCard: Component<{
    anchor?: (el: HTMLElement) => void;
    onToggle?: () => void;
}> = (props) => {
    const navigate = useNavigate();
    const location = useLocation();
    return (
        <div
            ref={props.anchor}
            class={`mb-2 flex w-full items-center gap-1 rounded-xl border bg-canvas pr-1 transition-colors ${
                // the tab rides in the path, so this is a prefix rather than an exact match
                location.pathname.startsWith("/settings")
                    ? "border-accent"
                    : "border-line hover:border-accent/50"
            }`}
        >
            <button
                class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                title="Workspace settings"
                onClick={() => navigate("/settings")}
            >
                <span class="grid size-7 flex-none place-items-center rounded-lg bg-accent text-[11px] font-bold text-onaccent">
                    {initials(workspaceState()?.workspace.name ?? "Workspace")}
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-[12.5px] font-bold text-ink">
                        {workspaceState()?.workspace.name ?? "Workspace"}
                    </span>
                    <span class="block text-[10.5px] text-muted">
                        {(workspaceState()?.members.length ?? 1) > 1
                            ? `${workspaceState()!.members.length} members`
                            : "Personal workspace"}
                    </span>
                </span>
            </button>
            <Show when={props.onToggle}>
                <IconButton
                    size="sm"
                    rounded="md"
                    tone="muted"
                    title="Switch workspace"
                    onClick={props.onToggle}
                >
                    <ChevronDownIcon size={15} />
                </IconButton>
            </Show>
        </div>
    );
};

// The drawer hides the credit meter on phones, so the handle itself carries the low signal.
const creditsLow = (): boolean => {
    const s = billing();
    return !!s && s.credits.balance < 2 * s.credits.perGeneration;
};

export const SidebarToggle: Component = () => (
    <div class="sticky top-0 z-panel flex items-center gap-2 border-b border-line bg-panel/95 px-3 py-2 backdrop-blur-md md:hidden">
        <div class="relative">
            <IconButton size="touch" tone="muted" title="Menu" onClick={openSidebar}>
                <MenuIcon />
            </IconButton>
            <Show when={creditsLow()}>
                <span
                    class="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-fail"
                    title="Credits are running low"
                />
            </Show>
        </div>
        <span class="font-mono text-[13px] font-bold tracking-[0.06em] text-accent">GALLEO</span>
    </div>
);

export const Sidebar: Component = () => {
    const navigate = useNavigate();
    const location = useLocation();
    onMount(loadBilling);
    onMount(loadWorkspace);
    const route = (): string => location.pathname || "/";
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
            setCollapsed(s); // expand the parent so the new-subfolder input shows
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

    // one door: every device opens the generate studio, which carries templates + blank too
    const NewButton: Component = () => (
        <Button variant="primary" rounded="xl" class="w-full" onClick={() => openGenerate()}>
            <PlusIcon size={15} /> New artifact
        </Button>
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
            class={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-3 text-[13.5px] md:py-2 ${active ? "bg-accent/10 font-semibold text-accent" : "text-soft hover:bg-canvas"} ${onDrop && dragOver() === key ? "ring-2 ring-accent ring-inset" : ""}`}
            onClick={() => to && navigate(to)}
            onDragOver={onDrop && key ? allowDrop(key) : undefined}
            onDragLeave={onDrop ? () => setDragOver(null) : undefined}
            onDrop={onDrop ? () => onDrop() : undefined}
        >
            <span class="grid h-4.5 w-4.5 flex-none place-items-center">{icon}</span> {label}
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

    const FolderNode: Component<{ f: ApiFolder; depth: number }> = (np) => {
        const kids = (): ApiFolder[] => folders().filter((x) => x.parentId === np.f.id);
        const expanded = (): boolean => !collapsed().has(np.f.id);
        const count = (): number => np.f.count ?? 0; // counted server-side; the client list is one page deep
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
                        class={`group flex cursor-pointer items-center gap-1.5 rounded-lg py-3 pr-2 text-[13.5px] md:py-2 ${active() ? "bg-accent/10 font-semibold text-accent" : "text-soft hover:bg-canvas"} ${dragOver() === np.f.id ? "ring-2 ring-accent ring-inset" : ""}`}
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
                            class="grid h-4.5 w-4.5 flex-none place-items-center"
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

    // navigating from inside the drawer dismisses it
    createEffect(() => {
        route();
        closeSidebar();
    });

    return (
        <>
            <Show when={drawerOpen()}>
                <div class="fixed inset-0 z-drawer bg-black/40 md:hidden" onClick={closeSidebar} />
            </Show>
            <aside
                class="fixed inset-y-0 left-0 z-drawer flex w-72 max-w-[85vw] flex-none flex-col gap-1 border-r border-line bg-panel px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-ink transition-transform duration-200 md:static md:w-57.5 md:max-w-none md:transition-none"
                classList={{ "max-md:-translate-x-full": !drawerOpen() }}
            >
                <div class="flex items-center justify-between pb-3">
                    {/* rel="external": a real navigation to the marketing build, not a client route */}
                    <a
                        href="/home"
                        rel="external"
                        title="Galleo · marketing site"
                        class="flex items-center gap-2.5 px-1.5 font-mono text-[14px] font-bold tracking-[0.06em] text-accent transition-opacity hover:opacity-70"
                    >
                        <Mark size={24} rounded="md" />
                        GALLEO
                    </a>
                    <IconButton
                        size="touch"
                        tone="muted"
                        class="md:hidden"
                        title="Close menu"
                        onClick={closeSidebar}
                    >
                        <CloseIcon />
                    </IconButton>
                </div>
                {/* One card, two actions: the name opens settings, the chevron opens the switcher.
                    The menu anchors to the card rather than the chevron so it lines up with the
                    workspace name and takes the card's width instead of hanging off a 24px button. */}
                <Show
                    when={(workspaceState()?.memberships.length ?? 0) > 1}
                    fallback={<WorkspaceCard />}
                >
                    <Menu
                        align="start"
                        trigger={(m) => <WorkspaceCard anchor={m.ref} onToggle={m.toggle} />}
                    >
                        <MenuLabel>Switch workspace</MenuLabel>
                        <For each={workspaceState()!.memberships}>
                            {(w) => (
                                <MenuItem
                                    selected={w.active}
                                    onClick={() => void switchWorkspace(w.id)}
                                >
                                    {w.name}
                                </MenuItem>
                            )}
                        </For>
                    </Menu>
                </Show>
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
                    {navItem(
                        <TemplatesIcon />,
                        "Templates",
                        "/templates",
                        route() === "/templates",
                    )}
                    {navItem(<SharedIcon />, "Shared", "/shared", route() === "/shared")}
                    {navItem(<TrashIcon />, "Trash", "/trash", route() === "/trash")}
                </nav>

                <OnboardingChecklist />

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

                <Show when={billing()}>{(b) => <CreditsCard b={b()} navigate={navigate} />}</Show>
                <div class="mt-3 flex items-center gap-1 border-t border-line pt-3">
                    <button
                        class={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-canvas ${
                            route() === "/account" ? "bg-accent/10" : ""
                        }`}
                        title="Account settings"
                        onClick={() => navigate("/account")}
                    >
                        <Avatar
                            src={user()?.avatarUrl}
                            name={user()?.name}
                            email={user()?.email}
                            tone="solid"
                            rounded="lg"
                        />
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-[12.5px] font-semibold text-ink">
                                {user()?.name ?? "Signed in"}
                            </span>
                            <span class="block truncate text-[10.5px] text-muted">
                                {user()?.email}
                            </span>
                        </span>
                    </button>
                    <ThemePicker />
                    <IconButton
                        size="lg"
                        tone="muted"
                        class="flex-none"
                        title="Sign out"
                        onClick={() => void logout()}
                    >
                        <SignOutIcon />
                    </IconButton>
                </div>
            </aside>
        </>
    );
};

// The plan-at-a-glance card: what's left to spend this cycle, and anything that needs attention
// (failed payment, pending downgrade). Detail lives in settings; this is the glance.
const CreditsCard: Component<{ b: BillingState; navigate: (p: string) => void }> = (props) => {
    const remaining = (): number => props.b.credits.balance;
    const grantIn = (): number =>
        Math.max(
            0,
            Math.ceil((new Date(props.b.credits.resetAt).getTime() - Date.now()) / 86_400_000),
        );
    const low = (): boolean => remaining() < 2 * props.b.credits.perGeneration;
    const pastDue = (): boolean => props.b.status === "past_due";
    const lapsing = (): boolean => props.b.cancelAtPeriodEnd && props.b.plan !== "free";
    return (
        <div
            class={`mt-3 flex-none rounded-xl border bg-canvas p-3 ${pastDue() ? "border-accent" : "border-line"}`}
        >
            <div class="flex items-baseline justify-between text-[11.5px] font-semibold text-soft">
                <span class="capitalize">{props.b.plan} plan</span>
                <Show when={props.b.seats > 1}>
                    <span class="text-muted">{props.b.seats} seats</span>
                </Show>
            </div>
            <Meter
                value={remaining()}
                max={props.b.credits.rolloverCap}
                tone={low() ? "fail" : "accent"}
                trackTone="line"
                class="my-2"
            />
            <div class="flex items-baseline justify-between text-[10.5px] text-muted">
                <span class="tabular-nums">
                    <span class={`font-semibold ${low() ? "text-fail" : "text-soft"}`}>
                        {remaining().toLocaleString()}
                    </span>{" "}
                    credits left
                </span>
                <span>
                    {props.b.credits.capped
                        ? "at the rollover cap"
                        : `+${props.b.credits.monthlyGrant.toLocaleString()} in ${grantIn()}d`}
                </span>
            </div>
            {/* a capped member's real ceiling is their own, not the pool's */}
            <Show when={props.b.credits.myCap != null}>
                <div class="mt-0.5 text-[10.5px] tabular-nums text-muted">
                    You: {props.b.credits.mySpend.toLocaleString()} /{" "}
                    {props.b.credits.myCap!.toLocaleString()} cr this cycle
                </div>
            </Show>
            <a
                class={`mt-1.5 block cursor-pointer text-[11.5px] font-semibold ${pastDue() ? "text-accent" : "text-accent"}`}
                onClick={() => props.navigate(pastDue() ? "/settings/billing" : "/settings/plan")}
            >
                {pastDue()
                    ? "Payment failed. Fix billing →"
                    : lapsing()
                      ? "Plan ends soon. Resume →"
                      : props.b.plan === "free"
                        ? "Upgrade for more credits →"
                        : "Manage plan →"}
            </a>
        </div>
    );
};

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
