import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Modal } from "./overlay";
import { Icon } from "./icons";
import {
    allCommands,
    bindingLabel,
    closeShortcuts,
    GROUP_LABEL,
    GROUP_ORDER,
    registryTick,
    sheetOpen,
    type CommandGroup,
} from "./keys";

// Generated from the registry, so it can't drift from the real bindings.

interface Entry {
    id: string;
    title: string;
    label: string;
    group: CommandGroup;
}

export const ShortcutsSheet: Component = () => (
    <Show when={sheetOpen()}>
        <SheetBody />
    </Show>
);

const SheetBody: Component = () => {
    const [query, setQuery] = createSignal("");

    const entries = createMemo<Entry[]>(() => {
        registryTick();
        const out: Entry[] = [];
        for (const c of allCommands()) {
            const label = bindingLabel(c.id);
            if (label) out.push({ id: c.id, title: c.title, label, group: c.group });
        }
        return out;
    });

    const groups = createMemo(() => {
        const q = query().trim().toLowerCase();
        const match = (e: Entry): boolean =>
            !q || e.title.toLowerCase().includes(q) || e.label.toLowerCase().includes(q);
        return GROUP_ORDER.map((g) => ({
            label: GROUP_LABEL[g],
            rows: entries().filter((e) => e.group === g && match(e)),
        })).filter((s) => s.rows.length);
    });

    return (
        <Modal
            size="lg"
            scrim="dim"
            onClose={closeShortcuts}
            class="flex max-h-[80vh] flex-col p-0"
        >
            <div class="flex items-center gap-2 border-b border-line px-5 py-4">
                <Icon name="inspector" size={16} />
                <h2 class="font-display text-[16px] font-semibold text-ink">Keyboard shortcuts</h2>
                <input
                    class="ml-auto w-[220px] rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
                    type="search"
                    placeholder="Search shortcuts…"
                    value={query()}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                />
                <button
                    class="rounded-md p-1 text-muted hover:text-ink"
                    title="Close (Esc)"
                    onClick={closeShortcuts}
                >
                    <Icon name="close" size={16} />
                </button>
            </div>
            <div class="grid min-h-0 flex-1 grid-cols-2 gap-x-8 gap-y-5 overflow-y-auto p-5">
                <For each={groups()}>
                    {(g) => (
                        <div class="break-inside-avoid">
                            <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                {g.label}
                            </div>
                            <For each={g.rows}>
                                {(e) => (
                                    <div class="flex items-center justify-between gap-3 py-1 text-[13px]">
                                        <span class="min-w-0 truncate text-ink">{e.title}</span>
                                        <span class="flex-none font-mono text-[11px] text-muted">
                                            {e.label}
                                        </span>
                                    </div>
                                )}
                            </For>
                        </div>
                    )}
                </For>
                <Show when={!groups().length}>
                    <div class="col-span-2 py-8 text-center text-[13px] text-muted">
                        No shortcuts match.
                    </div>
                </Show>
            </div>
        </Modal>
    );
};
