import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { setArtifactFormat, setArtifactTheme } from "@elements/ops";
import { resolveTheme, THEME_LIST } from "@themes/library";
import { DEMOS } from "./demos";
import { commit, demoId, editor, loadDemo, present, setAgentOpen } from "./editor";
import { exportDeckPng, exportPdf, exportPrint } from "./export-pdf";

const btnBase = "cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-semibold";
const btn = `${btnBase} border-line bg-canvas text-ink`;
const btnAccent = `${btnBase} border-accent bg-accent text-onaccent`;

const DocMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const current = createMemo(
        () => DEMOS.find((d) => d.id === demoId()) ?? { id: demoId(), title: "Generated deck" },
    );

    return (
        <div class="relative">
            <button
                class="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
                onClick={() => setOpen((o) => !o)}
            >
                {current().title} <span class="text-[10px]">▾</span>
            </button>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                    <For each={DEMOS}>
                        {(d) => (
                            <button
                                class={`block w-full rounded-lg px-2.5 py-2 text-left text-[13px] ${d.id === demoId() ? "bg-canvas font-semibold text-accent" : "hover:bg-canvas"}`}
                                onClick={() => {
                                    loadDemo(d.id);
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

const ThemeMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const current = createMemo(() => resolveTheme(editor.artifact.theme));
    const pick = (id: string): void => {
        commit(setArtifactTheme(editor.artifact, id));
        setOpen(false);
    };

    return (
        <div class="relative">
            <button class={`${btn} flex items-center gap-2`} onClick={() => setOpen((o) => !o)}>
                <Swatch
                    surface={current().tokens.surface}
                    ink={current().tokens.ink}
                    accent={current().tokens.accent}
                />
                {current().name}
            </button>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute right-0 z-20 mt-2 max-h-[72vh] w-60 overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                    <For each={THEME_LIST}>
                        {(t) => (
                            <button
                                class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${t.id === current().id ? "bg-canvas font-semibold text-accent" : "hover:bg-canvas"}`}
                                onClick={() => pick(t.id)}
                            >
                                <Swatch
                                    surface={t.tokens.surface}
                                    ink={t.tokens.ink}
                                    accent={t.tokens.accent}
                                />
                                <span class="flex-1 truncate">{t.name}</span>
                                <span class="text-[10px] text-muted">{t.tag}</span>
                            </button>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
};

const FORMATS = [
    { id: "deck", label: "Deck" },
    { id: "doc", label: "Doc" },
    { id: "web", label: "Web" },
];

const ExportMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const item = (label: string, fn: () => void | Promise<void>): JSX.Element => (
        <button
            class="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-canvas"
            onClick={() => {
                setOpen(false);
                void fn();
            }}
        >
            {label}
        </button>
    );
    return (
        <div class="relative">
            <button class={btn} onClick={() => setOpen((o) => !o)}>
                Export <span class="text-[10px]">▾</span>
            </button>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                    {item("PDF — slides", exportPdf)}
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
        <span class="font-mono text-[15px] font-bold tracking-wide text-accent">GALLEO</span>
        <DocMenu />
        <span class="flex-1" />
        <FormatSwitcher />
        <ThemeMenu />
        <button class={btn} onClick={() => present()}>
            ▶ Present
        </button>
        <ExportMenu />
        <button class={btnAccent} onClick={() => setAgentOpen(true)}>
            ✦ Generate
        </button>
    </header>
);
