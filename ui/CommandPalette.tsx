import type { Component, JSX } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    untrack,
} from "solid-js";
import { Icon } from "./icons";
import {
    listPaletteSources,
    paletteDisplay,
    snippetRuns,
    type Bucket,
    type Row,
} from "./palette-model";
import {
    bindingLabel,
    closePalette,
    currentCtx,
    keyHintIcon,
    listCommands,
    paletteOpen,
    pushScope,
    slashAlias,
    type KeyCtx,
} from "./keys";

interface Level {
    title: string;
    rows: Row[];
}

// A leading "/" turns the palette into the command catalog; the landing list stays jump-to first.
const COMMAND_PREFIX = "/";
const REMOTE_DEBOUNCE = 130; // ms of quiet before a source's `remote` fires

const [recentIds, setRecentIds] = createSignal<string[]>([]);
function noteRun(id: string): void {
    setRecentIds((r) => [id, ...r.filter((x) => x !== id)].slice(0, 6));
}

export const CommandPalette: Component = () => (
    <Show when={paletteOpen()}>
        <PaletteBody />
    </Show>
);

const PaletteBody: Component = () => {
    let inputEl!: HTMLInputElement;
    let listEl!: HTMLDivElement;
    let prevFocus: HTMLElement | null = null;
    const [query, setQuery] = createSignal("");
    const [stack, setStack] = createSignal<Level[]>([]);
    const [active, setActive] = createSignal(0);
    // last resolved remote rows per source, tagged with the query they answer
    const [remote, setRemote] = createSignal<Record<string, { query: string; rows: Row[] }>>({});

    const ctx = (): KeyCtx => currentCtx();
    const commandMode = (): boolean => query().startsWith(COMMAND_PREFIX);
    const term = (): string =>
        commandMode() ? query().slice(COMMAND_PREFIX.length).trim() : query().trim();

    const rootRows = (): Row[] =>
        listCommands(ctx()).map((c) => ({
            id: c.id,
            title: c.title,
            group: c.group,
            icon: c.icon,
            keywords: c.keywords,
            slash: slashAlias(c),
            dangerous: c.dangerous,
            run: c.run,
            provider: c.provider,
            hint: bindingLabel(c.id) ?? undefined,
            hintIcon: keyHintIcon(c.id) ?? undefined,
        }));

    const levelTitle = (): string | undefined => stack().at(-1)?.title;
    const levelRows = createMemo<Row[]>(() => stack().at(-1)?.rows ?? rootRows());

    const atRoot = (): boolean => stack().length === 0;

    // sources only feed the root list; a sub-list is its own closed world
    const buckets = createMemo<Bucket[]>(() => {
        if (!atRoot() || commandMode()) return [];
        const q = term();
        const cached = remote();
        return listPaletteSources(ctx()).map((s) => {
            const fresh = cached[s.id];
            const rows =
                fresh && fresh.query === q ? fresh.rows : (s.local?.(q, untrack(ctx)) ?? []);
            return { section: s.section, rows };
        });
    });

    let debounce = 0;
    let inflight: AbortController | null = null;
    createEffect(() => {
        const q = term();
        const skip = !atRoot() || commandMode();
        const sources = listPaletteSources(untrack(ctx));
        inflight?.abort();
        window.clearTimeout(debounce);
        if (skip) return;
        const due = sources.filter((s) => s.remote && q.length >= (s.minQuery ?? 1));
        if (!due.length) return;
        const ctrl = new AbortController();
        inflight = ctrl;
        debounce = window.setTimeout(() => {
            for (const s of due)
                void s
                    .remote?.(q, untrack(ctx), ctrl.signal)
                    .then((rows) => {
                        if (ctrl.signal.aborted) return;
                        setRemote((r) => ({ ...r, [s.id]: { query: q, rows } }));
                    })
                    .catch(() => {
                        /* a failed or aborted source falls back to its local rows */
                    });
        }, REMOTE_DEBOUNCE);
    });
    onCleanup(() => {
        inflight?.abort();
        window.clearTimeout(debounce);
    });

    const display = createMemo(() =>
        paletteDisplay({
            commands: levelRows(),
            query: term(),
            atRoot: atRoot(),
            recentIds: recentIds(),
            buckets: buckets(),
            commandMode: commandMode(),
        }),
    );
    const visible = createMemo<Row[]>(() => display().map((d) => d.row));
    const activeRow = (): Row | undefined => visible()[active()];

    createEffect(() => {
        visible();
        setActive(0);
    });
    createEffect(() => {
        const i = active();
        const el = listEl?.querySelector<HTMLElement>(`[data-row="${i}"]`);
        el?.scrollIntoView?.({ block: "nearest" });
    });

    const choose = async (row: Row, alt = false): Promise<void> => {
        if (row.provider) {
            const items = await row.provider(ctx());
            setStack((s) => [...s, { title: row.title, rows: items }]);
            setQuery("");
            inputEl.focus();
            return;
        }
        closePalette();
        noteRun(row.id);
        if (alt && row.altRun) await row.altRun(ctx());
        else await row.run?.(ctx());
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        const rows = visible();
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(rows.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const row = rows[active()];
            if (row) void choose(row, e.metaKey || e.ctrlKey);
        } else if (e.key === "Backspace" && !query() && stack().length) {
            e.preventDefault();
            setStack((s) => s.slice(0, -1));
        }
    };

    onMount(() => {
        prevFocus = document.activeElement as HTMLElement | null;
        const dispose = pushScope("palette", { exclusive: true, onEscape: closePalette });
        inputEl.focus();
        onCleanup(() => {
            dispose();
            prevFocus?.focus?.();
        });
    });

    const cardRow = (row: Row): JSX.Element => (
        <>
            <span class="h-12.5 w-20 flex-none overflow-hidden rounded-md">{row.thumb?.()}</span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="truncate font-medium">{row.title}</span>
                <Show when={row.subtitle}>
                    {(s) => <span class="truncate text-[11.5px] text-muted">{s()}</span>}
                </Show>
                <Show when={row.snippet}>
                    {(s) => (
                        <span class="truncate text-[11.5px] text-soft">
                            <For each={snippetRuns(s())}>
                                {(run) => (
                                    <Show when={run.hit} fallback={run.text}>
                                        <mark class="bg-accent/15 text-ink">{run.text}</mark>
                                    </Show>
                                )}
                            </For>
                        </span>
                    )}
                </Show>
            </span>
            <Show when={row.meta}>
                {(m) => <span class="flex-none pt-0.5 text-[11px] text-muted">{m()}</span>}
            </Show>
        </>
    );

    const commandRow = (row: Row): JSX.Element => (
        <>
            <Show when={row.icon}>{(name) => <Icon name={name()} size={15} />}</Show>
            <span class="min-w-0 flex-1 truncate">{row.title}</span>
            <Show when={commandMode() && row.slash}>
                {(alias) => <span class="font-mono text-[11px] text-muted">{alias()}</span>}
            </Show>
            <Show when={row.provider}>
                <Icon name="chevronRight" size={14} />
            </Show>
            <Show when={row.hintIcon}>
                {(name) => (
                    <span class="self-center text-muted">
                        <Icon name={name()} size={15} />
                    </span>
                )}
            </Show>
            <Show when={!row.hintIcon && row.hint}>
                {(h) => <span class="font-mono text-[11px] text-muted">{h()}</span>}
            </Show>
        </>
    );

    const rowButton = (row: Row, i: number): JSX.Element => (
        <button
            type="button"
            data-row={i}
            role="option"
            aria-selected={i === active()}
            class={`flex w-full gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] ${
                row.thumb ? "items-start py-2" : "icon-row py-2"
            } ${i === active() ? "bg-canvas" : "hover:bg-canvas/60"} ${
                row.dangerous ? "text-accent" : "text-ink"
            }`}
            onMouseMove={() => setActive(i)}
            onClick={(e) => void choose(row, e.metaKey || e.ctrlKey)}
        >
            {row.thumb ? cardRow(row) : commandRow(row)}
        </button>
    );

    return (
        <div class="fixed inset-0 z-popover flex items-start justify-center p-4 pt-[12vh]">
            <div class="absolute inset-0 bg-black/40" onPointerDown={closePalette} />
            <div
                class="relative flex max-h-[70vh] w-full max-w-150 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
                role="combobox"
                aria-expanded={true}
                aria-haspopup="listbox"
            >
                <Show when={levelTitle()}>
                    {(t) => (
                        <button
                            type="button"
                            class="flex icon-row gap-1.5 border-b border-line px-3.5 pt-3 pb-1 text-left text-[12px] font-semibold text-muted hover:text-ink"
                            onClick={() => setStack((s) => s.slice(0, -1))}
                        >
                            <Icon name="chevronLeft" size={13} /> {t()}
                        </button>
                    )}
                </Show>
                <input
                    ref={inputEl}
                    class="w-full bg-transparent px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-muted"
                    placeholder={
                        levelTitle()
                            ? `Search ${levelTitle()}…`
                            : "Jump to an artifact, or / for commands…"
                    }
                    value={query()}
                    spellcheck={false}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                    onKeyDown={onKeyDown}
                />
                <div
                    ref={listEl}
                    class="min-h-0 flex-1 overflow-y-auto border-t border-line p-1.5"
                    role="listbox"
                >
                    <Show
                        when={display().length}
                        fallback={
                            <div class="px-3 py-6 text-center text-[13px] text-muted">
                                Nothing matches “{term()}”.
                            </div>
                        }
                    >
                        <For each={display()}>
                            {(d, i) => (
                                <>
                                    <Show when={d.header}>
                                        {(label) => (
                                            <div class="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                                {label()}
                                            </div>
                                        )}
                                    </Show>
                                    {rowButton(d.row, i())}
                                </>
                            )}
                        </For>
                    </Show>
                </div>
                <div class="flex items-center gap-3 border-t border-line px-3.5 py-1.5 text-[10.5px] text-muted">
                    <span>↑↓ navigate</span>
                    <span>↵ open</span>
                    <Show when={activeRow()?.altLabel}>{(label) => <span>⌘↵ {label()}</span>}</Show>
                    <span class="ml-auto">
                        Type <span class="font-mono">{COMMAND_PREFIX}</span> for commands
                    </span>
                </div>
            </div>
        </div>
    );
};
