import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { setArtifactTheme } from "@elements/ops";
import { resolveTheme, THEME_LIST } from "@themes/library";
import { commit, editor } from "./editor";

const btn = "cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink";

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
                <div class="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-line bg-white p-1.5 shadow-xl">
                    <For each={THEME_LIST}>
                        {(t) => (
                            <button
                                class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${t.id === current().id ? "bg-[#faf2e9] font-semibold" : "hover:bg-[#f6f2ea]"}`}
                                onClick={() => pick(t.id)}
                            >
                                <Swatch surface={t.tokens.surface} ink={t.tokens.ink} accent={t.tokens.accent} />
                                {t.name}
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
        <span class="text-[13px] text-muted">Untitled artifact</span>
        <span class="flex-1" />
        <ThemeMenu />
        <button class={btn}>Present</button>
        <button class={btn}>Share</button>
        <button class={`${btn} border-accent bg-accent text-white`}>✦ Generate</button>
    </header>
);
