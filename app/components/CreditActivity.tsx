import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { describeUsage } from "@model/credits";
import type { LedgerEntry } from "@app/api";
import { ledgerReasonLabel } from "@app/stores/billing";

// must stay in sync with the grant reasons the ledger writes (core/ledger.ts, core/billing.ts,
// core/onboarding.ts); a pack is keyed per pack id as `topup:<pack>`
const GRANT_REASONS = new Set(["monthly-grant", "renewal-grant", "upgrade-grant", "signup-grant"]);
const isGrant = (reason: string): boolean =>
    GRANT_REASONS.has(reason) || reason.startsWith("topup:");

// a spend that settled to zero: a cache hit, or a run refunded in full
const isCached = (e: LedgerEntry): boolean => e.delta === 0 && !isGrant(e.reason);

/** The preview's head rows: real spend and grants, without the zero-cost cache-hit noise. */
export const previewEntries = (entries: LedgerEntry[]): LedgerEntry[] =>
    entries.filter((e) => !isCached(e)).slice(0, ACTIVITY_PREVIEW_ROWS);

// The one rendering of the credit ledger, shared by the pricing and settings previews and the full
// activity page, so the three surfaces cannot drift apart. Renders its own framed list; callers
// own the heading and any "View all" link beside it.
export const CreditActivity: Component<{
    entries: LedgerEntry[];
    // preview: reason · date · delta. full: adds the time, the spender, the usage breakdown, and
    // a balance-after column on wider screens.
    variant?: "preview" | "full";
    class?: string;
}> = (props) => {
    const full = (): boolean => props.variant === "full";
    const when = (at: string): string =>
        full()
            ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : new Date(at).toLocaleDateString();
    return (
        <ul
            class={`divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel text-[12.5px] ${props.class ?? ""}`}
        >
            <For each={props.entries}>
                {(e) => (
                    <li
                        class={`flex items-center gap-3 px-4 py-2.5 tabular-nums ${e.delta === 0 ? "opacity-60" : ""}`}
                    >
                        <div class="min-w-0 flex-1">
                            <div class="truncate font-medium capitalize text-ink">
                                {ledgerReasonLabel(e.reason)}
                                <Show when={isCached(e)}>
                                    <span class="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                                        cached
                                    </span>
                                </Show>
                                <Show when={e.delta === 0 && isGrant(e.reason)}>
                                    <span class="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                                        at the cap
                                    </span>
                                </Show>
                            </div>
                            <Show when={full()}>
                                <div class="truncate text-[11.5px] text-muted">
                                    {when(e.at)}
                                    <Show when={e.user}>
                                        {(u) => <> · {u().name ?? u().email}</>}
                                    </Show>
                                    <Show when={e.usage}>
                                        {(u) => <> · {describeUsage(u())}</>}
                                    </Show>
                                </div>
                            </Show>
                        </div>
                        <Show when={!full()}>
                            <div class="flex-none text-muted">{when(e.at)}</div>
                        </Show>
                        <Show when={full()}>
                            <div class="hidden w-24 flex-none text-right text-[11.5px] text-muted sm:block">
                                {e.balanceAfter.toLocaleString()} left
                            </div>
                        </Show>
                        <div
                            class={`w-14 flex-none text-right font-semibold ${e.delta > 0 ? "text-accent" : "text-ink"}`}
                        >
                            {e.delta > 0 ? `+${e.delta}` : e.delta}
                        </div>
                    </li>
                )}
            </For>
        </ul>
    );
};

/** How many rows a preview shows before pointing at the full page. */
export const ACTIVITY_PREVIEW_ROWS = 8;
