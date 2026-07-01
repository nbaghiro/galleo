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
                        t("PROPOSAL · PREPARED FOR BRIGHTLINE MANUFACTURING", "eyebrow"),
                        t("Power the plant with the roof you already own.", "display"),
                        t(
                            "Cascade Solar & Energy on a 1.4-megawatt rooftop and carport solar system for the Brightline plant in Reno — engineered to cut energy spend 68% and pay for itself in under six years. Prepared for the Brightline leadership team, June 2026.",
                            "lead",
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
                    t("Executive summary", "eyebrow"),
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
                    t("01 — Understanding your needs", "eyebrow"),
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
                    t("02 — The opportunity", "eyebrow"),
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
                    t("03 — Proposed solution", "eyebrow"),
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
                    t("Design & Engineering", "title"),
                    bullets(
                        "Structural & electrical engineering",
                        "Shade & production modeling",
                        "Utility interconnection design",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Permitting & Build", "title"),
                    bullets(
                        "All permits & inspections handled",
                        "Panel, carport & inverter install",
                        "Battery & switchgear integration",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Monitor & Maintain", "title"),
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
                    t("04 — Timeline", "eyebrow"),
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
                    t("05 — Pricing & terms", "eyebrow"),
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
                    t("Marcus Bell", "title"),
                    t("Lead Project Engineer", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("cascade-team-yuki", 1),
                    t("Yuki Tanaka", "title"),
                    t("Energy Modeling & Finance", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("cascade-team-darnell", 1),
                    t("Darnell Cruz", "title"),
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
                        t("06 — Acceptance & next steps", "eyebrow"),
                        t("Let’s lock in your rate for the next 25 years.", "h2"),
                        t(
                            "To proceed, countersign below and we’ll schedule a site survey within ten business days and hold a Q3 installation slot. This proposal and pricing are valid for 45 days.",
                            "lead",
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
                        t("BOARD MEETING · Q2 FY2026", "eyebrow"),
                        t("Tideline", "display"),
                        t(
                            "Product analytics for teams that ship daily. A strong quarter: ARR up 19% to $6.2M, NRR holding at 121%, and the Signals launch already live in 38% of accounts. Prepared for the board, June 2026.",
                            "lead",
                        ),
                        t("Priya Anand · Co-founder & CEO", "byline"),
                    ),
                ),
            },
            { background: bgImage("tideline-board-cover", 0.55) },
        ),
        section("agenda", "full", {
            a: cell(
                group(
                    t("Agenda", "eyebrow"),
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
                    t("01 — Financials", "eyebrow"),
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
                    t("01 — Financials", "eyebrow"),
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
                    t("02 — Growth & funnel", "eyebrow"),
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
                    t("03 — Product & ops", "eyebrow"),
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
                    t("04 — Team & hiring", "eyebrow"),
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
                        t("Sales leadership gap", "title"),
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
                        t("Revenue concentration", "title"),
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
                    t("Close the Series B", "title"),
                    bullets(
                        "Open the round in August",
                        "Target $18M at a $90M cap",
                        "Two term sheets as the goal",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Ship Signals v2", "title"),
                    bullets(
                        "Custom alert routing",
                        "Slack & PagerDuty integrations",
                        "Forecasting on any metric",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Build the sales engine", "title"),
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
                        t("05 — Discussion", "eyebrow"),
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
