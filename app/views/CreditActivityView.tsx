import type { Component } from "solid-js";
import { onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { capture } from "@ui/analytics";
import { Button, IconButton, Spinner } from "@ui/button";
import { Icon } from "@ui/icons";
import { createSentinel } from "@ui/scroll";
import { CreditActivity } from "@app/components/CreditActivity";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import {
    billing,
    ledgerCursor,
    ledgerEntries,
    ledgerError,
    ledgerLoaded,
    ledgerLoadingMore,
    loadLedger,
    loadMoreLedger,
} from "@app/stores/billing";

// The credit ledger in full: the Billing tab shows the first few rows as a preview, this page
// appends the rest as you scroll.
export const CreditActivityView: Component = () => {
    const navigate = useNavigate();
    onMount(() => {
        void loadLedger();
        capture("credit_activity_viewed", { plan_id: billing()?.plan ?? "free" });
    });

    const observeSentinel = createSentinel(() => void loadMoreLedger(), { margin: "600px" });

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
                            title="Back to billing"
                            onClick={() => navigate("/settings/billing")}
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
                                <Show
                                    when={ledgerError()}
                                    fallback={
                                        <div class="rounded-xl border border-line bg-panel px-4 py-8 text-center text-[13px] text-muted">
                                            No AI activity yet. Charges and grants show up here.
                                        </div>
                                    }
                                >
                                    <div class="flex flex-col items-center gap-3 rounded-xl border border-line bg-panel px-4 py-8 text-center text-[13px] text-muted">
                                        <span>The activity list could not be loaded.</span>
                                        <Button
                                            variant="tool"
                                            size="sm"
                                            onClick={() => void loadLedger()}
                                        >
                                            Try again
                                        </Button>
                                    </div>
                                </Show>
                            }
                        >
                            <CreditActivity entries={ledgerEntries()} variant="full" />
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
