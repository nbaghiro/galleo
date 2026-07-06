import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { setArtifactFormat } from "@elements/ops";
import {
    canRedo,
    canUndo,
    commit,
    currentArtifactId,
    artifacts,
    editor,
    editorTheme,
    editorTokens,
    entitlements,
    present,
    redo,
    renameArtifact,
    requestHome,
    requestSwitchArtifact,
    requestThemePicker,
    requestUpgrade,
    setAgentOpen,
    undo,
} from "../editor";
import { exportDeckPng, exportPdfAuto, exportPrint } from "@canvas/render/export";
import { Icon } from "../icons";

// One shared height for every topbar control (switchers + action buttons) so they always line up.
const controlH = "h-8";
const btnBase = `flex items-center cursor-pointer rounded-lg border px-3 text-[12px] font-semibold ${controlH}`;
const btn = `${btnBase} border-line bg-canvas text-ink`;
const btnAccent = `${btnBase} border-accent bg-accent text-onaccent`;

const ArtifactMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const [renaming, setRenaming] = createSignal(false);
    const [draft, setDraft] = createSignal("");
    const current = createMemo(
        () => artifacts().find((d) => d.id === currentArtifactId())?.title ?? "Untitled",
    );
    let inputEl: HTMLInputElement | undefined;
    const startRename = (): void => {
        setOpen(false);
        setDraft(current());
        setRenaming(true);
        queueMicrotask(() => {
            inputEl?.focus();
            inputEl?.select();
        });
    };
    const commitRename = (): void => {
        if (!renaming()) return;
        renameArtifact(draft());
        setRenaming(false);
    };

    return (
        <div class="relative">
            <Show
                when={renaming()}
                fallback={
                    <button
                        class="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
                        title="Rename or switch artifact"
                        onClick={() => setOpen((o) => !o)}
                    >
                        {current()} <Icon name="chevron" size={12} />
                    </button>
                }
            >
                <input
                    ref={(el) => (inputEl = el)}
                    class="w-56 rounded-md border border-line bg-canvas px-2 py-1 text-[13px] font-semibold text-ink outline-none focus:border-accent"
                    value={draft()}
                    onInput={(e) => setDraft(e.currentTarget.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                        e.stopPropagation(); // don't leak ⌘Z/Escape to the canvas' global shortcuts
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            setRenaming(false);
                        }
                    }}
                />
            </Show>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute left-0 z-20 mt-2 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                    <button
                        class="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-soft hover:bg-canvas"
                        onClick={startRename}
                    >
                        Rename…
                    </button>
                    <div class="my-1 h-px bg-line" />
                    <div class="px-2.5 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                        Switch to
                    </div>
                    <For each={artifacts()}>
                        {(d) => (
                            <button
                                class={`block w-full rounded-lg px-2.5 py-2 text-left text-[13px] ${d.id === currentArtifactId() ? "bg-canvas font-semibold text-accent" : "hover:bg-canvas"}`}
                                onClick={() => {
                                    requestSwitchArtifact(d.id);
                                    setOpen(false);
                                }}
                            >
                                {d.title}
                            </button>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
};

// Small icon-only undo/redo, greyed when their stack is empty. Content edits, theme changes, format
// switches and renames all share one stack (see editor.ts), so these step through everything.
const HistoryButtons: Component = () => {
    const cls =
        "grid h-8 w-8 place-items-center rounded-lg text-soft transition-colors hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-30";
    return (
        <div class="flex items-center gap-0.5">
            <button class={cls} disabled={!canUndo()} title="Undo (⌘Z)" onClick={undo}>
                <Icon name="undo" size={15} />
            </button>
            <button class={cls} disabled={!canRedo()} title="Redo (⌘⇧Z)" onClick={redo}>
                <Icon name="redo" size={15} />
            </button>
        </div>
    );
};

const Swatch: Component<{ surface: string; ink: string; accent: string }> = (props) => (
    <span class="flex h-4 w-4 overflow-hidden rounded-full border border-line">
        <span class="h-full w-1/2" style={{ background: props.surface }} />
        <span class="h-full w-1/4" style={{ background: props.ink }} />
        <span class="h-full w-1/4" style={{ background: props.accent }} />
    </span>
);

// Opens the app-level theme drawer (the singular switcher + custom-theme creation); the button shows
// the artifact's current theme. The app host wires the drawer via onThemePicker.
const ThemeMenu: Component = () => {
    const current = createMemo(() => editorTheme());
    return (
        <button
            class={`${btn} flex items-center gap-2`}
            title="Theme"
            onClick={() => requestThemePicker()}
        >
            <Swatch
                surface={current().tokens.surface}
                ink={current().tokens.ink}
                accent={current().tokens.accent}
            />
            {current().name}
        </button>
    );
};

const FORMATS = [
    { id: "deck", label: "Deck" },
    { id: "doc", label: "Doc" },
    { id: "web", label: "Web" },
];

const ExportMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    // The workspace plan decides which formats are unlocked and whether exports carry the Galleo mark.
    const allows = (f: "png" | "pdf" | "print"): boolean =>
        entitlements().exportFormats.includes(f);
    const brand = (): boolean => !entitlements().removeBranding;
    const run = async (fn: () => void | Promise<void>): Promise<void> => {
        setOpen(false);
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };
    // A menu row: unlocked → runs the export; locked (a paid format on the current plan) → a muted row
    // tagged "Pro" that sends the user to the pricing page instead.
    const item = (
        label: string,
        format: "png" | "pdf" | "print",
        fn: () => void | Promise<void>,
    ): JSX.Element =>
        allows(format) ? (
            <button
                class="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-canvas"
                onClick={() => run(fn)}
            >
                {label}
            </button>
        ) : (
            <button
                class="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-muted hover:bg-canvas"
                onClick={() => {
                    setOpen(false);
                    requestUpgrade();
                }}
            >
                <span class="inline-flex items-center gap-1.5">
                    <Icon name="lock" size={12} /> {label}
                </span>
                <span class="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    Pro
                </span>
            </button>
        );
    return (
        <div class="relative">
            <button class={btn} disabled={busy()} onClick={() => !busy() && setOpen((o) => !o)}>
                <Show
                    when={busy()}
                    fallback={
                        <span class="inline-flex items-center gap-1.5">
                            <Icon name="export" size={14} /> Export{" "}
                            <Icon name="chevron" size={11} />
                        </span>
                    }
                >
                    <span class="inline-flex items-center gap-1.5">
                        <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Exporting
                    </span>
                </Show>
            </button>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                    {item("PDF", "pdf", () =>
                        exportPdfAuto(editor.artifact, editorTokens(), { brand: brand() }),
                    )}
                    {item("PNG — deck", "png", () =>
                        exportDeckPng(editor.artifact, editorTokens(), { brand: brand() }),
                    )}
                    {item("Print…", "print", () => exportPrint(editor.artifact, editorTokens()))}
                </div>
            </Show>
        </div>
    );
};

const FormatSwitcher: Component = () => (
    <div
        class={`flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-0.5 ${controlH}`}
    >
        <For each={FORMATS}>
            {(f) => (
                <button
                    class={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${editor.artifact.format === f.id ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                    onClick={() => commit(setArtifactFormat(editor.artifact, f.id))}
                >
                    {f.label}
                </button>
            )}
        </For>
    </div>
);

export const Topbar: Component = () => (
    <header class="relative z-30 flex items-center gap-3.5 border-b border-line bg-panel px-[18px]">
        <button
            class="cursor-pointer font-mono text-[15px] font-bold tracking-wide text-accent hover:opacity-80"
            title="Back to library"
            onClick={() => requestHome()}
        >
            GALLEO
        </button>
        <ArtifactMenu />
        <HistoryButtons />
        <span class="flex-1" />
        <FormatSwitcher />
        <ThemeMenu />
        <button class={btn} onClick={() => present()}>
            <span class="inline-flex items-center gap-1.5">
                <Icon name={editor.artifact.format === "deck" ? "present" : "preview"} size={14} />
                {editor.artifact.format === "deck" ? "Present" : "Preview"}
            </span>
        </button>
        <ExportMenu />
        <button class={btnAccent} onClick={() => setAgentOpen(true)}>
            <span class="inline-flex items-center gap-1.5">
                <Icon name="sparkle" size={14} /> Generate
            </span>
        </button>
    </header>
);
