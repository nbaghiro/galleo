import type { Component, JSX } from "solid-js";
import { createSignal, createMemo, For, onMount, Show } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import type { Template } from "@model/templates";
import { api, type ArtifactSummary } from "../api";
import { Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Popover } from "@ui/overlay";
import { contextList, contextsLoaded, loadContexts } from "../stores/contexts";
import { templatesOnce } from "../stores/templates";

/** The workspace's contexts as toggle rows; `selected` ids feed the turn's contextIds. */
export const ContextToggleRows: Component<{
    selected: string[];
    onChange: (ids: string[]) => void;
}> = (props) => {
    onMount(() => void loadContexts());

    const toggle = (id: string): void =>
        props.onChange(
            props.selected.includes(id)
                ? props.selected.filter((s) => s !== id)
                : [...props.selected, id],
        );

    return (
        <For each={contextList()}>
            {(ctx) => (
                <button
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas"
                    onClick={() => toggle(ctx.id)}
                >
                    <span
                        class={`flex size-3.5 flex-none items-center justify-center rounded border ${
                            props.selected.includes(ctx.id)
                                ? "border-accent bg-accent text-onaccent"
                                : "border-line"
                        }`}
                    >
                        <Show when={props.selected.includes(ctx.id)}>
                            <Icon name="check" size={9} />
                        </Show>
                    </span>
                    <span class="min-w-0 flex-1 truncate">{ctx.name}</span>
                    <span class="flex-none font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                        {ctx.items}
                    </span>
                </button>
            )}
        </For>
    );
};

/** Checkbox popover over the contexts, for attaching to a chat conversation. */
export const ContextPicker: Component<{
    selected: string[];
    onChange: (ids: string[]) => void;
    anchor?: () => HTMLElement | undefined;
    open: boolean;
    onClose: () => void;
}> = (props) => (
    <Popover
        anchor={props.anchor}
        open={props.open}
        onClose={props.onClose}
        minWidth={240}
        estHeight={200}
    >
        <div class="p-1">
            <Show
                when={contextsLoaded() && !contextList().length}
                fallback={<ContextToggleRows selected={props.selected} onChange={props.onChange} />}
            >
                <p class="px-2 py-2 text-[12px] leading-snug text-muted">
                    No contexts yet — build one from the + menu on the generate screen, then attach
                    it here.
                </p>
            </Show>
        </div>
    </Popover>
);

export type SourcePick =
    | { kind: "artifact"; id: string; title: string }
    | { kind: "template"; id: string; title: string; content: ArtifactContent };

const pickRow = (onClick: () => void, title: string, tag: string): JSX.Element => (
    <button
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas"
        onClick={onClick}
    >
        <span class="min-w-0 flex-1 truncate">{title}</span>
        <span class="flex-none font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
            {tag}
        </span>
    </button>
);

/** Searchable pick-one list over the library AND the template catalog, for one Galleo artifact. */
export const SourcePickList: Component<{ onPick: (pick: SourcePick) => void }> = (props) => {
    const [artifacts, setArtifacts] = createSignal<ArtifactSummary[] | null>(null);
    const [templates, setTemplates] = createSignal<Template[] | null>(null);
    const [q, setQ] = createSignal("");
    onMount(() => {
        void api.listArtifacts("limit=100").then((page) => setArtifacts(page.artifacts));
        void templatesOnce().then(setTemplates);
    });
    const match = (title: string): boolean => {
        const needle = q().trim().toLowerCase();
        return !needle || title.toLowerCase().includes(needle);
    };
    const artifactHits = createMemo(() => (artifacts() ?? []).filter((a) => match(a.title)));
    const templateHits = createMemo(() => (templates() ?? []).filter((t) => match(t.name)));

    return (
        <div class="rounded-xl border border-line bg-panel p-2">
            <TextField
                compact
                icon="search"
                value={q()}
                placeholder="Find an artifact or a template…"
                onChange={setQ}
            />
            <div class="mt-1.5 flex max-h-70 flex-col overflow-y-auto">
                <Show
                    when={artifacts() && templates()}
                    fallback={
                        <div class="flex h-16 items-center justify-center">
                            <Spinner size={14} />
                        </div>
                    }
                >
                    <Show
                        when={artifactHits().length + templateHits().length}
                        fallback={<p class="px-2 py-3 text-[12px] text-muted">Nothing matches.</p>}
                    >
                        <Show when={artifactHits().length}>
                            <div class="px-2 pb-0.5 pt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                                Your library
                            </div>
                            <For each={artifactHits()}>
                                {(a) =>
                                    pickRow(
                                        () =>
                                            props.onPick({
                                                kind: "artifact",
                                                id: a.id,
                                                title: a.title,
                                            }),
                                        a.title,
                                        a.formatId,
                                    )
                                }
                            </For>
                        </Show>
                        <Show when={templateHits().length}>
                            <div class="px-2 pb-0.5 pt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                                Templates
                            </div>
                            <For each={templateHits()}>
                                {(t) =>
                                    pickRow(
                                        () =>
                                            props.onPick({
                                                kind: "template",
                                                id: t.id,
                                                title: t.name,
                                                content: t.content,
                                            }),
                                        t.name,
                                        t.category,
                                    )
                                }
                            </For>
                        </Show>
                    </Show>
                </Show>
            </div>
        </div>
    );
};
