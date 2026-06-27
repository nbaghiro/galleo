import type { Component } from "solid-js";
import { createMemo, For, Match, Switch } from "solid-js";
import { ElementInspector } from "./ElementInspector";
import { selection } from "./editor";
import { PaletteItem } from "./PaletteItem";
import { SectionInspector } from "./SectionInspector";

// Right panel — context-dependent: element selected → inspector; section selected → layout picker;
// otherwise the element palette (drag source).
const TYPES = ["text", "image", "stat", "chart", "bullets", "quote", "callout", "code", "button", "badge", "card", "divider", "spacer", "gradient"];

const Palette: Component = () => (
    <>
        <div class="mb-3 font-mono text-[11px] font-semibold tracking-wider text-muted">ELEMENTS · drag onto a section</div>
        <div class="grid grid-cols-2 gap-3">
            <For each={TYPES}>{(t) => <PaletteItem type={t} />}</For>
        </div>
    </>
);

export const Panel: Component = () => {
    const elementAddr = createMemo(() => {
        const s = selection();
        return s?.kind === "element" ? s.address : null;
    });
    const sectionId = createMemo(() => {
        const s = selection();
        return s?.kind === "section" ? s.section : null;
    });

    return (
        <aside class="overflow-y-auto border-l border-line bg-panel p-[18px]">
            <Switch fallback={<Palette />}>
                <Match when={elementAddr()}>{(addr) => <ElementInspector address={addr()} />}</Match>
                <Match when={sectionId()}>{(id) => <SectionInspector section={id()} />}</Match>
            </Switch>
        </aside>
    );
};
