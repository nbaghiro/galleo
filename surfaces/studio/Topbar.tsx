import type { Component } from "solid-js";

const btn =
    "cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink";

export const Topbar: Component = () => (
    <header class="flex items-center gap-3.5 border-b border-line bg-panel px-[18px]">
        <span class="font-mono text-[15px] font-bold tracking-wide text-accent">GALLEO</span>
        <span class="text-[13px] text-muted">Untitled artifact</span>
        <span class="flex-1" />
        <button class={btn}>Present</button>
        <button class={btn}>Share</button>
        <button class={`${btn} border-accent bg-accent text-white`}>✦ Generate</button>
    </header>
);
