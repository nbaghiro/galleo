import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, Show } from "solid-js";
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
    requestThemePicker,
    requestUpgrade,
    undo,
} from "../editor";
import { exportDeckPng, exportPdfAuto, exportPrint } from "@canvas/render/export";
import { exportPptx } from "@canvas/render/pptx";
import type { ExportFormat } from "@model/billing";
import { Button, IconButton, Badge } from "@ui/button";
import { Segmented } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Menu, MenuItem } from "@ui/menu";

const ArtifactName: Component = () => {
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
                <button
                    class="cursor-text rounded px-1 text-[13px] text-muted hover:text-ink"
                    title="Rename"
                    onClick={startRename}
                >
                    {current()}
                </button>
            }
        >
            <input
                ref={(el) => (inputEl = el)}
                class="rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-accent"
                size={Math.max(draft().length, 8)}
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

// Undo/redo — one shared stack covers content, theme, format, and rename (see editor.ts).
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

// Opens the app-level theme drawer (wired by the host via onThemePicker); the button shows the current theme.
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
    const allows = (f: ExportFormat): boolean => features().exportFormats.includes(f);
    const brand = (): boolean => !features().removeBranding;
    const run = async (fn: () => void | Promise<void>): Promise<void> => {
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };
    // Menu row: unlocked runs the export; locked shows a "Pro" row that routes to pricing.
    const item = (
        label: string,
        format: ExportFormat,
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
            {item("PowerPoint", "pptx", () =>
                exportPptx(editor.artifact, editorTokens(), { brand: brand() }),
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
    <header class="relative z-menu flex items-center gap-3.5 border-b border-line bg-panel px-[18px]">
        <button
            class="cursor-pointer font-mono text-[15px] font-bold tracking-wide text-accent hover:opacity-80"
            title="Back to library"
            onClick={() => requestHome()}
        >
            GALLEO
        </button>
        <ArtifactName />
        <HistoryButtons />
        <span class="flex-1" />
        <FormatSwitcher />
        <ThemeMenu />
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
        <Button variant="tool" size="sm" onClick={() => present()}>
            <Icon name={editor.artifact.format === "deck" ? "present" : "preview"} size={14} />
            {editor.artifact.format === "deck" ? "Present" : "Preview"}
        </Button>
    </header>
);
