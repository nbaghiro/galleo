import type { ArtifactContent } from "@model/content";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
    chart,
    deck,
    diagram,
    doc,
    empty,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// ─────────────────────────────────────────────────────────────────────────────
// Template 1 — Client project proposal (deck)
// Foldwork, a brand & digital studio, pitching a rebrand to Atlas Coffee Roasters.
// ─────────────────────────────────────────────────────────────────────────────

export const projectProposal: ArtifactContent = deck(
    "studio",
    [
        section(
            "cover",
            "full",
            {
                a: cell(
                    group(
                        t("PROPOSAL · PREPARED FOR ATLAS COFFEE ROASTERS", "label"),
                        t("A rebrand worth waking up for.", "h1"),
                        t(
                            "Foldwork — a brand & digital studio — on relaunching Atlas as a specialty-coffee name that travels. Prepared for the Atlas leadership team, June 2026.",
                            "subtitle",
                        ),
                        badge("CONFIDENTIAL · v2"),
                    ),
                ),
            },
            { background: bgImage("atlas-coffee-cover", 0.55) },
        ),
        section("opportunity", "split-6040", {
            a: cell(
                group(
                    t("01 — The opportunity", "label"),
                    t("Great coffee, hiding behind a tired bag.", "h2"),
                    t(
                        "Atlas has roasted exceptional coffee since 2014 and earned a loyal following across 60 wholesale cafes. But the brand hasn’t kept up with the cup. The packaging reads local-craft-2014, the site converts below category benchmarks, and the look fractures at every touchpoint. Meanwhile specialty-coffee DTC is growing 23% a year — and the shelf has never been more crowded.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("atlas-coffee-bags", 0.82)),
        }),
        section("goals", "full", {
            a: cell(
                group(
                    t("02 — What we heard", "label"),
                    t("Where you want to be in twelve months.", "h2"),
                    bullets(
                        "Triple direct-to-consumer revenue within twelve months",
                        "Launch a coffee subscription with predictable recurring revenue",
                        "Look like a national brand without losing the neighborhood story",
                        "Win shelf space in regional grocery and specialty retail",
                        "Unify the look across the bag, the web, and the cafe counter",
                    ),
                ),
            ),
        }),
        section(
            "northstar",
            "full",
            {
                a: cell(
                    quote(
                        "We don’t want to look bigger. We want to look like the best version of ourselves.",
                        "— Dana Mercer · Founder, Atlas Coffee Roasters",
                    ),
                ),
            },
            { background: bgImage("atlas-coffee-pour", 0.6) },
        ),
        section("approach", "split-4060", {
            a: cell(img("atlas-roastery-craft", 1.05)),
            b: cell(
                group(
                    t("03 — Our approach", "label"),
                    t("Strategy first. Then a system, not a logo.", "h2"),
                    bullets(
                        "Roast notes, not buzzwords — language that actually sounds like you",
                        "A flexible identity that scales from one bag to a grocery shelf",
                        "Designed for the shelf and the screen at the same time",
                    ),
                ),
            ),
        }),
        section("deliverables", "three-up", {
            a: cell(
                card(
                    t("Brand Strategy", "h3"),
                    bullets(
                        "Positioning & messaging platform",
                        "Naming & voice guidelines",
                        "Category & competitive audit",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Visual Identity", "h3"),
                    bullets(
                        "Logo system & wordmark",
                        "Packaging design across 3 core SKUs",
                        "Type, color & art direction",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Digital & Commerce", "h3"),
                    bullets(
                        "Shopify storefront redesign",
                        "Subscription & checkout flow",
                        "Photography & launch asset kit",
                    ),
                ),
            ),
        }),
        section("timeline", "full", {
            a: cell(
                group(
                    t("04 — Timeline", "label"),
                    t("Twelve weeks, four milestones.", "h2"),
                    diagram("process", "Discovery, Strategy, Identity, Build, Launch", 180),
                    bullets(
                        "Weeks 1–2 · Discovery sprint, stakeholder interviews, brand & UX audit",
                        "Weeks 3–6 · Strategy platform and two identity directions",
                        "Weeks 7–11 · Packaging, storefront design and front-end build",
                        "Week 12 · Launch, handover and brand guidelines",
                    ),
                ),
            ),
        }),
        section("team", "three-up", {
            a: cell(
                group(
                    img("foldwork-team-nora", 1),
                    t("Nora Vance", "h3"),
                    t("Creative Director", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("foldwork-team-devin", 1),
                    t("Devin Osei", "h3"),
                    t("Brand Strategist", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("foldwork-team-lina", 1),
                    t("Lina Park", "h3"),
                    t("Design & Web Lead", "caption"),
                ),
            ),
        }),
        section("investment", "full", {
            a: cell(
                group(
                    t("05 — Investment", "label"),
                    t("A fixed-scope engagement.", "h2"),
                    table(
                        "Phase,Timeline,Investment\nDiscovery & Strategy,2 weeks,$16K\nVisual Identity,4 weeks,$34K\nWebsite & Build,5 weeks,$39K\nLaunch & Handover,1 week,$11K\nTotal,12 weeks,$100K",
                    ),
                    t(
                        "50% to begin, 50% at launch. Excludes third-party costs (photography talent, licensed fonts, Shopify apps), estimated at $6–9K.",
                        "caption",
                    ),
                ),
            ),
        }),
        section("why-us", "split-4060", {
            a: cell(img("foldwork-studio-work", 0.86)),
            b: cell(
                group(
                    t("06 — Why Foldwork", "label"),
                    t("We make brands people taste before they read.", "h2"),
                    bullets(
                        "Specialty-only — 14 food & beverage brands launched",
                        "Strategy and design under one roof, one team",
                        "We build what we design — no handoff, no surprises",
                    ),
                    callout(
                        "success",
                        t(
                            "Brands we’ve relaunched have seen an average 184% lift in DTC revenue in their first year.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("track-record", "three-up", {
            a: cell(stat("184%", "Avg. first-year DTC lift")),
            b: cell(stat("14", "F&B brands launched")),
            c: cell(stat("4.9★", "Average client rating")),
        }),
        section(
            "next-steps",
            "split-6040",
            {
                a: cell(
                    group(
                        t("07 — Next steps", "label"),
                        t("Let’s get the first roast on.", "h2"),
                        t(
                            "If this resonates, we’ll schedule a 60-minute kickoff and hold a start date in July. This proposal is valid for 30 days.",
                            "subtitle",
                        ),
                        button("Approve & schedule kickoff"),
                    ),
                ),
                b: empty,
            },
            { background: bgImage("atlas-coffee-beans", 0.58) },
        ),
    ],
    bgImage("foldwork-bg", 0.35),
);

// ─────────────────────────────────────────────────────────────────────────────
// Template 2 — Monthly investor update (doc)
// Cadence, a usage-based billing platform, to its investors for May 2026.
// ─────────────────────────────────────────────────────────────────────────────

export const investorUpdate: ArtifactContent = doc(
    "signal",
    [
        section(
            "cover",
            "full",
            {
                a: cell(
                    group(
                        t("INVESTOR UPDATE · MAY 2026", "label"),
                        t("Cadence", "h1"),
                        t(
                            "The billing engine for usage-based software. Another month of compounding — MRR up 16% to $248K, NRR holding at 124%, and Usage Studio now shipped to every customer.",
                            "subtitle",
                        ),
                        t("Elena Vossberg · Co-founder & CEO", "caption"),
                    ),
                ),
            },
            { background: bgImage("cadence-cover", 0.55) },
        ),
        section("tldr", "full", {
            a: cell(
                callout(
                    "success",
                    group(
                        t("TL;DR", "label"),
                        bullets(
                            "MRR grew 16% MoM to $248K (≈ $3.0M ARR)",
                            "14 net-new logos — our best month yet — at 1.1% logo churn",
                            "Shipped Usage Studio: real-time metering for every customer",
                            "Runway extended to 21 months on improving gross margin",
                            "The ask: warm intros to Series A leads and a VP Sales",
                        ),
                    ),
                ),
            ),
        }),
        section("headline", "three-up", {
            a: cell(stat("$248K", "MRR · +16% MoM")),
            b: cell(stat("124%", "Net revenue retention")),
            c: cell(stat("21 mo", "Cash runway")),
        }),
        section("growth", "split-6040", {
            a: cell(
                group(
                    t("Growth", "label"),
                    t("Six straight months of compounding.", "h2"),
                    t(
                        "Net revenue retention is doing the heavy lifting — existing customers expanding usage now drives 61% of new MRR. New-logo velocity is the other half, and it accelerated this month off the back of two enterprise wins.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "131, 152, 171, 196, 214, 248", 240),
                    t("MRR, Dec 2025 – May 2026 ($K)", "caption"),
                ),
            ),
        }),
        section("wins", "full", {
            a: cell(
                group(
                    t("Wins this month", "label"),
                    t("What went right.", "h2"),
                    bullets(
                        "Closed Northloop and Verge — our two largest contracts to date ($3.4K and $2.9K MRR)",
                        "Shipped Usage Studio: live metering, anomaly alerts and revenue forecasting",
                        "Completed SOC 2 Type II — unblocking three enterprise deals in the pipeline",
                        "Hired Sofia Reyes as VP Engineering (ex-Stripe, ex-Plaid)",
                        "Gross margin improved from 71% to 78% after the metering rewrite",
                    ),
                ),
            ),
        }),
        section(
            "voice",
            "full",
            {
                a: cell(
                    quote(
                        "Cadence replaced three internal tools and a spreadsheet the whole team was afraid of. We closed the books four days faster.",
                        "— Marisol Tan · VP Finance, Northloop",
                    ),
                ),
            },
            { background: bgImage("cadence-dashboard-glow", 0.6) },
        ),
        section("challenges", "full", {
            a: cell(
                group(
                    t("Challenges & lowlights", "label"),
                    t("What we’re watching.", "h2"),
                    t(
                        "Enterprise sales cycles are stretching — the SOC 2 deals are real but slow, averaging 71 days from first call to signature. We lost one SMB customer (Pinecrest, $2.1K MRR) to an in-house build, our first churn of that size. And a usage spike from two accounts pushed infra costs 22% over plan before we shipped autoscaling caps.",
                        "body",
                    ),
                    callout(
                        "caution",
                        t(
                            "Senior backend hiring is our critical path. Two offers are out; if both land we’re staffed for the Q3 roadmap. If neither does, Usage Studio v2 slips a month.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("metrics", "full", {
            a: cell(
                group(
                    t("By the numbers", "label"),
                    t("Key metrics.", "h2"),
                    table(
                        "Metric,April,May,Change\nMRR,$214K,$248K,+16%\nNet new logos,9,14,+5\nLogo churn,1.8%,1.1%,-0.7pt\nNRR,118%,124%,+6pt\nGross margin,71%,78%,+7pt\nCash runway,19 mo,21 mo,+2 mo",
                    ),
                ),
            ),
        }),
        section("product", "split-4060", {
            a: cell(img("cadence-usage-studio", 1.2)),
            b: cell(
                group(
                    t("Product progress", "label"),
                    t("Usage Studio is live.", "h2"),
                    t(
                        "Customers can now watch metered usage in real time, set anomaly alerts and forecast next-month revenue straight from live consumption. Adoption hit 64% of accounts in three weeks — it’s already the most-opened screen in the product and the top reason cited in deals we won this month.",
                        "body",
                    ),
                ),
            ),
        }),
        section("ask", "full", {
            a: cell(
                group(
                    t("The ask", "label"),
                    t("How you can help.", "h2"),
                    bullets(
                        "Intros to Series A leads in fintech infra or usage-based SaaS — we open the round in Q3",
                        "Candidates for VP Sales — taking us from PLG into a sales-led enterprise motion",
                        "Design partners in fintech and dev-tools with metered-billing pain",
                        "Anyone wrestling with the limits of Stripe billing — send them our way",
                    ),
                    button("elena@cadence.dev"),
                ),
            ),
        }),
        section(
            "thanks",
            "full",
            {
                a: cell(
                    group(
                        t(
                            "Thank you — for the intros, the candidates and the patience. Reply to this update anytime; I read and answer every one.",
                            "subtitle",
                        ),
                        t("Elena Vossberg · Co-founder & CEO, Cadence · May 2026", "caption"),
                    ),
                ),
            },
            { background: bgImage("cadence-team-closing", 0.6) },
        ),
    ],
    bgImage("cadence-bg", 0.3),
);
