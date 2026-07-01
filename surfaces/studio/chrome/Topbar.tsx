import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { setArtifactFormat } from "@elements/ops";
import {
    commit,
    currentArtifactId,
    artifacts,
    editor,
    editorTheme,
    present,
    requestHome,
    requestSwitchArtifact,
    requestThemePicker,
    setAgentOpen,
} from "../editor";
import { exportDeckPng, exportPdfAuto, exportPrint } from "../canvas/export-pdf";
import { Icon } from "../icons";

const btnBase = "cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-semibold";
const btn = `${btnBase} border-line bg-canvas text-ink`;
const btnAccent = `${btnBase} border-accent bg-accent text-onaccent`;

const ArtifactMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const current = createMemo(
        () => artifacts().find((d) => d.id === currentArtifactId())?.title ?? "Untitled",
    );

    return (
        <div class="relative">
            <button
                class="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
                onClick={() => setOpen((o) => !o)}
            >
                {current()} <Icon name="chevron" size={12} />
            </button>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute left-0 z-20 mt-2 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
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
    const run = async (fn: () => void | Promise<void>): Promise<void> => {
        setOpen(false);
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };
    const item = (label: string, fn: () => void | Promise<void>): JSX.Element => (
        <button
            class="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-canvas"
            onClick={() => run(fn)}
        >
            {label}
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
                    {item("PDF", exportPdfAuto)}
                    {item("PNG — deck", exportDeckPng)}
                    {item("Print…", exportPrint)}
                </div>
            </Show>
        </div>
    );
};

const FormatSwitcher: Component = () => (
    <div class="flex gap-0.5 rounded-lg border border-line bg-canvas p-0.5">
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
