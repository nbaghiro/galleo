import type { Component, JSX } from "solid-js";
import { For, splitProps } from "solid-js";

// A tab strip for a page that would otherwise be one long scroll. Selection lives with the caller,
// which is what lets a route own it and a tab be linkable.

export interface TabItem {
    id: string;
    label: string;
}

/**
 * Arrow keys move between tabs, which is what makes this a tablist rather than a row of buttons.
 * Wraps at both ends, since a strip this short has no reason to dead-end.
 */
const step = (tabs: readonly TabItem[], from: string, by: number): string => {
    const at = tabs.findIndex((t) => t.id === from);
    const next = (at + by + tabs.length) % tabs.length;
    return tabs[next]?.id ?? from;
};

export const Tabs: Component<
    {
        tabs: readonly TabItem[];
        active: string;
        onSelect: (id: string) => void;
        label: string; // what this set of tabs is for, for anyone not looking at the screen
    } & Omit<JSX.HTMLAttributes<HTMLDivElement>, "onSelect">
> = (props) => {
    const [own, rest] = splitProps(props, ["tabs", "active", "onSelect", "label", "class"]);
    return (
        <div
            role="tablist"
            aria-label={own.label}
            // scrolls rather than wraps on a phone: a tab strip that reflows to two rows stops
            // reading as one control
            class={`-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1 ${own.class ?? ""}`}
            {...rest}
        >
            <For each={own.tabs}>
                {(tab) => {
                    const selected = (): boolean => own.active === tab.id;
                    return (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selected()}
                            // only the selected tab is in the tab order; arrows reach the rest
                            tabIndex={selected() ? 0 : -1}
                            class="-mb-px flex-none whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors"
                            classList={{
                                "border-accent text-ink font-semibold": selected(),
                                "border-transparent text-soft hover:text-ink": !selected(),
                            }}
                            onClick={() => own.onSelect(tab.id)}
                            onKeyDown={(e) => {
                                const by =
                                    e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                                if (!by) return;
                                e.preventDefault();
                                own.onSelect(step(own.tabs, own.active, by));
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                }}
            </For>
        </div>
    );
};
