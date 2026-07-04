import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { getElementAt } from "@elements/ops";
import { getElement, listElements } from "@elements/spec";
import { editor, rightTab, selection, setRightTab } from "../editor";
import { Icon } from "../icons";
import { ElementInspector } from "../overlay/ElementInspector";
import { PaletteItem } from "../overlay/PaletteItem";
import { SectionInspector } from "../overlay/SectionInspector";

const HIDDEN = new Set(["group", "__dropghost"]); // internal container + drop preview, not palette items
const CAT_ORDER = [
    "text",
    "media",
    "data",
    "interactive",
    "branding",
    "layout",
    "decoration",
    "container",
];
const CAT_LABEL: Record<string, string> = {
    text: "Text",
    media: "Media",
    data: "Data & charts",
    interactive: "Interactive",
    branding: "Branding",
    layout: "Layout",
    decoration: "Decoration",
    container: "Containers",
};

// Right side: an always-on vertical icon rail. Clicking an icon opens a flyout — a category's
// draggable elements, a search over all of them, or the inspector for the current selection.
export const Panel: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));
    const cats = createMemo(() => CAT_ORDER.filter((c) => all.some((s) => s.category === c)));

    const sectionId = createMemo(() => {
        const s = selection();
        return s?.kind === "section" ? s.section : null;
    });
    const elementAddr = createMemo(() => {
        const s = selection();
        return s?.kind === "element" ? s.address : null;
    });
    // Elements edited entirely on the canvas skip the docked panel: rich-text (text) via the format bar,
    // and containers (group/card) via resize/spacing/column handles + their controls on the ContextBar.
    const elementInline = createMemo((): boolean => {
        const a = elementAddr();
        if (!a) return false;
        const spec = getElement(getElementAt(editor.artifact, a)?.type ?? "");
        return !!(spec?.richText || spec?.container);
    });
    const inspectorLabel = createMemo((): string | null => {
        if (sectionId()) return "Section";
        const a = elementAddr();
        if (!a || elementInline()) return null;
        const type = getElementAt(editor.artifact, a)?.type;
        return (type && getElement(type)?.label) || "Element";
    });

    // Selecting a section or a non-inline element opens the deep inspector in the rail; the floating
    // ContextBar handles the quick edits. Rich-text + container elements skip the panel entirely.
    createEffect(() => {
        const s = selection();
        const showInspector = s?.kind === "section" || (s?.kind === "element" && !elementInline());
        if (showInspector) setRightTab("inspector");
        else setRightTab((t) => (t === "inspector" ? null : t));
    });

    const items = createMemo(() => {
        const query = q().trim().toLowerCase();
        if (query)
            return all.filter(
                (s) => s.label.toLowerCase().includes(query) || s.type.includes(query),
            );
        const tab = rightTab();
        return tab && tab !== "inspector" && tab !== "search"
            ? all.filter((s) => s.category === tab)
            : all;
    });

    const railBtn = (id: string, label: string): JSX.Element => (
        <button
            title={label}
            class={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                rightTab() === id
                    ? "bg-accent text-onaccent"
                    : "text-soft hover:bg-canvas hover:text-ink"
            }`}
            onClick={() => setRightTab((t) => (t === id ? null : id))}
        >
            <Icon name={id} />
        </button>
    );

    return (
        <div class="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-stretch gap-2">
            <Show when={rightTab()}>
                {(tab) => (
                    <aside class="flex max-h-[calc(100vh-120px)] w-[284px] flex-col overflow-y-auto rounded-2xl border border-line bg-panel/95 p-[18px] shadow-2xl backdrop-blur-md">
                        <Show
                            when={tab() === "inspector"}
                            fallback={
                                <>
                                    <div class="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                        {tab() === "search"
                                            ? "All elements"
                                            : (CAT_LABEL[tab()] ?? tab())}
                                    </div>
                                    <input
                                        value={q()}
                                        onInput={(e) => setQ(e.currentTarget.value)}
                                        placeholder="Search elements…"
                                        class="mb-4 w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                                    />
                                    <div class="grid grid-cols-2 gap-3">
                                        <For each={items()}>
                                            {(s) => <PaletteItem type={s.type} />}
                                        </For>
                                    </div>
                                    <Show when={items().length === 0}>
                                        <p class="text-[13px] text-muted">No elements match.</p>
                                    </Show>
                                </>
                            }
                        >
                            <Switch
                                fallback={
                                    <p class="text-[13px] text-muted">
                                        Select something to edit it.
                                    </p>
                                }
                            >
                                <Match when={!elementInline() && elementAddr()}>
                                    {(a) => <ElementInspector address={a()} />}
                                </Match>
                                <Match when={sectionId()}>
                                    {(id) => <SectionInspector section={id()} />}
                                </Match>
                            </Switch>
                        </Show>
                    </aside>
                )}
            </Show>

            <div class="flex flex-col gap-1 self-center rounded-2xl border border-line bg-panel/95 p-1.5 shadow-2xl backdrop-blur-md">
                <Show when={inspectorLabel()}>{(label) => railBtn("inspector", label())}</Show>
                {railBtn("search", "Search")}
                <For each={cats()}>{(c) => railBtn(c, CAT_LABEL[c] ?? c)}</For>
            </div>
        </div>
    );
};
