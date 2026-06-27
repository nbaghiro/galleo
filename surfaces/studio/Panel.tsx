import type { Component } from "solid-js";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { listElements } from "@elements/registry";
import { ElementInspector } from "./ElementInspector";
import { selection, setRightOpen } from "./editor";
import { PaletteItem } from "./PaletteItem";
import { SectionInspector } from "./SectionInspector";

const HIDDEN = new Set(["group"]); // internal container, not a palette item
const CATEGORY_ORDER = [
    "text",
    "media",
    "data",
    "interactive",
    "branding",
    "layout",
    "decoration",
    "container",
];
const CATEGORY_LABELS: Record<string, string> = {
    text: "Text",
    media: "Media",
    data: "Data & charts",
    interactive: "Interactive",
    branding: "Branding",
    layout: "Layout",
    decoration: "Decoration",
    container: "Containers",
};

// The element library: a search field over categorized, searchable element tiles (drag source).
const Palette: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));

    const groups = createMemo(() => {
        const query = q().trim().toLowerCase();
        const items = query
            ? all.filter((s) => s.label.toLowerCase().includes(query) || s.type.includes(query))
            : all;
        if (query) return [{ name: "", types: items.map((s) => s.type) }];
        const byCat = new Map<string, string[]>();
        for (const s of items) {
            if (!byCat.has(s.category)) byCat.set(s.category, []);
            byCat.get(s.category)!.push(s.type);
        }
        const known = CATEGORY_ORDER.filter((c) => byCat.has(c));
        const extra = [...byCat.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
        return [...known, ...extra].map((c) => ({
            name: CATEGORY_LABELS[c] ?? c,
            types: byCat.get(c)!,
        }));
    });

    return (
        <>
            <input
                value={q()}
                onInput={(e) => setQ(e.currentTarget.value)}
                placeholder="Search elements…"
                class="mb-4 w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
            />
            <For each={groups()}>
                {(grp) => (
                    <div class="mb-4">
                        <Show when={grp.name}>
                            <div class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                {grp.name}
                            </div>
                        </Show>
                        <div class="grid grid-cols-2 gap-3">
                            <For each={grp.types}>{(t) => <PaletteItem type={t} />}</For>
                        </div>
                    </div>
                )}
            </For>
            <Show when={groups().length === 0}>
                <p class="text-[13px] text-muted">No elements match.</p>
            </Show>
        </>
    );
};

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
        <aside class="absolute right-3 top-3 z-20 flex max-h-[calc(100%-24px)] w-[300px] flex-col overflow-y-auto rounded-2xl border border-line bg-panel/95 p-[18px] shadow-2xl backdrop-blur-md">
            <div class="mb-2 flex justify-end">
                <button
                    class="flex h-5 w-5 items-center justify-center rounded text-[11px] text-muted hover:text-ink"
                    title="Hide"
                    onClick={() => setRightOpen(false)}
                >
                    ✕
                </button>
            </div>
            <Switch fallback={<Palette />}>
                <Match when={elementAddr()}>
                    {(addr) => <ElementInspector address={addr()} />}
                </Match>
                <Match when={sectionId()}>{(id) => <SectionInspector section={id()} />}</Match>
            </Switch>
        </aside>
    );
};
