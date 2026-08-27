import type { Accessor, Component, JSX } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import type { Template } from "@model/templates";
import { api, type ArtifactSummary } from "@app/api";
import { Button, Chip, IconButton, Spinner } from "@ui/button";
import { TextArea, TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Popover } from "@ui/overlay";
import { contextList, contextsLoaded, loadContexts } from "@app/stores/contexts";
import { templatesOnce } from "@app/stores/templates";
import {
    ACCEPT,
    ATTACH_ICON,
    formatBytes,
    SOURCE_OPTIONS,
    type Attachment,
    type SourceOption,
} from "@app/stores/attachments";

// One attach experience for every surface: the same "+" menu, option rows, and chips as the
// generate intake. What a pick DOES stays with the surface (transient attachment · ingest into a
// collection · toggle a collection onto the turn) via the handlers each one wires in.

const rowCls =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas";
// same row for options whose lead is a bare svg: icon-row seats it on the label's optical band
const iconRowCls =
    "flex w-full icon-row gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas";

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
                <button class={rowCls} onClick={() => toggle(ctx.id)}>
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

export type SourcePick =
    | { kind: "artifact"; id: string; title: string }
    | { kind: "template"; id: string; title: string; category: string; content: ArtifactContent };

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
export const SourcePickList: Component<{
    onPick: (pick: SourcePick) => void;
    /**
     * What picking a template will do here, when it is not "attach its text". The intake takes one
     * as a shape to follow, and the heading is the only place to say so before the click.
     */
    templateNote?: string;
}> = (props) => {
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
                                Templates{props.templateNote ? ` · ${props.templateNote}` : ""}
                            </div>
                            <For each={templateHits()}>
                                {(t) =>
                                    pickRow(
                                        () =>
                                            props.onPick({
                                                kind: "template",
                                                id: t.id,
                                                title: t.name,
                                                category: t.category,
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

export interface AttachSourceHandlers {
    onFiles: (files: FileList | null) => void;
    /** trimmed, never empty; the panel has already closed */
    onPaste: (text: string) => void;
    /** resolve true to close the link box; false keeps it open (fetch failed, error shown by the surface) */
    onLink: (url: string) => Promise<boolean>;
    onPick: (pick: SourcePick) => void;
    pastePlaceholder?: string;
    pasteLabel?: string;
    linkPlaceholder?: string;
}

export interface AttachSources {
    pasting: Accessor<boolean>;
    linking: Accessor<boolean>;
    picking: Accessor<boolean>;
    openFiles: () => void;
    openPaste: () => void;
    openLink: () => void;
    openPick: () => void;
    togglePick: () => void;
    /** the hidden file input + whichever inline editor is open; place once inside the surface */
    Panels: Component<{ class?: string; templateNote?: string }>;
}

/** Owns the source flows (file dialog, paste box, link box, artifact pick) behind the "+" menu. */
export function createAttachSources(handlers: AttachSourceHandlers): AttachSources {
    const [pasting, setPasting] = createSignal(false);
    const [linking, setLinking] = createSignal(false);
    const [picking, setPicking] = createSignal(false);
    const [paste, setPaste] = createSignal("");
    const [url, setUrl] = createSignal("");
    const [fetching, setFetching] = createSignal(false);
    let fileInput!: HTMLInputElement;

    const commitPaste = (): void => {
        const text = paste().trim();
        setPaste("");
        setPasting(false);
        if (text) handlers.onPaste(text);
    };

    const submitLink = async (): Promise<void> => {
        const target = url().trim();
        if (!target || fetching()) return;
        setFetching(true);
        try {
            if (await handlers.onLink(target)) {
                setUrl("");
                setLinking(false);
            }
        } finally {
            setFetching(false);
        }
    };

    const Panels: Component<{ class?: string; templateNote?: string }> = (props) => (
        <>
            <input
                ref={fileInput}
                type="file"
                multiple
                class="hidden"
                accept={ACCEPT}
                onChange={(e) => {
                    handlers.onFiles(e.currentTarget.files);
                    e.currentTarget.value = "";
                }}
            />
            <Show when={pasting()}>
                <div class={props.class}>
                    <TextArea
                        rounded="lg"
                        rows={5}
                        autofocus
                        placeholder={
                            handlers.pastePlaceholder ??
                            "Paste the notes, transcript, or copy this should be built from…"
                        }
                        value={paste()}
                        onChange={setPaste}
                    />
                    <div class="mt-1.5 flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={commitPaste}>
                            {handlers.pasteLabel ?? "Attach"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setPaste("");
                                setPasting(false);
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </Show>
            <Show when={linking()}>
                <div class={`flex items-center gap-1.5 ${props.class ?? ""}`}>
                    <TextField
                        compact
                        autofocus
                        value={url()}
                        placeholder={
                            handlers.linkPlaceholder ?? "https://…  (fetched and attached as text)"
                        }
                        onChange={setUrl}
                        onKeyDown={(e: KeyboardEvent) => {
                            if (e.key === "Enter") void submitLink();
                            if (e.key === "Escape") setLinking(false);
                        }}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        class="flex-none"
                        disabled={fetching()}
                        onClick={() => void submitLink()}
                    >
                        <Show when={!fetching()} fallback={<Spinner size={12} />}>
                            Fetch
                        </Show>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="flex-none"
                        onClick={() => {
                            setUrl("");
                            setLinking(false);
                        }}
                    >
                        Cancel
                    </Button>
                </div>
            </Show>
            <Show when={picking()}>
                <div class={props.class}>
                    <SourcePickList
                        templateNote={props.templateNote}
                        onPick={(pick) => {
                            setPicking(false);
                            handlers.onPick(pick);
                        }}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        class="mt-1.5"
                        onClick={() => setPicking(false)}
                    >
                        Cancel
                    </Button>
                </div>
            </Show>
        </>
    );

    return {
        pasting,
        linking,
        picking,
        openFiles: () => fileInput.click(),
        openPaste: () => setPasting(true),
        openLink: () => setLinking(true),
        openPick: () => setPicking(true),
        togglePick: () => setPicking(!picking()),
        Panels,
    };
}

export interface AttachCollections {
    selected: string[];
    onChange: (ids: string[]) => void;
    /** offered as the menu's last row (the intake opens its in-studio ContextsPane here) */
    onManage?: () => void;
    emptyCopy?: string;
}

/** The "+" trigger and its menu: source options (when offered) + context-collection toggles. */
export const AttachMenu: Component<{
    size?: "sm" | "md" | "lg" | "touch";
    rounded?: "md" | "lg" | "xl" | "full";
    class?: string;
    title?: string;
    sources?: AttachSources;
    collections?: AttachCollections;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    let anchor!: HTMLButtonElement;

    const act = (s: AttachSources, id: SourceOption["id"]): void => {
        if (id === "files") s.openFiles();
        else if (id === "paste") s.openPaste();
        else if (id === "link") s.openLink();
        else s.openPick();
    };
    const taken = (s: AttachSources, id: SourceOption["id"]): boolean =>
        id === "paste"
            ? s.pasting()
            : id === "link"
              ? s.linking()
              : id === "artifact"
                ? s.picking()
                : false;

    return (
        <>
            <IconButton
                ref={anchor}
                size={props.size ?? "md"}
                rounded={props.rounded}
                tone={props.collections?.selected.length ? "accent" : "muted"}
                class={props.class}
                title={
                    props.title ??
                    (props.sources
                        ? "Add context: files, pasted text, collections"
                        : "Attach a context collection")
                }
                onClick={() => setOpen(!open())}
            >
                <Icon name="plus" size={14} />
            </IconButton>
            <Popover
                anchor={() => anchor}
                open={open()}
                onClose={() => setOpen(false)}
                minWidth={260}
                estHeight={props.sources ? 280 : 200}
            >
                <div class="p-1">
                    <Show when={props.sources}>
                        {(s) => (
                            <>
                                <For each={SOURCE_OPTIONS}>
                                    {(opt) => (
                                        <button
                                            class={iconRowCls}
                                            disabled={taken(s(), opt.id)}
                                            onClick={() => {
                                                setOpen(false);
                                                act(s(), opt.id);
                                            }}
                                        >
                                            <Icon name={opt.icon} size={13} />
                                            <span class="flex-1">{opt.label}</span>
                                            <span class="font-mono text-[9px] text-muted">
                                                {opt.tag}
                                            </span>
                                        </button>
                                    )}
                                </For>
                                <Show when={props.collections}>
                                    <div class="mx-2 my-1 border-t border-line" />
                                </Show>
                            </>
                        )}
                    </Show>
                    <Show when={props.collections}>
                        {(col) => (
                            <>
                                <div class="px-2 pb-1 pt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                                    Context collections
                                </div>
                                <Show when={contextsLoaded() && !contextList().length}>
                                    <p class="px-2 pb-1 text-[11.5px] leading-snug text-muted">
                                        {col().emptyCopy ??
                                            "Reusable grounding built from files, links, and your library. Attach one to write from its facts."}
                                    </p>
                                </Show>
                                <ContextToggleRows
                                    selected={col().selected}
                                    onChange={(ids) => col().onChange(ids)}
                                />
                                <Show when={col().onManage}>
                                    <button
                                        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-soft hover:bg-canvas hover:text-ink"
                                        onClick={() => {
                                            setOpen(false);
                                            col().onManage!();
                                        }}
                                    >
                                        <Icon name="layers" size={13} />
                                        <span class="flex-1">
                                            {contextList().length
                                                ? "New or manage contexts…"
                                                : "Create a context…"}
                                        </span>
                                    </button>
                                </Show>
                            </>
                        )}
                    </Show>
                </div>
            </Popover>
        </>
    );
};

const contextName = (id: string): string =>
    contextList().find((c) => c.id === id)?.name ?? "Context";

/** Attached collections as removable chips; `title` says what attaching means on this surface. */
export const ContextChips: Component<{
    ids: string[];
    title: string;
    onRemove: (id: string) => void;
}> = (props) => (
    <For each={props.ids}>
        {(id) => (
            <Chip
                variant="outline"
                size="sm"
                rounded="md"
                class="max-w-full"
                title={props.title}
                onRemove={() => props.onRemove(id)}
            >
                <Icon name="layers" size={11} />
                <span class="truncate">{contextName(id)}</span>
            </Chip>
        )}
    </For>
);

/** One-off attachments as removable chips: per-kind icon, name, and how much text came along. */
export const AttachmentChips: Component<{
    items: Attachment[];
    onRemove: (id: string) => void;
}> = (props) => (
    <For each={props.items}>
        {(a) => (
            <Chip
                variant="outline"
                size="sm"
                rounded="md"
                class="max-w-full"
                title={`${a.text.length.toLocaleString()} characters`}
                onRemove={() => props.onRemove(a.id)}
            >
                <Icon name={ATTACH_ICON[a.kind]} size={11} />
                <span class="truncate">{a.name}</span>
                <span class="font-mono text-[9.5px] text-muted">{formatBytes(a.text.length)}</span>
            </Chip>
        )}
    </For>
);
