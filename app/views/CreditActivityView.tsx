import type { Component } from "solid-js";
import { For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { describeUsage } from "@model/credits";
import { capture } from "@ui/analytics";
import { IconButton, Spinner } from "@ui/button";
import { Icon } from "@ui/icons";
import { createSentinel } from "@ui/scroll";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import {
    billing,
    ledgerCursor,
    ledgerEntries,
    ledgerLoaded,
    ledgerLoadingMore,
    ledgerReasonLabel,
    loadLedger,
    loadMoreLedger,
} from "@app/stores/billing";

// The credit ledger in full: the pricing page shows the first few rows as a preview, this page
// appends the rest as you scroll.
export const CreditActivityView: Component = () => {
    const navigate = useNavigate();
    onMount(() => {
        void loadLedger();
        capture("credit_activity_viewed", { plan_id: billing()?.plan ?? "free" });
    });

    const observeSentinel = createSentinel(() => void loadMoreLedger(), { margin: "600px" });

    const when = (at: string): string =>
        new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

    return (
        <div class="flex h-dvh bg-canvas text-ink">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto">
                <SidebarToggle />
                <div class="mx-auto max-w-200 px-5 py-6 md:px-8 md:py-10">
                    <header class="mb-6 flex items-center gap-2.5">
                        <IconButton
                            size="sm"
                            tone="muted"
                            bordered
                            title="Back to plans"
                            onClick={() => navigate("/pricing")}
                        >
                            <Icon name="chevronLeft" size={15} />
                        </IconButton>
                        <div>
                            <h1 class="text-[26px] font-bold tracking-[-0.02em]">AI activity</h1>
                            <p class="mt-0.5 text-[14px] text-muted">
                                Every credit movement in this workspace, newest first.
                            </p>
                        </div>
                    </header>

                    <Show
                        when={ledgerLoaded()}
                        fallback={
                            <div class="flex justify-center py-16">
                                <Spinner size={20} />
                            </div>
                        }
                    >
                        <Show
                            when={ledgerEntries().length > 0}
                            fallback={
                                <div class="rounded-xl border border-line bg-panel px-4 py-8 text-center text-[13px] text-muted">
                                    No AI activity yet. Charges and grants show up here.
                                </div>
                            }
                        >
                            <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel text-[12.5px]">
                                <For each={ledgerEntries()}>
                                    {(e) => (
                                        <li class="flex items-center gap-3 px-4 py-2.5 tabular-nums">
                                            <div class="min-w-0 flex-1">
                                                <div class="truncate font-medium capitalize text-ink">
                                                    {ledgerReasonLabel(e.reason)}
                                                </div>
                                                <div class="truncate text-[11.5px] text-muted">
                                                    {when(e.at)}
                                                    <Show when={e.user}>
                                                        {(u) => <> · {u().name ?? u().email}</>}
                                                    </Show>
                                                    <Show when={e.usage}>
                                                        {(u) => <> · {describeUsage(u())}</>}
                                                    </Show>
                                                </div>
                                            </div>
                                            <div class="hidden w-24 flex-none text-right text-[11.5px] text-muted sm:block">
                                                {e.balanceAfter.toLocaleString()} left
                                            </div>
                                            <div
                                                class={`w-14 flex-none text-right font-semibold ${e.delta > 0 ? "text-accent" : "text-ink"}`}
                                            >
                                                {e.delta > 0 ? `+${e.delta}` : e.delta}
                                            </div>
                                        </li>
                                    )}
                                </For>
                            </ul>
                            {/* sentinel: crossing it requests the next page */}
                            <Show when={ledgerCursor()}>
                                <div
                                    ref={(el) => observeSentinel(el)}
                                    class="flex h-20 items-center justify-center"
                                >
                                    <Show when={ledgerLoadingMore()}>
                                        <Spinner size={16} />
                                    </Show>
                                </div>
                            </Show>
                            {/* only after a second page, so a short history doesn't announce its end */}
                            <Show when={!ledgerCursor() && ledgerEntries().length > 30}>
                                <div class="py-6 text-center text-[12px] text-muted">
                                    End of history
                                </div>
                            </Show>
                        </Show>
                    </Show>
                </div>
            </main>
        </div>
    );
};
