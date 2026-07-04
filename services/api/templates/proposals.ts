// The proposals template set (all variants — un-sharded from the size-split -extra/-extra2 files).

import type { ArtifactContent } from "@model/artifact";
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

// ─────────────────────────────────────────────────────────────────────────────
// Template 1 — Business proposal (doc)
// Cascade Solar & Energy proposing a 1.4 MW rooftop + carport solar system to
// Brightline Manufacturing.
// ─────────────────────────────────────────────────────────────────────────────

export const businessProposal: ArtifactContent = doc(
    "mineral",
    [
        section(
            "cover",
            "full",
            {
                a: cell(
                    group(
                        t("PROPOSAL · PREPARED FOR BRIGHTLINE MANUFACTURING", "label"),
                        t("Power the plant with the roof you already own.", "h1"),
                        t(
                            "Cascade Solar & Energy on a 1.4-megawatt rooftop and carport solar system for the Brightline plant in Reno — engineered to cut energy spend 68% and pay for itself in under six years. Prepared for the Brightline leadership team, June 2026.",
                            "subtitle",
                        ),
                        badge("CONFIDENTIAL · v1.2"),
                    ),
                ),
            },
            { background: bgImage("brightline-solar-rooftop", 0.55) },
        ),
        section("summary", "full", {
            a: cell(
                group(
                    t("Executive summary", "label"),
                    t("A 1.4-megawatt system that pays for itself.", "h2"),
                    t(
                        "Brightline spent $1.18M on electricity last year, and exposure to peak-demand charges is climbing. This proposal outlines a turnkey solar and storage system that offsets 68% of that load from day one, locks in your energy cost for 25 years, and qualifies for $1.9M in federal and state incentives. Cascade designs, permits, builds, and monitors the entire system — a single point of accountability from contract to commissioning.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "Estimated 25-year net savings of $7.4M, with a 5.8-year payback and a 17% internal rate of return.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("needs", "split-6040", {
            a: cell(
                group(
                    t("01 — Understanding your needs", "label"),
                    t("What we heard from your team.", "h2"),
                    bullets(
                        "Cut a $1.18M annual energy bill that grows 6–8% a year",
                        "Hedge against Nevada peak-demand and time-of-use charges",
                        "Hit the 2030 corporate carbon-neutral commitment",
                        "Keep the line running — zero downtime during installation",
                        "A financing structure that protects working capital",
                    ),
                ),
            ),
            b: cell(img("brightline-plant-floor", 0.82)),
        }),
        section("opportunity", "split-6040", {
            a: cell(
                group(
                    t("02 — The opportunity", "label"),
                    t("Your energy cost is only going one way.", "h2"),
                    t(
                        "Without action, Brightline’s electricity spend climbs to roughly $1.7M a year by 2031 on current rate trajectories. The solar system flips that curve: after year six the marginal cost of your generated power is effectively zero, and the savings compound for two more decades.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "1.18, 1.27, 1.36, 1.47, 1.58, 1.70", 240),
                    t("Projected utility spend without solar, 2026–2031 ($M)", "caption"),
                ),
            ),
        }),
        section("solution", "split-4060", {
            a: cell(img("brightline-solar-carport", 1.05)),
            b: cell(
                group(
                    t("03 — Proposed solution", "label"),
                    t("Rooftop, carport, and storage — one integrated system.", "h2"),
                    bullets(
                        "1.4 MW of high-efficiency panels across 180,000 sq ft of roof",
                        "420 kW solar carport over the north employee lot",
                        "600 kWh battery storage to shave peak-demand charges",
                        "Real-time monitoring with the Cascade Energy dashboard",
                    ),
                ),
            ),
        }),
        section("scope", "three-up", {
            a: cell(
                card(
                    t("Design & Engineering", "h3"),
                    bullets(
                        "Structural & electrical engineering",
                        "Shade & production modeling",
                        "Utility interconnection design",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Permitting & Build", "h3"),
                    bullets(
                        "All permits & inspections handled",
                        "Panel, carport & inverter install",
                        "Battery & switchgear integration",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Monitor & Maintain", "h3"),
                    bullets(
                        "24/7 production monitoring",
                        "Annual cleaning & inspection",
                        "25-year performance guarantee",
                    ),
                ),
            ),
        }),
        section("timeline", "full", {
            a: cell(
                group(
                    t("04 — Timeline", "label"),
                    t("Twenty weeks, four phases, zero plant downtime.", "h2"),
                    diagram("process", "Design, Permit, Install, Commission, Monitor", 180),
                    bullets(
                        "Weeks 1–4 · Engineering, production modeling and final design",
                        "Weeks 5–9 · Permitting and utility interconnection approval",
                        "Weeks 10–17 · Rooftop, carport and storage install — staged around your production calendar",
                        "Weeks 18–20 · Commissioning, utility sign-off and dashboard handover",
                    ),
                ),
            ),
        }),
        section("pricing", "full", {
            a: cell(
                group(
                    t("05 — Pricing & terms", "label"),
                    t("A transparent, fixed-price engagement.", "h2"),
                    table(
                        "Line item,Detail,Investment\nSolar array (1.4 MW),Panels racking and inverters,$2.34M\nSolar carport (420 kW),Structure and install,$0.61M\nBattery storage (600 kWh),Hardware and integration,$0.48M\nEngineering & permitting,Design permits and interconnect,$0.27M\nGross system cost,,$3.70M\nIncentives (30% ITC + state),Federal and Nevada credits,-$1.90M\nNet investment,After incentives,$1.80M",
                    ),
                    t(
                        "Financing available: $0-down power purchase agreement at $0.071/kWh, or a cash purchase on the schedule above. 25-year workmanship and production warranty included.",
                        "caption",
                    ),
                ),
            ),
        }),
        section("why-us", "three-up", {
            a: cell(stat("142 MW", "Commercial solar installed")),
            b: cell(stat("99.4%", "Average system uptime")),
            c: cell(stat("5.8 yr", "Typical payback period")),
        }),
        section(
            "reference",
            "full",
            {
                a: cell(
                    quote(
                        "Cascade ran the whole project around our production schedule — we never lost an hour on the line, and our power bill dropped 71% the first month it switched on.",
                        "— Renata Pho · Director of Operations, Sierra Foods",
                    ),
                ),
            },
            { background: bgImage("cascade-install-crew", 0.6) },
        ),
        section("team", "three-up", {
            a: cell(
                group(
                    img("cascade-team-marcus", 1),
                    t("Marcus Bell", "h3"),
                    t("Lead Project Engineer", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("cascade-team-yuki", 1),
                    t("Yuki Tanaka", "h3"),
                    t("Energy Modeling & Finance", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("cascade-team-darnell", 1),
                    t("Darnell Cruz", "h3"),
                    t("Construction Manager", "caption"),
                ),
            ),
        }),
        section(
            "accept",
            "split-6040",
            {
                a: cell(
                    group(
                        t("06 — Acceptance & next steps", "label"),
                        t("Let’s lock in your rate for the next 25 years.", "h2"),
                        t(
                            "To proceed, countersign below and we’ll schedule a site survey within ten business days and hold a Q3 installation slot. This proposal and pricing are valid for 45 days.",
                            "subtitle",
                        ),
                        button("Approve & schedule site survey"),
                    ),
                ),
                b: empty,
            },
            { background: bgImage("brightline-solar-sunset", 0.58) },
        ),
    ],
    bgImage("cascade-bg", 0.35),
);

// ─────────────────────────────────────────────────────────────────────────────
// Template 2 — Quarterly board meeting deck (deck)
// Tideline, a product-analytics SaaS, presenting Q2 FY2026 to its board.
// ─────────────────────────────────────────────────────────────────────────────

export const boardDeck: ArtifactContent = deck(
    "press",
    [
        section(
            "cover",
            "full",
            {
                a: cell(
                    group(
                        t("BOARD MEETING · Q2 FY2026", "label"),
                        t("Tideline", "h1"),
                        t(
                            "Product analytics for teams that ship daily. A strong quarter: ARR up 19% to $6.2M, NRR holding at 121%, and the Signals launch already live in 38% of accounts. Prepared for the board, June 2026.",
                            "subtitle",
                        ),
                        t("Priya Anand · Co-founder & CEO", "caption"),
                    ),
                ),
            },
            { background: bgImage("tideline-board-cover", 0.55) },
        ),
        section("agenda", "full", {
            a: cell(
                group(
                    t("Agenda", "label"),
                    t("What we’ll cover today.", "h2"),
                    bullets(
                        "The quarter at a glance — KPIs vs. plan",
                        "Financials — revenue, burn and runway",
                        "Growth & funnel — pipeline and conversion",
                        "Product & ops — what shipped, what’s next",
                        "Team & hiring — org and key roles",
                        "Risks & mitigations",
                        "Priorities for Q3",
                        "Open discussion",
                    ),
                ),
            ),
        }),
        section("glance", "three-up", {
            a: cell(stat("$6.2M", "ARR · +19% QoQ")),
            b: cell(stat("121%", "Net revenue retention")),
            c: cell(stat("16 mo", "Cash runway")),
        }),
        section("financials-rev", "split-6040", {
            a: cell(
                group(
                    t("01 — Financials", "label"),
                    t("Six quarters of compounding growth.", "h2"),
                    t(
                        "ARR reached $6.2M, up 19% quarter-over-quarter and 7 points ahead of plan. Expansion revenue drove 58% of net-new ARR — existing accounts are growing faster than we’re adding logos, which is exactly the shape we want heading into the Series B.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "2.9, 3.4, 4.0, 4.6, 5.2, 6.2", 240),
                    t("ARR by quarter, Q1 FY25 – Q2 FY26 ($M)", "caption"),
                ),
            ),
        }),
        section("financials-table", "full", {
            a: cell(
                group(
                    t("01 — Financials", "label"),
                    t("The numbers vs. plan.", "h2"),
                    table(
                        "Metric,Q1,Q2,Plan,vs. Plan\nARR,$5.2M,$6.2M,$5.8M,+7%\nNet new ARR,$0.6M,$1.0M,$0.8M,+25%\nNRR,118%,121%,118%,+3pt\nGross margin,79%,81%,80%,+1pt\nNet burn,$0.34M,$0.31M,$0.38M,better\nCash runway,15 mo,16 mo,13 mo,+3 mo",
                    ),
                ),
            ),
        }),
        section("funnel", "split-4060", {
            a: cell(
                group(
                    t("02 — Growth & funnel", "label"),
                    t("The funnel is tightening.", "h2"),
                    t(
                        "Top-of-funnel held steady while activation and paid conversion both improved — a product-led motion finally compounding. Sales-assisted deals now close 22% faster after we shipped the in-product trial extension.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                diagram(
                    "funnel",
                    "12.4K signups, 7.8K activated, 1.9K trials, 540 closed-won",
                    240,
                ),
            ),
        }),
        section("product", "split-4060", {
            a: cell(img("tideline-signals-dashboard", 1.2)),
            b: cell(
                group(
                    t("03 — Product & ops", "label"),
                    t("Signals shipped — and it’s landing.", "h2"),
                    bullets(
                        "Launched Signals — automated anomaly detection on any metric",
                        "Adoption hit 38% of accounts in five weeks",
                        "Cut median dashboard load time from 2.4s to 0.9s",
                        "99.98% platform uptime — best quarter on record",
                    ),
                ),
            ),
        }),
        section("team", "split-6040", {
            a: cell(
                group(
                    t("04 — Team & hiring", "label"),
                    t("Scaling the org behind the growth.", "h2"),
                    t(
                        "We grew from 38 to 49 full-time staff this quarter, weighted toward engineering and customer success. The VP Sales search is in final-round interviews with two strong candidates; we expect an offer out by mid-July.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(chart("bar", "38, 41, 44, 49", 240), t("Headcount by quarter", "caption")),
            ),
        }),
        section(
            "voice",
            "full",
            {
                a: cell(
                    quote(
                        "Tideline is the first analytics tool our PMs actually open every morning. Signals caught a checkout regression before our on-call did.",
                        "— Theo Marsh · Head of Product, Loop Commerce",
                    ),
                ),
            },
            { background: bgImage("tideline-customer-team", 0.6) },
        ),
        section("risks", "two-col", {
            a: cell(
                callout(
                    "caution",
                    group(
                        t("Sales leadership gap", "h3"),
                        t(
                            "We’ve run two quarters without a VP Sales, capping enterprise pipeline. Mitigation: two finalists in process, offer expected mid-July; founders are covering the top deals until then.",
                            "body",
                        ),
                    ),
                ),
            ),
            b: cell(
                callout(
                    "warn",
                    group(
                        t("Revenue concentration", "h3"),
                        t(
                            "Our top 5 accounts are 31% of ARR. Mitigation: a dedicated mid-market motion launches in Q3 to broaden the base and dilute concentration risk.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("priorities", "three-up", {
            a: cell(
                card(
                    t("Close the Series B", "h3"),
                    bullets(
                        "Open the round in August",
                        "Target $18M at a $90M cap",
                        "Two term sheets as the goal",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Ship Signals v2", "h3"),
                    bullets(
                        "Custom alert routing",
                        "Slack & PagerDuty integrations",
                        "Forecasting on any metric",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Build the sales engine", "h3"),
                    bullets(
                        "Hire VP Sales & two AEs",
                        "Launch the mid-market motion",
                        "Lift NRR toward 125%",
                    ),
                ),
            ),
        }),
        section(
            "discussion",
            "full",
            {
                a: cell(
                    group(
                        t("05 — Discussion", "label"),
                        t("Where we’d value the board’s input.", "h2"),
                        bullets(
                            "Series B timing and the target investor list",
                            "The right pace of sales hiring vs. burn",
                            "Whether to accelerate the mid-market motion",
                            "Intros to VP Sales candidates and design partners",
                        ),
                        button("Open discussion"),
                    ),
                ),
            },
            { background: bgImage("tideline-board-closing", 0.6) },
        ),
    ],
    bgImage("tideline-bg", 0.3),
);

// ─────────────────────────────────────────────────────────────────────────────
// Template 1 — Sponsorship proposal (deck)
// Harborlight Festival, a three-day waterfront music, food & arts festival in
// Oakhaven, pitching brands on a 2026 sponsorship.
// ─────────────────────────────────────────────────────────────────────────────

export const sponsorshipDeck: ArtifactContent = deck(
    "deco",
    [
        // ── Cover ────────────────────────────────────────────────────────────
        section(
            "cover",
            "full",
            {
                a: cell(
                    group(
                        t("HARBORLIGHT FESTIVAL 2026 · SPONSORSHIP PROSPECTUS", "label"),
                        t("Three days on the water. One unforgettable summer.", "h1"),
                        t(
                            "Harborlight is Oakhaven’s flagship waterfront festival — three days of live music, regional food, and public art on the working piers. We’re inviting a small circle of partners to help us build the 2026 edition, and to reach the 65,000 people who’ll spend a long weekend with us.",
                            "subtitle",
                        ),
                        badge("AUG 14–16, 2026 · PIER 9, OAKHAVEN"),
                    ),
                ),
            },
            { background: bgImage("harborlight-pier-sunset-crowd", 0.55) },
        ),

        // ── The property ─────────────────────────────────────────────────────
        section("property", "split-6040", {
            a: cell(
                group(
                    t("THE PROPERTY", "label"),
                    t("A festival the whole region plans its summer around.", "h2"),
                    t(
                        "What started in 2014 as a single-stage block party on Pier 9 has grown into the largest open-air event on the Oakhaven calendar. Four stages, a 40-vendor food market, a juried art walk, and a free family programme run from Friday afternoon to Sunday night, all framed by the harbor and the city skyline behind it.",
                        "body",
                    ),
                    t(
                        "It is independently produced, fiercely local, and sold out three years running. Partners aren’t buying a logo placement — they’re buying a place in the weekend people remember.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("harborlight-main-stage-dusk", 0.82)),
        }),

        // ── Our audience ─────────────────────────────────────────────────────
        section("audience", "three-up", {
            a: cell(
                group(
                    t("OUR AUDIENCE", "label"),
                    stat("65K", "attendees across the three-day weekend"),
                ),
            ),
            b: cell(stat("68%", "aged 21–44, the hard-to-reach experiential spender")),
            c: cell(stat("$120", "average per-person spend on-site, beyond the ticket")),
        }),

        // ── Reach & engagement ───────────────────────────────────────────────
        section("reach", "split-4060", {
            a: cell(
                group(
                    chart("bar", "18, 27, 38, 52, 65", 240),
                    t(
                        "Paid attendance by year, in thousands (2018 → 2025). 2025 sold out in nine days.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("REACH & ENGAGEMENT", "label"),
                    t("The crowd is only half the story.", "h2"),
                    t(
                        "Harborlight lives online long after the last set ends. Our channels and the attendee-generated wave around them turn a single weekend into a months-long conversation that your brand sits inside of.",
                        "body",
                    ),
                    bullets(
                        "4.2M social impressions across the 2025 campaign window",
                        "240K combined followers on Instagram, TikTok & email",
                        "11M earned media impressions from 38 press placements",
                    ),
                ),
            ),
        }),

        // ── Why partner with us ──────────────────────────────────────────────
        section(
            "why",
            "full",
            {
                a: cell(
                    group(
                        t("WHY PARTNER WITH US", "label"),
                        t("A weekend of goodwill you can’t buy in a feed.", "h2"),
                        t(
                            "People arrive at Harborlight relaxed, generous, and ready to discover. That’s a context most marketing never gets near. Our partners don’t interrupt the experience — they make it better: shade and water on a hot pier, the charging lockers that save a night, the ferry that gets everyone home. Sponsorship here reads as hosting, not advertising, and the audience remembers who hosted them.",
                            "body",
                        ),
                        button("Talk to our partnerships team"),
                    ),
                ),
            },
            { background: bgImage("harborlight-crowd-golden-hour", 0.6) },
        ),

        // ── On-site activations ──────────────────────────────────────────────
        section("activations", "three-up", {
            a: cell(
                card(
                    img("harborlight-brand-lounge", 1.4),
                    t("Branded lounges", "h3"),
                    t(
                        "Shaded waterfront decks with seating, charging, and your brand as the host of the calm.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("harborlight-sampling-booth", 1.4),
                    t("Sampling & retail", "h3"),
                    t(
                        "Hand product to 65,000 people in the exact moment they’re open to trying something new.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("harborlight-stage-naming", 1.4),
                    t("Stage & moment naming", "h3"),
                    t(
                        "Put your name on a stage, the sunset set, or the after-dark fireworks over the harbor.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Sponsorship tiers ────────────────────────────────────────────────
        section("tiers", "full", {
            a: cell(
                group(
                    t("SPONSORSHIP TIERS", "label"),
                    t("Four ways in. One conversation to find your fit.", "h2"),
                    table(
                        "Tier,Investment,Availability,Headline benefit\nPresenting,$120K,1 partner,“Harborlight presented by” lockup across all assets\nStage,$60K,4 partners,Naming rights to a named stage + on-stage moments\nMarket,$28K,8 partners,Premium activation footprint in the food & art market\nCommunity,$9K,12 partners,Logo placement, tickets & a sampling table",
                    ),
                    t(
                        "Every tier is a starting point — we build the activation around your goals, not a fixed menu.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── What sponsors get ────────────────────────────────────────────────
        section("benefits", "split-6040", {
            a: cell(
                group(
                    t("WHAT SPONSORS GET", "label"),
                    t("Reach, hospitality, and a story worth telling.", "h2"),
                    bullets(
                        "Logo & brand integration across stages, signage, app and the festival website",
                        "A turnkey on-site activation footprint with power, water and load-in handled",
                        "A VIP hospitality allotment — tickets, the harbor-deck lounge, and artist access",
                        "Inclusion in the paid, owned and earned media campaign reaching 4M+ people",
                        "Full post-event reporting: footfall, dwell time, sampling and social lift",
                    ),
                ),
            ),
            b: cell(
                group(
                    img("harborlight-vip-deck-evening", 0.78),
                    t(
                        "The harbor-deck hospitality lounge — where partners host clients above the crowd.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Past partners & results ──────────────────────────────────────────
        section("results", "three-up", {
            a: cell(
                group(
                    t("PAST PARTNERS & RESULTS", "label"),
                    stat("3.1M", "branded impressions delivered for our 2025 presenting partner"),
                ),
            ),
            b: cell(stat("42K", "product samples handed out across the weekend")),
            c: cell(stat("94%", "of 2025 partners renewed or upgraded for 2026")),
        }),

        // ── Partner quote (feature background) ────────────────────────────────
        section(
            "quote",
            "full",
            {
                a: cell(
                    quote(
                        "Harborlight is the only sponsorship on our calendar where the audience thanks us for being there. We didn’t buy attention — we earned a weekend of it.",
                        "Priya Anand · VP Brand, Northwater Seltzer · Presenting Partner 2024–25",
                    ),
                ),
            },
            { background: bgImage("harborlight-fireworks-harbor", 0.62) },
        ),

        // ── The ask / next steps ─────────────────────────────────────────────
        section("ask", "split-4060", {
            a: cell(img("harborlight-aerial-pier-map", 1.05)),
            b: cell(
                group(
                    t("THE ASK", "label"),
                    t("Let’s build your 2026 weekend.", "h2"),
                    t(
                        "Tiers are confirmed on a first-come basis and the presenting slot moves fast — we hold partner conversations through March and lock the roster by April 1. Send us your goals and we’ll come back with a tailored activation plan and a single, simple agreement.",
                        "body",
                    ),
                    button("partners@harborlightfest.org"),
                ),
            ),
        }),
    ],
    bgImage("harborlight-bg-water-texture", 0.32),
);

// ─────────────────────────────────────────────────────────────────────────────
// Template 2 — Statement of Work (doc)
// Anvil & Oak (a product studio) delivering a commerce replatform and a custom
// returns portal for Wexford Outdoor Co.
// ─────────────────────────────────────────────────────────────────────────────

export const sow: ArtifactContent = doc(
    "blue",
    [
        // ── Cover ────────────────────────────────────────────────────────────
        section(
            "cover",
            "full",
            {
                a: cell(
                    group(
                        t("STATEMENT OF WORK · SOW-2026-014", "label"),
                        t("Commerce Replatform & Returns Portal", "h1"),
                        t(
                            "Prepared by Anvil & Oak Studio for Wexford Outdoor Co. This Statement of Work defines the scope, deliverables, timeline, and commercial terms for a twelve-week engagement to replatform wexfordoutdoor.com and ship a self-service returns experience.",
                            "subtitle",
                        ),
                        t(
                            "Effective: July 6, 2026 · Master Services Agreement dated March 2, 2026",
                            "caption",
                        ),
                    ),
                ),
            },
            { background: bgImage("sow-blueprint-desk-laptop", 0.55) },
        ),

        // ── Project overview ─────────────────────────────────────────────────
        section("overview", "split-6040", {
            a: cell(
                group(
                    t("1 · PROJECT OVERVIEW", "label"),
                    t("Replatform the storefront, and stop returns from leaking revenue.", "h2"),
                    t(
                        "Wexford Outdoor Co. runs a high-traffic Shopify storefront on an aging custom theme that no longer keeps pace with its catalog or its peak-season load. Returns are handled by email and a shared inbox, which costs the support team an estimated 40 hours a week and frustrates customers.",
                        "body",
                    ),
                    t(
                        "Anvil & Oak will rebuild the storefront on a headless architecture and deliver a branded, self-service returns and exchange portal integrated with Wexford’s existing fulfillment and OMS systems.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("sow-storefront-mockups", 0.82)),
        }),

        // ── Objectives ───────────────────────────────────────────────────────
        section("objectives", "full", {
            a: cell(
                group(
                    t("2 · OBJECTIVES", "label"),
                    t("What success looks like.", "h2"),
                    t(
                        "The engagement is considered successful when the following business outcomes are met within ninety days of launch:",
                        "body",
                    ),
                    bullets(
                        "Reduce storefront median page load to under 1.5s on 4G, measured by Core Web Vitals",
                        "Cut return-handling support time by 60% through self-service automation",
                        "Increase exchange-over-refund rate to 35%, retaining revenue inside the brand",
                        "Support a 4× traffic spike during the autumn sale with no manual scaling",
                    ),
                ),
            ),
        }),

        // ── Engagement at a glance ───────────────────────────────────────────
        section("at-a-glance", "three-up", {
            a: cell(
                group(
                    t("AT A GLANCE", "label"),
                    stat("12 wks", "engagement, kickoff to production launch"),
                ),
            ),
            b: cell(stat("5", "named deliverables across two workstreams")),
            c: cell(stat("$186K", "fixed fee, billed against five milestones")),
        }),

        // ── Our approach ─────────────────────────────────────────────────────
        section("approach", "split-4060", {
            a: cell(
                group(
                    img("sow-team-whiteboard-planning", 1.05),
                    t(
                        "Discovery workshops run on-site in week one to lock scope before any code ships.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("3 · OUR APPROACH", "label"),
                    t("Five phases, weekly demos, no surprises.", "h2"),
                    t(
                        "We work in one-week iterations with a Friday demo and a shared backlog. Each phase ends in a reviewable artifact and a written sign-off, so scope and budget stay visible from day one.",
                        "body",
                    ),
                    diagram("process", "Discovery, Design, Build, QA & UAT, Launch", 180),
                ),
            ),
        }),

        // ── Scope of work ────────────────────────────────────────────────────
        section("scope", "full", {
            a: cell(
                group(
                    t("4 · SCOPE OF WORK", "label"),
                    t("In scope.", "h2"),
                    t("Anvil & Oak will design, build, and deliver the following:", "body"),
                    bullets(
                        "A headless storefront (Next.js) consuming Shopify’s Storefront API, with ISR and edge caching",
                        "Responsive design system covering 18 templates: home, collection, product, cart, and account",
                        "A self-service returns & exchange portal with policy rules, label generation, and status tracking",
                        "Integrations with the existing OMS, ShipStation, and the Klaviyo marketing stack",
                        "Analytics instrumentation, a staging environment, and CI/CD on the client’s Vercel account",
                        "Content migration of the existing catalog, redirects, and SEO metadata",
                    ),
                ),
            ),
        }),

        // ── Out of scope ─────────────────────────────────────────────────────
        section("out-of-scope", "split-6040", {
            a: cell(
                callout(
                    "warn",
                    group(
                        t("5 · OUT OF SCOPE", "label"),
                        t(
                            "To keep the timeline and fee firm, the following are explicitly excluded from this SOW and may be addressed under a separate change order:",
                            "body",
                        ),
                        bullets(
                            "Net-new photography, copywriting, or brand identity work",
                            "Replatforming the ERP, warehouse (WMS), or payment processor",
                            "Native iOS / Android applications",
                            "Ongoing post-launch support beyond the 30-day warranty period",
                            "Third-party app license fees and infrastructure hosting costs",
                        ),
                    ),
                ),
            ),
            b: cell(img("sow-checklist-documents", 0.78)),
        }),

        // ── Deliverables ─────────────────────────────────────────────────────
        section("deliverables", "full", {
            a: cell(
                group(
                    t("6 · DELIVERABLES", "label"),
                    t("What you receive, and when.", "h2"),
                    table(
                        "Deliverable,Description,Format,Due\nD1 · Discovery brief,Technical audit, scope lock & architecture diagram,PDF + Figma,Week 2\nD2 · Design system,Component library & 18 responsive templates,Figma,Week 4\nD3 · Storefront,Production-ready headless build with CI/CD,Git repo + staging,Week 9\nD4 · Returns portal,Self-service returns & exchange flow,Git repo + staging,Week 10\nD5 · Launch package,Cutover plan, runbook & analytics dashboards,PDF + Looker,Week 12",
                    ),
                ),
            ),
        }),

        // ── Timeline & milestones ────────────────────────────────────────────
        section("timeline", "full", {
            a: cell(
                group(
                    t("7 · TIMELINE & MILESTONES", "label"),
                    t("A twelve-week path to launch.", "h2"),
                    diagram(
                        "process",
                        "Wk 1–2 Discovery, Wk 3–4 Design, Wk 5–9 Build, Wk 10–11 QA & UAT, Wk 12 Launch",
                        200,
                    ),
                    t(
                        "Milestone acceptance is due within five business days of delivery; absent written objection, a deliverable is deemed accepted.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Roles & responsibilities ─────────────────────────────────────────
        section("roles", "full", {
            a: cell(
                group(
                    t("8 · ROLES & RESPONSIBILITIES", "label"),
                    t("Who owns what.", "h2"),
                    table(
                        "Role,Name,Responsibility,Party\nEngagement lead,Dana Okonkwo,Scope, schedule & weekly status,Anvil & Oak\nTech lead,Marcus Vey,Architecture & code review,Anvil & Oak\nProduct designer,Lena Sørensen,Design system & UX,Anvil & Oak\nProduct owner,Tom Bryce,Decisions, approvals & content,Wexford\nIT liaison,Sara Whitlock,System access & integrations,Wexford",
                    ),
                    t(
                        "Wexford will provide environment access and consolidated feedback within two business days of each request.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Pricing & payment terms ──────────────────────────────────────────
        section("pricing", "full", {
            a: cell(
                group(
                    t("9 · PRICING & PAYMENT TERMS", "label"),
                    t("Fixed fee, billed against milestones.", "h2"),
                    table(
                        "Milestone,Trigger,Amount,Payment terms\nM1 · Kickoff,SOW execution,$37,200,Due on signing\nM2 · Design accepted,D2 sign-off,$46,500,Net 15\nM3 · Build complete,D3 sign-off,$55,800,Net 15\nM4 · UAT passed,D4 sign-off,$28,000,Net 15\nM5 · Launch,Production cutover,$18,500,Net 15\nTotal,,$186,000,",
                    ),
                    t(
                        "Fees are fixed for the scope above. Approved change orders are billed at a blended rate of $215/hour.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Assumptions ──────────────────────────────────────────────────────
        section("assumptions", "full", {
            a: cell(
                group(
                    t("10 · ASSUMPTIONS & DEPENDENCIES", "label"),
                    t("What this plan relies on.", "h2"),
                    callout(
                        "info",
                        t(
                            "The timeline and fee in this SOW assume the conditions below hold. A material change to any of them may trigger a written change order adjusting scope, schedule, or cost.",
                            "body",
                        ),
                    ),
                    bullets(
                        "Wexford’s Shopify Plus plan and existing API credentials remain available throughout",
                        "Product, pricing, and inventory data are supplied in a clean, agreed export format by Week 2",
                        "A single product owner is empowered to give binding approvals within the agreed SLAs",
                        "Third-party services (ShipStation, Klaviyo, OMS) expose stable, documented APIs",
                    ),
                ),
            ),
        }),

        // ── Acceptance / signatures ──────────────────────────────────────────
        section("acceptance", "full", {
            a: cell(
                group(
                    t("11 · ACCEPTANCE", "label"),
                    t("Authorization to proceed.", "h2"),
                    t(
                        "By signing below, the parties agree to the scope, deliverables, timeline, and commercial terms set out in this Statement of Work, governed by the Master Services Agreement dated March 2, 2026.",
                        "body",
                    ),
                    table(
                        "Party,Signatory,Title,Date\nAnvil & Oak Studio,Dana Okonkwo,Principal,_______________\nWexford Outdoor Co.,Tom Bryce,VP Digital,_______________",
                    ),
                    button("Sign & return this SOW"),
                ),
            ),
        }),
    ],
    bgImage("sow-bg-grid-paper", 0.3),
);
