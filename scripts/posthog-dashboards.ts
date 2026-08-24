import "dotenv/config";

/**
 * Builds Galleo's PostHog dashboards from the event catalog in model/analytics.ts.
 *
 * Safe to re-run: dashboards and insights are matched by name, so a second run updates what the
 * first made instead of duplicating it. That is what makes a dashboard reviewable in a diff,
 * rebuildable in a second project, and updatable when an event's properties change, none of which
 * is true of one assembled by clicking.
 *
 *   pnpm posthog:dashboards              apply
 *   pnpm posthog:dashboards --dry-run    print what would change, touch nothing
 *
 * Needs a personal API key (the private `phx_` kind, not the `phc_` project key that ships in the
 * bundle) scoped to the project with insight:write, dashboard:write and query:read:
 *
 *   POSTHOG_CLI_API_KEY=phx_...  POSTHOG_CLI_PROJECT_ID=567553  pnpm posthog:dashboards
 */

const DRY = process.argv.includes("--dry-run");

const HOST = process.env.POSTHOG_CLI_HOST?.trim() || "https://us.posthog.com";
const TOKEN = process.env.POSTHOG_CLI_API_KEY?.trim() ?? "";
const PROJECT = process.env.POSTHOG_CLI_PROJECT_ID?.trim() ?? "";

const w = (s = ""): void => {
    process.stdout.write(`${s}\n`);
};

type Json = Record<string, unknown>;

/** Events whose date range is worth widening, because a purchase lags the click that caused it. */
const QUARTER = { date_from: "-90d" };
const MONTH = { date_from: "-30d" };

const event = (name: string, extra: Json = {}): Json => ({
    kind: "EventsNode",
    event: name,
    ...extra,
});

const breakdown = (property: string, type: "event" | "person" = "event"): Json => ({
    breakdownFilter: { breakdowns: [{ property, type }] },
});

const trend = (series: Json[], opts: Json = {}): Json => ({
    kind: "TrendsQuery",
    series,
    dateRange: MONTH,
    interval: "day",
    ...opts,
});

const funnel = (steps: string[], days = 7): Json => ({
    kind: "FunnelsQuery",
    series: steps.map((s) => event(s)),
    dateRange: MONTH,
    funnelsFilter: { funnelWindowInterval: days, funnelWindowIntervalUnit: "day" },
});

interface Tile {
    name: string;
    description: string;
    query: Json;
}

interface Board {
    name: string;
    description: string;
    tiles: Tile[];
}

const BOARDS: Board[] = [
    {
        name: "1 · Acquisition",
        description:
            "Does the ad spend work. Landing to CTA to signup, and revenue by the channel that first brought someone in.",
        tiles: [
            {
                name: "Landing views by source",
                description:
                    "Marketing page views by utm_source. Paid traffic shows its campaign; organic shows null.",
                query: trend([event("$pageview", { math: "total" })], breakdown("utm_source")),
            },
            {
                name: "Landing views by referring domain",
                description:
                    "Where traffic actually comes from. l.instagram.com is a Meta click; galleo.app is internal navigation.",
                query: trend(
                    [event("$pageview", { math: "total" })],
                    breakdown("$referring_domain"),
                ),
            },
            {
                name: "CTA clicks by placement",
                description: "Which call to action earns the click: nav, hero, midpage or footer.",
                query: trend(
                    [event("signup_cta_clicked", { math: "total" })],
                    breakdown("placement"),
                ),
            },
            {
                name: "Acquisition funnel: landing to signup",
                description:
                    "The paid-traffic question in one tile. A 7-day window, because an ad click and the signup it produces are rarely the same session.",
                query: funnel(["$pageview", "signup_cta_clicked", "signed_up"]),
            },
            {
                name: "Revenue by acquisition channel",
                description:
                    "Sum of mrr_usd on checkout_completed, split by the campaign that first brought the person in. A person property, so a purchase weeks later still attributes correctly.",
                query: trend(
                    [
                        event("checkout_completed", {
                            math: "sum",
                            math_property: "mrr_usd",
                        }),
                    ],
                    {
                        dateRange: QUARTER,
                        interval: "week",
                        ...breakdown("$initial_utm_source", "person"),
                    },
                ),
            },
        ],
    },
    {
        name: "2 · Activation",
        description:
            "What share of signups reach an output, and how long it takes them. Activation is defined as reaching an export or a shared link, not as finishing a checklist.",
        tiles: [
            {
                name: "Signup to first output",
                description:
                    "The activation funnel. Ends at an export because that is what reaching an output means.",
                query: funnel(["signed_up", "generation_completed", "exported"], 14),
            },
            {
                name: "Onboarding steps completed",
                description:
                    "Which checklist step stalls. Counts only steps that crossed while the app was open, so a returning user does not re-report old ones.",
                query: trend(
                    [event("onboarding_checklist_step_done", { math: "total" })],
                    breakdown("step"),
                ),
            },
            {
                name: "Checklist dismissals by progress",
                description: "Who gives up on onboarding, and how far in they were when they did.",
                query: trend(
                    [event("onboarding_checklist_dismissed", { math: "total" })],
                    breakdown("steps_done"),
                ),
            },
            {
                name: "Hours from signup to email verification",
                description:
                    "The number that decides whether gating the signup grant on verification costs minutes or days.",
                query: trend([
                    event("email_verified", {
                        math: "p90",
                        math_property: "hours_since_signup",
                    }),
                ]),
            },
            {
                name: "Time to first generation",
                description:
                    "Median milliseconds from the first session starting to a finished generation.",
                query: trend([
                    event("onboarding_first_generation_completed", {
                        math: "median",
                        math_property: "ms_since_signup",
                    }),
                ]),
            },
        ],
    },
    {
        name: "3 · Unit economics",
        description:
            "What a completed artifact costs us. Credits are sent raw and converted here, because the credit rate moves when model prices do.",
        tiles: [
            {
                name: "Credits charged by tool",
                description: "Which AI action actually costs money, across all 51 tools.",
                query: trend(
                    [
                        event("ai_action_completed", {
                            math: "sum",
                            math_property: "credits_charged",
                        }),
                    ],
                    breakdown("tool_id"),
                ),
            },
            {
                name: "Credits charged by model",
                description: "The model-tier question: what each provider tier is costing.",
                query: trend(
                    [
                        event("ai_action_completed", {
                            math: "sum",
                            math_property: "credits_charged",
                        }),
                    ],
                    breakdown("model_id"),
                ),
            },
            {
                name: "Credits per finished artifact",
                description:
                    "Total credits over completed generations. Multiply by the credit rate in model/credits.ts for dollars; it is deliberately not hardcoded here.",
                query: trend(
                    [
                        event("ai_action_completed", {
                            math: "sum",
                            math_property: "credits_charged",
                        }),
                        event("generation_completed", { math: "total" }),
                    ],
                    { trendsFilter: { formula: "A / B" }, interval: "week" },
                ),
            },
            {
                name: "Generation cost by plan",
                description: "Credits spent per plan, the margin question by tier.",
                query: trend(
                    [
                        event("ai_action_completed", {
                            math: "sum",
                            math_property: "credits_charged",
                        }),
                    ],
                    breakdown("plan_id"),
                ),
            },
            {
                name: "Subscription revenue",
                description:
                    "Sum of mrr_usd on checkout_completed, from Stripe's own line amounts.",
                query: trend(
                    [event("checkout_completed", { math: "sum", math_property: "mrr_usd" })],
                    {
                        dateRange: QUARTER,
                        interval: "week",
                    },
                ),
            },
        ],
    },
    {
        name: "4 · Generation funnel",
        description:
            "Where the product's central act loses people. The staged funnel on top of the ai_action_* events.",
        tiles: [
            {
                name: "Intake to completed",
                description: "The studio funnel, from opening the prompt to a finished artifact.",
                query: funnel([
                    "generation_intake_opened",
                    "generation_planned",
                    "generation_build_started",
                    "generation_completed",
                ]),
            },
            {
                name: "Abandoned by stage",
                description:
                    "The most valuable tile here. A funnel that records only successes cannot say where people leave.",
                query: trend(
                    [event("generation_abandoned", { math: "total" })],
                    breakdown("stage"),
                ),
            },
            {
                name: "Failed by stage",
                description: "Our fault, as distinct from their choice to stop.",
                query: trend([event("generation_failed", { math: "total" })], breakdown("stage")),
            },
            {
                name: "Context attached by kind",
                description:
                    "What source material people bring: pasted text, a file, a link, an artifact.",
                query: trend(
                    [event("generation_context_attached", { math: "total" })],
                    breakdown("kind"),
                ),
            },
            {
                name: "Steers per completed generation",
                description: "How often people redirect a run mid-flight rather than accepting it.",
                query: trend([
                    event("generation_completed", { math: "avg", math_property: "steer_count" }),
                ]),
            },
        ],
    },
    {
        name: "5 · The two walls",
        description:
            "The only two places the product tells a user no. An entitlement the plan lacks, and a budget the plan has spent. They convert differently.",
        tiles: [
            {
                name: "Paywall to purchase",
                description: "Does hitting an entitlement wall actually sell a plan.",
                query: funnel([
                    "paywall_hit",
                    "pricing_viewed",
                    "checkout_started",
                    "checkout_completed",
                ]),
            },
            {
                name: "Out of credits to top-up",
                description: "The other wall, and whether it sells a credit pack.",
                query: funnel(["credits_exhausted", "pricing_viewed", "topup_purchased"]),
            },
            {
                name: "Paywalls by feature",
                description:
                    "Which entitlement people actually want, across the nine boolean features.",
                query: trend([event("paywall_hit", { math: "total" })], breakdown("feature")),
            },
            {
                name: "Credit exhaustion by blocked tool",
                description:
                    "What people were denied, which is the actionable half of running dry.",
                query: trend(
                    [event("credits_exhausted", { math: "total" })],
                    breakdown("blocked_tool_id"),
                ),
            },
            {
                name: "Low balance warnings against exhaustion",
                description: "Whether warning people early changes what happens next.",
                query: trend([
                    event("credit_balance_low", { math: "total" }),
                    event("credits_exhausted", { math: "total" }),
                ]),
            },
        ],
    },
    {
        name: "6 · Adoption and depth",
        description:
            "What gets used and what is dead weight, and whether people author here or only generate and leave.",
        tiles: [
            {
                name: "Elements added by type",
                description:
                    "The dead-weight table: which of the palette elements anyone actually places.",
                query: trend(
                    [event("element_added", { math: "total" })],
                    breakdown("element_type"),
                ),
            },
            {
                name: "How elements arrive",
                description:
                    "Palette, drag, paste or AI. Whether people build or are handed things.",
                query: trend([event("element_added", { math: "total" })], breakdown("how")),
            },
            {
                name: "Exports by format",
                description: "Which of the five export targets earns its maintenance.",
                query: trend([event("exported", { math: "total" })], breakdown("export_format")),
            },
            {
                name: "Themes chosen",
                description:
                    "Which of the built-in themes people switch to, and whether custom ones get used.",
                query: trend([event("theme_changed", { math: "total" })], breakdown("theme_id")),
            },
            {
                name: "Edits per editing session",
                description:
                    "The depth roll-up. A session with no edits at all is a glance, and this is the only place it is visible.",
                query: trend([
                    event("editor_session_ended", { math: "median", math_property: "edit_count" }),
                ]),
            },
            {
                name: "Artifacts trashed by age",
                description:
                    "One trashed minutes after generation is a quality signal; one trashed after a month is housekeeping.",
                query: trend([
                    event("artifact_trashed", { math: "median", math_property: "age_days" }),
                ]),
            },
        ],
    },
    {
        name: "8 · Assistant, media and collaboration",
        description:
            "The three surfaces that were invisible until now. Cost already showed up under unit economics; this is whether any of them actually works.",
        tiles: [
            {
                name: "Chat: asked to applied",
                description:
                    "Does the assistant lead anywhere. Opening it and sending a message are cheap; applying what it proposes is the act that matters.",
                query: funnel(["chat_opened", "chat_message_sent", "chat_proposal_applied"], 1),
            },
            {
                name: "Chat proposals taken against dismissed",
                description:
                    "The assistant's hit rate, which is the question about whether it is any good.",
                query: trend([
                    event("chat_proposal_applied", { math: "total" }),
                    event("chat_proposal_dismissed", { math: "total" }),
                ]),
            },
            {
                name: "Chat message length",
                description:
                    "Bucketed, never the text. One-line questions and pasted briefs are different uses.",
                query: trend(
                    [event("chat_message_sent", { math: "total" })],
                    breakdown("chars_bucket"),
                ),
            },
            {
                name: "Media by source",
                description:
                    "Stock, upload, generated or icon. Decides which provider API keys earn their keep.",
                query: trend([event("media_inserted", { math: "total" })], breakdown("source")),
            },
            {
                name: "Media searches that found nothing",
                description:
                    "Result count by provider. A provider that returns zero is worse than one that is not configured, because it looks like it works.",
                query: trend([event("media_searched", { math: "total" })], breakdown("provider")),
            },
            {
                name: "Collaboration sessions by peer count",
                description:
                    "Zero peers is opening a shared artifact alone. Anything above that is real multiplayer, and this is the only tile that can tell them apart.",
                query: trend([event("collab_joined", { math: "total" })], breakdown("peers")),
            },
            {
                name: "Edits blocked by someone else's lease",
                description:
                    "The friction the edit lease exists for: two people reaching for one element.",
                query: trend([event("collab_edit_blocked", { math: "total" })]),
            },
            {
                name: "Undo against redo",
                description:
                    "The purest friction signal an editor has. Undo without redo is work being thrown away.",
                query: trend([
                    event("edit_undone", { math: "total" }),
                    event("edit_redone", { math: "total" }),
                ]),
            },
            {
                name: "Models pinned by task",
                description:
                    "Which tier people choose when we let them, which drives cost directly.",
                query: trend([event("model_pinned", { math: "total" })], breakdown("model_id")),
            },
        ],
    },
    {
        name: "7 · Reliability",
        description:
            "Mostly worth alerting on rather than browsing. Open it when something is already wrong.",
        tiles: [
            {
                name: "AI failures by reason",
                description:
                    "Provider error, timeout, rate limit, invalid output. Aborts are excluded by design.",
                query: trend([event("ai_action_failed", { math: "total" })], breakdown("reason")),
            },
            {
                name: "AI failures by model",
                description:
                    "Which provider tier is unreliable, which is a purchasing decision as much as a technical one.",
                query: trend([event("ai_action_failed", { math: "total" })], breakdown("model_id")),
            },
            {
                name: "Save failures",
                description:
                    "The one that means people are losing work. Worth an alert, not a glance.",
                query: trend([event("save_failed", { math: "total" })], breakdown("reason")),
            },
            {
                name: "Streams lost by phase",
                description:
                    "Where an AI turn dies on the client. A user cancelling is not counted.",
                query: trend(
                    [event("stream_disconnected", { math: "total" })],
                    breakdown("at_phase"),
                ),
            },
            {
                name: "Errors shown by surface",
                description: "What users are actually seeing go wrong, and where in the product.",
                query: trend([event("error_shown", { math: "total" })], breakdown("surface")),
            },
            {
                name: "Slow renders",
                description:
                    "p95 of paints over the threshold in model/analytics.ts. The volume here is what sets the real threshold.",
                query: trend([event("render_slow", { math: "p95", math_property: "ms" })]),
            },
        ],
    },
];

async function api(path: string, init?: RequestInit): Promise<Json> {
    const res = await fetch(`${HOST}/api/projects/${PROJECT}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
            ...init?.headers,
        },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
    return text ? (JSON.parse(text) as Json) : {};
}

interface Named {
    id: number;
    name: string | null;
}

const named = (v: unknown): Named[] =>
    Array.isArray(v)
        ? v.flatMap((x) => {
              const r = x as { id?: unknown; name?: unknown };
              return typeof r.id === "number"
                  ? [{ id: r.id, name: (r.name as string) ?? null }]
                  : [];
          })
        : [];

/** Matched by name, which is what makes a second run an update rather than a duplicate. */
async function findByName(
    resource: "dashboards" | "insights",
    name: string,
): Promise<number | null> {
    const page = await api(`/${resource}/?limit=500`);
    return named(page.results).find((r) => r.name === name)?.id ?? null;
}

async function ensureBoard(board: Board): Promise<void> {
    const existing = await findByName("dashboards", board.name);
    if (DRY) {
        w(`${existing ? "update" : "create"}  ${board.name}  (${board.tiles.length} tiles)`);
        return;
    }
    const id =
        existing ??
        ((
            await api("/dashboards/", {
                method: "POST",
                body: JSON.stringify({
                    name: board.name,
                    description: board.description,
                    pinned: true,
                }),
            })
        ).id as number);
    w(`${existing ? "updated" : "created"}  ${board.name}  (id ${id})`);

    for (const tile of board.tiles) {
        const found = await findByName("insights", tile.name);
        const body = JSON.stringify({
            name: tile.name,
            description: tile.description,
            dashboards: [id],
            query: { kind: "InsightVizNode", source: tile.query },
        });
        if (found) await api(`/insights/${found}/`, { method: "PATCH", body });
        else await api("/insights/", { method: "POST", body });
        w(`    ${found ? "·" : "+"} ${tile.name}`);
    }
}

async function main(): Promise<void> {
    if (!TOKEN || !PROJECT) {
        w("POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID must be set.");
        w("The key is the private phx_ kind, not the phc_ project key that ships in the bundle.");
        process.exit(1);
    }
    w(`${DRY ? "Planning" : "Building"} ${BOARDS.length} dashboards on project ${PROJECT}`);
    w();
    for (const board of BOARDS) await ensureBoard(board);
    w();
    w(
        `${BOARDS.reduce((n, b) => n + b.tiles.length, 0)} tiles across ${BOARDS.length} dashboards.`,
    );
}

await main();
