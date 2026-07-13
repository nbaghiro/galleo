import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "./icons";
import { paletteDisplay, type Row } from "./palette-model";
import {
    bindingLabel,
    closePalette,
    currentCtx,
    listCommands,
    paletteOpen,
    pushScope,
    type KeyCtx,
} from "./keys";

interface Level {
    title: string;
    rows: Row[];
}

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

    const ctx = (): KeyCtx => currentCtx();

    const rootRows = (): Row[] =>
        listCommands(ctx()).map((c) => ({
            id: c.id,
            title: c.title,
            group: c.group,
            icon: c.icon,
            keywords: c.keywords,
            dangerous: c.dangerous,
            run: c.run,
            provider: c.provider,
            hint: bindingLabel(c.id) ?? undefined,
        }));

    const levelTitle = (): string | undefined => stack().at(-1)?.title;
    const levelRows = createMemo<Row[]>(() => stack().at(-1)?.rows ?? rootRows());

    const display = createMemo(() =>
        paletteDisplay(levelRows(), query(), stack().length === 0, recentIds()),
    );
    const visible = createMemo<Row[]>(() => display().map((d) => d.row));

    createEffect(() => {
        visible();
        setActive(0);
    });
    createEffect(() => {
        const i = active();
        const el = listEl?.querySelector<HTMLElement>(`[data-row="${i}"]`);
        el?.scrollIntoView?.({ block: "nearest" });
    });

    const choose = async (row: Row): Promise<void> => {
        if (row.provider) {
            const items = await row.provider(ctx());
            setStack((s) => [...s, { title: row.title, rows: items }]);
            setQuery("");
            inputEl.focus();
            return;
        }
        closePalette();
        noteRun(row.id);
        await row.run?.(ctx());
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
            if (row) void choose(row);
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

    const rowButton = (row: Row, i: number): JSX.Element => (
        <button
            type="button"
            data-row={i}
            role="option"
            aria-selected={i === active()}
            class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] ${
                i === active() ? "bg-canvas" : "hover:bg-canvas/60"
            } ${row.dangerous ? "text-accent" : "text-ink"}`}
            onMouseMove={() => setActive(i)}
            onClick={() => void choose(row)}
        >
            <Show when={row.icon}>{(name) => <Icon name={name()} size={15} />}</Show>
            <span class="min-w-0 flex-1 truncate">{row.title}</span>
            <Show when={row.provider}>
                <Icon name="chevronRight" size={14} />
            </Show>
            <Show when={row.hint}>
                {(h) => <span class="font-mono text-[11px] text-muted">{h()}</span>}
            </Show>
        </button>
    );

    return (
        <div class="fixed inset-0 z-popover flex items-start justify-center p-4 pt-[12vh]">
            <div class="absolute inset-0 bg-black/40" onPointerDown={closePalette} />
            <div
                class="relative flex max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
                role="combobox"
                aria-expanded={true}
                aria-haspopup="listbox"
            >
                <Show when={levelTitle()}>
                    {(t) => (
                        <button
                            type="button"
                            class="flex items-center gap-1.5 border-b border-line px-3.5 pt-3 pb-1 text-left text-[12px] font-semibold text-muted hover:text-ink"
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
                        levelTitle() ? `Search ${levelTitle()}…` : "Type a command or search…"
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
                                No matching commands.
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
            </div>
        </div>
    );
};
