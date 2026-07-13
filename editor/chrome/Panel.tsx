import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { getElementAt } from "@elements/ops";
import { getElement, listElements } from "@elements/spec";
import { editor, rightTab, selection, setRightTab } from "../editor";
import { IconButton, Eyebrow } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { FloatingPanel } from "@ui/overlay";
import { ElementInspector } from "../inspect/inspectors";
import { PaletteItem } from "../canvas/insert";

// hidden from the palette: internal container/drop-preview + back-compat chart/diagram catch-alls (per-type tiles show instead).
const HIDDEN = new Set(["group", "__dropghost", "chart", "diagram", "avatar"]);
const CAT_ORDER = ["text", "media", "table", "composite", "chart", "diagram", "basic"];
const CAT_LABEL: Record<string, string> = {
    text: "Text",
    media: "Media",
    table: "Table",
    composite: "Composite",
    chart: "Charts",
    diagram: "Diagrams",
    basic: "Basic",
};

export const Panel: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));
    const cats = createMemo(() => CAT_ORDER.filter((c) => all.some((s) => s.category === c)));

    const elementAddr = createMemo(() => {
        const s = selection();
        return s?.kind === "element" ? s.address : null;
    });
    // Elements fully editable on-canvas skip the panel: rich-text (format bar), containers (handles), and
    // any whose `bar` already surfaces every control.
    const elementInline = createMemo((): boolean => {
        const a = elementAddr();
        if (!a) return false;
        const spec = getElement(getElementAt(editor.artifact, a)?.type ?? "");
        if (!spec) return false;
        if (spec.richText || spec.container) return true;
        const bar = spec.bar ?? [];
        return spec.controls.length > 0 && spec.controls.every((c) => bar.includes(c.key));
    });
    const inspectorLabel = createMemo((): string | null => {
        const a = elementAddr();
        if (!a || elementInline()) return null;
        const type = getElementAt(editor.artifact, a)?.type;
        return (type && getElement(type)?.label) || "Element";
    });

    // A non-inline selection opens the inspector; inline elements + sections are handled elsewhere.
    createEffect(() => {
        const s = selection();
        const showInspector = s?.kind === "element" && !elementInline();
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
        <IconButton
            size="xl"
            tone="muted"
            active={rightTab() === id}
            title={label}
            onClick={() => setRightTab((t) => (t === id ? null : id))}
        >
            <Icon name={id} />
        </IconButton>
    );

    return (
        <div class="absolute right-3 top-1/2 z-chrome flex -translate-y-1/2 items-stretch gap-2">
            <Show when={rightTab()}>
                {(tab) => (
                    <FloatingPanel
                        as="aside"
                        pad="lg"
                        shadow="panel"
                        class="flex max-h-[calc(100vh-120px)] w-[284px] flex-col overflow-y-auto"
                    >
                        <Show
                            when={tab() === "inspector"}
                            fallback={
                                <>
                                    <Eyebrow as="div" mono={false} weight="semibold" class="mb-3">
                                        {tab() === "search"
                                            ? "All elements"
                                            : (CAT_LABEL[tab()] ?? tab())}
                                    </Eyebrow>
                                    <TextField
                                        type="search"
                                        value={q()}
                                        placeholder="Search elements…"
                                        class="mb-4"
                                        onChange={setQ}
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
                            </Switch>
                        </Show>
                    </FloatingPanel>
                )}
            </Show>

            <FloatingPanel pad="sm" shadow="panel" class="flex flex-col gap-1 self-center">
                <Show when={inspectorLabel()}>{(label) => railBtn("inspector", label())}</Show>
                {railBtn("search", "Search")}
                <For each={cats()}>{(c) => railBtn(c, CAT_LABEL[c] ?? c)}</For>
            </FloatingPanel>
        </div>
    );
};
