import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { setArtifactTheme } from "@elements/ops";
import { resolveTheme, THEME_LIST } from "@themes/library";
import { DEMOS } from "./demos";
import { commit, demoId, editor, loadDemo, present, setAgentOpen } from "./editor";
import { exportPrint } from "./export-pdf";

const btn = "cursor-pointer rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12px] font-semibold text-ink";

const DocMenu: Component = () => {
    const [open, setOpen] = createSignal(false);
    const current = createMemo(() => DEMOS.find((d) => d.id === demoId()) ?? DEMOS[0]!);

    return (
        <div class="relative">
            <button class="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink" onClick={() => setOpen((o) => !o)}>
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
                <Swatch surface={current().tokens.surface} ink={current().tokens.ink} accent={current().tokens.accent} />
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
                                <Swatch surface={t.tokens.surface} ink={t.tokens.ink} accent={t.tokens.accent} />
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

export const Topbar: Component = () => (
    <header class="flex items-center gap-3.5 border-b border-line bg-panel px-[18px]">
        <span class="font-mono text-[15px] font-bold tracking-wide text-accent">GALLEO</span>
        <DocMenu />
        <span class="flex-1" />
        <ThemeMenu />
        <button class={btn} onClick={() => present()}>▶ Present</button>
        <button class={btn} onClick={() => exportPrint()}>Export</button>
        <button class={`${btn} border-accent bg-accent text-onaccent`} onClick={() => setAgentOpen(true)}>✦ Generate</button>
    </header>
);
