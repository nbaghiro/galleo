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
    features,
    present,
    redo,
    renameArtifact,
    requestHome,
    requestShare,
    requestSwitchArtifact,
    requestThemePicker,
    requestUpgrade,
    undo,
} from "../editor";
import { exportDeckPng, exportPdfAuto, exportPrint } from "@canvas/render/export";
import { Button, IconButton, Badge } from "@ui/button";
import { Segmented, inputCls } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@ui/menu";

const ArtifactMenu: Component = () => {
    const [renaming, setRenaming] = createSignal(false);
    const [draft, setDraft] = createSignal("");
    const current = createMemo(
        () => artifacts().find((d) => d.id === currentArtifactId())?.title ?? "Untitled",
    );
    let inputEl: HTMLInputElement | undefined;
    const startRename = (): void => {
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
        <Show
            when={renaming()}
            fallback={
                <Menu
                    width={240}
                    trigger={(m) => (
                        <button
                            ref={m.ref}
                            class="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
                            title="Rename or switch artifact"
                            onClick={m.toggle}
                        >
                            {current()} <Icon name="chevron" size={12} />
                        </button>
                    )}
                >
                    <MenuItem onClick={startRename}>Rename…</MenuItem>
                    <MenuSeparator />
                    <MenuLabel>Switch to</MenuLabel>
                    <For each={artifacts()}>
                        {(d) => (
                            <MenuItem
                                selected={d.id === currentArtifactId()}
                                onClick={() => requestSwitchArtifact(d.id)}
                            >
                                {d.title}
                            </MenuItem>
                        )}
                    </For>
                </Menu>
            }
        >
            <input
                ref={(el) => (inputEl = el)}
                class={`${inputCls} w-56 font-semibold`}
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
    );
};

// Small icon-only undo/redo, greyed when their stack is empty. Content edits, theme changes, format
// switches and renames all share one stack (see editor.ts), so these step through everything.
const HistoryButtons: Component = () => (
    <div class="flex items-center gap-0.5">
        <IconButton size="lg" tone="soft" disabled={!canUndo()} title="Undo (⌘Z)" onClick={undo}>
            <Icon name="undo" size={15} />
        </IconButton>
        <IconButton size="lg" tone="soft" disabled={!canRedo()} title="Redo (⌘⇧Z)" onClick={redo}>
            <Icon name="redo" size={15} />
        </IconButton>
    </div>
);

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
        <Button variant="tool" size="sm" title="Theme" onClick={() => requestThemePicker()}>
            <Swatch
                surface={current().tokens.surface}
                ink={current().tokens.ink}
                accent={current().tokens.accent}
            />
            {current().name}
        </Button>
    );
};

const FORMATS = [
    { id: "deck", label: "Deck" },
    { id: "doc", label: "Doc" },
    { id: "web", label: "Web" },
];

const ExportMenu: Component = () => {
    const [busy, setBusy] = createSignal(false);
    // The workspace plan decides which formats are unlocked and whether exports carry the Galleo mark.
    const allows = (f: "png" | "pdf" | "print"): boolean => features().exportFormats.includes(f);
    const brand = (): boolean => !features().removeBranding;
    const run = async (fn: () => void | Promise<void>): Promise<void> => {
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
            <MenuItem onClick={() => run(fn)}>{label}</MenuItem>
        ) : (
            <MenuItem
                icon={<Icon name="lock" size={12} />}
                trailing={<Badge tone="accentSoft">Pro</Badge>}
                onClick={() => requestUpgrade()}
            >
                {label}
            </MenuItem>
        );
    return (
        <Menu
            align="end"
            width={208}
            trigger={(m) => (
                <Button
                    ref={m.ref}
                    variant="tool"
                    size="sm"
                    loading={busy()}
                    onClick={() => !busy() && m.toggle()}
                >
                    <Show
                        when={busy()}
                        fallback={
                            <>
                                <Icon name="export" size={14} /> Export{" "}
                                <Icon name="chevron" size={11} />
                            </>
                        }
                    >
                        Exporting
                    </Show>
                </Button>
            )}
        >
            {item("PDF", "pdf", () =>
                exportPdfAuto(editor.artifact, editorTokens(), { brand: brand() }),
            )}
            {item("PNG — deck", "png", () =>
                exportDeckPng(editor.artifact, editorTokens(), { brand: brand() }),
            )}
            {item("Print…", "print", () => exportPrint(editor.artifact, editorTokens()))}
        </Menu>
    );
};

const FormatSwitcher: Component = () => (
    <Segmented
        value={editor.artifact.format}
        options={FORMATS.map((f) => ({ label: f.label, value: f.id }))}
        onChange={(v) => commit(setArtifactFormat(editor.artifact, v))}
    />
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
        <Button variant="tool" size="sm" onClick={() => present()}>
            <Icon name={editor.artifact.format === "deck" ? "present" : "preview"} size={14} />
            {editor.artifact.format === "deck" ? "Present" : "Preview"}
        </Button>
        <Button
            variant="tool"
            size="sm"
            title={features().publicLinks ? "Share" : "Sharing is a paid feature — upgrade"}
            onClick={() => (features().publicLinks ? requestShare() : requestUpgrade())}
        >
            <Icon name={features().publicLinks ? "link" : "lock"} size={14} />
            Share
        </Button>
        <ExportMenu />
    </header>
);
