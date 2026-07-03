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
    divider,
    doc,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// A quarterly business review — Tessera, a data-integration (iPaaS) company, reviewing Q2 FY2026
// for its board and executive staff. Candid, operational, decision-oriented.
export const qbr: ArtifactContent = doc("manuscript", [
    section(
        "q1",
        "full",
        {
            a: cell(
                group(
                    t("TESSERA · QUARTERLY BUSINESS REVIEW", "label"),
                    t("Q2 FY2026 in Review", "h1"),
                    t(
                        "A strong quarter on revenue, a soft one on new logos, and a clear read on what to fix before Q3. The numbers, the wins, the misses — and the four decisions we need from this room.",
                        "subtitle",
                    ),
                    t(
                        "Prepared by the Tessera leadership team · For the Board & Executive Staff · June 2026",
                        "caption",
                    ),
                    badge("ARR $48.6M · NRR 119% · 612 CUSTOMERS"),
                ),
            ),
        },
        {
            background: bgImage(
                "tessera-leadership-team-glass-meeting-room-quarterly-review",
                0.58,
            ),
        },
    ),

    section("q2", "split-6040", {
        a: cell(
            group(
                t("The quarter at a glance", "label"),
                t("We beat plan on revenue and missed it on reach.", "h2"),
                t(
                    "Q2 was our best revenue quarter ever and our slowest new-logo quarter in a year — at the same time. Existing customers expanded faster than we modeled, carrying net new ARR to 113% of plan. But the top of the funnel cooled: enterprise cycles stretched, the SDR class ramped slowly, and we closed 84 of the 95 new logos we forecast.",
                    "subtitle",
                ),
                t(
                    "The shape of the business is healthy. The shape of the pipeline is the risk. This review walks the scorecard top to bottom, names what slipped without flinching, and ends with four asks that determine whether Q3 holds the line on growth.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                img("tessera-product-integration-dashboard-on-monitor", 0.82, 10),
                t(
                    "Tessera Flow shipped to general availability in May — the largest release of the quarter.",
                    "caption",
                ),
            ),
        ),
    }),

    section("q3", "three-up", {
        a: cell(stat("$5.1M", "net new ARR — 113% of plan")),
        b: cell(stat("119%", "net revenue retention, up 4 pts QoQ")),
        c: cell(stat("81%", "gross margin, holding above target")),
    }),

    section("q4", "full", {
        a: cell(
            group(
                t("Scorecard", "label"),
                t("KPIs vs. targets", "h2"),
                t(
                    "Six metrics define the quarter. Four beat or held; two missed. The pattern is consistent — anything driven by our installed base outperformed, and anything driven by new acquisition came in light.",
                    "body",
                ),
                table(
                    "Metric,Target,Actual,Status\n" +
                        "Net new ARR,$4.5M,$5.1M,Beat\n" +
                        "Net revenue retention,115%,119%,Beat\n" +
                        "New logos,95,84,Miss\n" +
                        "Gross margin,80%,81%,On track\n" +
                        "CAC payback,14 mo,16 mo,Miss\n" +
                        "Net promoter score,45,52,Beat",
                ),
            ),
        ),
    }),

    section("q5", "split-6040", {
        a: cell(
            group(
                t("Revenue & pipeline", "label"),
                t("ARR keeps compounding; coverage is thinning.", "h2"),
                t(
                    "ARR crossed $48.6M, our sixth straight quarter of double-digit sequential growth, driven almost entirely by expansion. The concern sits one layer down: qualified pipeline entering Q3 is 3.2x of target, below our 4.0x guardrail. We are not short on revenue today — we are short on the future quarters' worth of it.",
                    "body",
                ),
                stat("3.2x", "Q3 pipeline coverage vs. 4.0x guardrail"),
            ),
        ),
        b: cell(
            group(
                chart("line", "30, 34, 38, 42, 45, 49", 300),
                t("Ending ARR by quarter, $M, Q1 FY25 – Q2 FY26", "caption"),
            ),
        ),
    }),

    section("q6", "split-4060", {
        a: cell(
            group(
                img("tessera-customer-success-manager-on-video-call", 1.05, 10),
                t(
                    "Northwind Bank went live on Tessera in six weeks — a new record for a Tier 1 account.",
                    "caption",
                ),
            ),
        ),
        b: cell(
            group(
                t("What went right", "label"),
                t("Four wins worth repeating", "h2"),
                bullets(
                    "Closed Northwind Bank at $1.2M ARR — our largest new logo ever, and a reference account in financial services.",
                    "Shipped Tessera Flow to GA; 38% of active customers adopted it within three weeks of launch.",
                    "Earned SOC 2 Type II, unblocking nine enterprise deals that had been gated on it.",
                    "Expanded Cobalt Health from two business units to seven, a $640K upsell closed a quarter early.",
                ),
            ),
        ),
    }),

    section(
        "q7",
        "full",
        {
            a: cell(
                quote(
                    "Our installed base is doing the work of a sales team we haven't hired yet. That's a gift and a warning.",
                    "— Priya Nandakumar, Chief Revenue Officer",
                ),
            ),
        },
        { background: bgImage("tessera-quiet-open-office-evening-warm-light", 0.6) },
    ),

    section("q8", "full", {
        a: cell(
            group(
                t("What slipped", "label"),
                t("Three things we missed — and why", "h2"),
                callout(
                    "caution",
                    group(
                        t("NEW-LOGO SHORTFALL", "label"),
                        t(
                            "We closed 84 of 95 forecast new logos. Two-thirds of the gap traces to enterprise deals slipping a quarter as security review queued behind our SOC 2 cycle; the rest to an SDR class that ramped roughly five weeks slower than the last. Neither is structural, but both are now in the Q3 plan as named risks.",
                            "body",
                        ),
                    ),
                ),
                t(
                    "Two more slips worth naming plainly: Reverse ETL, promised for May GA, moved to Q3 after a data-residency rework — it cost us at least two competitive evaluations. And CAC payback drifted to 16 months against a 14-month target, a direct consequence of spending into a funnel that converted slower than planned.",
                    "body",
                ),
            ),
        ),
    }),

    section("q9", "split-6040", {
        a: cell(
            group(
                t("Customer health", "label"),
                t("Retention is strong; a few whales need watching.", "h2"),
                t(
                    "Gross retention held at 94% and NPS climbed to 52, its highest reading since we began tracking it. Support CSAT sits at 4.6/5. The watch list is short but heavy: three accounts representing $2.1M of ARR are mid-renewal with new economic buyers, and all three are now under direct executive sponsorship.",
                    "body",
                ),
                quote(
                    "Tessera quietly became the system the rest of our stack reports into. We'd feel its absence in a day.",
                    "— Director of Data Platform, Cobalt Health",
                ),
            ),
        ),
        b: cell(
            group(
                chart("line", "111, 113, 115, 117, 119", 260),
                t("Net revenue retention by quarter, %", "caption"),
            ),
        ),
    }),

    section("q10", "full", {
        a: cell(
            group(
                t("Looking ahead", "label"),
                t("Priorities for Q3", "h2"),
                t(
                    "One quarter, five moves. Each maps directly to a gap above — the plan is to fix what slipped without slowing what's working.",
                    "body",
                ),
                bullets(
                    "Rebuild pipeline coverage to 4.0x by mid-quarter — protect outbound spend, accelerate the partner-sourced channel.",
                    "Ship Reverse ETL to GA in week six; win back the two stalled evaluations it cost us.",
                    "Fully ramp the new SDR class and stand up a dedicated enterprise security-review fast lane.",
                    "Pull CAC payback back toward 14 months by reweighting spend to the segments that convert.",
                    "Lock the three at-risk renewals early, ahead of their economic-buyer transitions.",
                ),
            ),
        ),
    }),

    section("q11", "full", {
        a: cell(
            card(
                t("The asks", "label"),
                t("Four decisions we need from this room", "h2"),
                bullets(
                    "Approve six incremental enterprise AE hires, front-loaded into July to protect H2 capacity.",
                    "Release the $400K field-marketing budget to refill top-of-funnel ahead of Q3.",
                    "Sponsor the three strategic renewals at board level — intros where you have them.",
                    "Sign off on the usage-based pricing change for the mid-market tier, effective August 1.",
                ),
                button("Approve the Q3 plan"),
            ),
        ),
    }),

    section(
        "q12",
        "full",
        {
            a: cell(
                t(
                    "The business is compounding from the inside out — the work now is to make sure the next twelve months of new customers are as healthy as this quarter's revenue. We have the team, the product, and the plan. We need the four yeses above to run it.",
                    "subtitle",
                ),
            ),
        },
        { background: bgImage("tessera-city-skyline-sunrise-office-window", 0.55) },
    ),
]);

// An industry trends report — the state of industrial robotics in 2026, published by an analyst
// practice. Cover, the landscape, five key trends, implications, predictions, and methodology.
export const trendsReport: ArtifactContent = doc("mocha", [
    section(
        "t1",
        "full",
        {
            a: cell(
                group(
                    t("INDUSTRY TRENDS REPORT · 2026", "label"),
                    t("The Factory Wakes Up", "h1"),
                    t(
                        "For thirty years the industrial robot was a caged, single-purpose machine bolted to a floor. In 2026 it is becoming something else — cheaper, sighted, rentable, and increasingly able to share the room with people. This is the year automation stopped being a project and started being a default.",
                        "subtitle",
                    ),
                    t("Continuum Research · Automation & Robotics Practice · June 2026", "caption"),
                    badge("420 MANUFACTURERS SURVEYED · 11 SECTORS · 19 COUNTRIES"),
                ),
            ),
        },
        { background: bgImage("industrial-robot-arms-automotive-assembly-line-sparks", 0.58) },
    ),

    section("t2", "split-6040", {
        a: cell(
            group(
                t("The landscape today", "label"),
                t("Automation crossed from the margins to the mainstream.", "h2"),
                t(
                    "The story of industrial robotics used to be a story about cars — heavy arms welding chassis in a handful of giant plants. That era hasn't ended, but it has been overtaken. The fastest growth now comes from electronics, logistics, food, and metals, and from companies with under five hundred employees that could never have justified automation a decade ago.",
                    "subtitle",
                ),
                t(
                    "Three forces are converging: hardware costs are falling, perception software has gotten good enough to handle mess, and new financing models have erased the upfront capital wall. Together they are pulling robots out of the cage and into the kind of work that used to be considered too varied, too delicate, or too small-batch to automate.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                img("collaborative-robot-cobot-working-beside-human-technician-factory", 0.82, 10),
                t(
                    "A cobot and a technician share a line at a contract electronics plant in Penang.",
                    "caption",
                ),
            ),
        ),
    }),

    section("t3", "three-up", {
        a: cell(stat("4.3M", "industrial robots operating worldwide")),
        b: cell(stat("+12%", "annual installations, 2025 vs. 2024")),
        c: cell(stat("$16.5B", "projected cobot market by 2030")),
    }),

    section("t4", "split-6040", {
        a: cell(
            group(
                t("Trend 01", "label"),
                t("Collaborative robots go mainstream", "h2"),
                t(
                    "Cobots — robots designed to work safely alongside people without a cage — have moved from novelty to backbone. They install in days rather than months, cost a fraction of traditional cells, and don't require a safety guard or a dedicated operator. In 2020 they were one in twelve new installations; on our forecast they cross one in three by 2027.",
                    "body",
                ),
                t(
                    "What changed is not the robots so much as the buyers. The marginal new customer in 2026 is a mid-sized job shop automating a single repetitive station — palletizing, machine tending, quality inspection — and expecting payback inside a year. Cobots are the only category that meets that bar.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                chart("line", "9, 12, 16, 21, 27, 33", 300),
                t("Cobots as a share of new robot installations, %, 2022–2027E", "caption"),
            ),
        ),
    }),

    section("t5", "split-4060", {
        a: cell(
            group(
                img("robot-arm-machine-vision-camera-bin-picking-parts", 1.05, 10),
                t(
                    "Vision-guided bin picking — the task that AI perception finally solved.",
                    "caption",
                ),
            ),
        ),
        b: cell(
            group(
                t("Trend 02", "label"),
                t("Perception gets a brain", "h2"),
                t(
                    "The hardest problem in automation was never motion — it was sight. A robot that can only repeat a memorized path is useless the moment a part arrives at the wrong angle. AI-driven vision changed that. Modern perception stacks identify, orient, and grasp jumbled parts from a bin in real time, a task that defeated automation for thirty years.",
                    "body",
                ),
                stat("10x", "improvement in vision-guided bin-picking success since 2021"),
                t(
                    "The downstream effect is larger than the feature itself: once a robot can handle variability, the universe of automatable tasks expands dramatically, and the line between fixed automation and flexible labor begins to blur.",
                    "body",
                ),
            ),
        ),
    }),

    section("t6", "split-6040", {
        a: cell(
            group(
                t("Trend 03", "label"),
                t("Robots without the capital expense", "h2"),
                t(
                    "Robotics-as-a-Service is doing to automation what cloud did to servers. Instead of a six-figure purchase and a multi-year depreciation schedule, manufacturers rent capacity by the month — hardware, software, maintenance, and uptime guarantees bundled into a single operating-expense line. RaaS contracts signed grew more than tenfold in three years.",
                    "body",
                ),
                t(
                    "The model matters most for exactly the buyers who were previously locked out: smaller manufacturers without capital budgets or in-house robotics teams. It converts a daunting one-time bet into a cancelable subscription, and in doing so widens the market far faster than falling hardware prices alone could.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                chart("bar", "120, 340, 610, 980, 1520", 300),
                t("RaaS contracts signed per year, 2021–2025", "caption"),
            ),
        ),
    }),

    section(
        "t7",
        "full",
        {
            a: cell(
                group(
                    t("Trend 04", "label"),
                    t("The labor equation flips", "h2"),
                    stat("1.9M", "U.S. manufacturing jobs projected to go unfilled by 2030"),
                    t(
                        "For most of the last century automation was framed as a substitute for available labor. In 2026 it is increasingly a response to labor that simply isn't there. An aging workforce, tighter immigration, and a reshoring wave have left factories structurally short-staffed — and robots are filling the dull, dirty, and dangerous roles people no longer take. The political conversation about jobs is, on the factory floor, quietly inverting.",
                        "subtitle",
                    ),
                ),
            ),
        },
        { background: bgImage("empty-modern-factory-floor-automation-robots-night-shift", 0.62) },
    ),

    section("t8", "split-6040", {
        a: cell(
            group(
                t("Trend 05", "label"),
                t("Humanoids cross from demo to pilot", "h2"),
                t(
                    "The most hyped category is also the least proven — but in 2026 it stopped being only a hype. General-purpose humanoid robots moved from staged demos to paid pilots inside real warehouses and plants, with announced deployments climbing from a handful in 2022 to roughly ninety this year. None are at scale, and the unit economics remain unproven.",
                    "body",
                ),
                t(
                    "Our read is to treat humanoids as a five-year bet, not a 2026 purchase. The near-term value is narrow — moving totes, tending machines, simple loading — and the durability and cost questions are real. But the trajectory is steep enough that no operations leader should let the category go un-watched.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                chart("line", "3, 7, 18, 44, 90", 260),
                t("Announced humanoid robot pilots, cumulative, 2022–2026", "caption"),
            ),
        ),
    }),

    section(
        "t9",
        "full",
        {
            a: cell(
                quote(
                    "The question on the floor is no longer whether to automate a task. It's which financing model and how soon — and that shift is the whole story of 2026.",
                    "— Lead Analyst, Continuum Automation Practice",
                ),
            ),
        },
        { background: bgImage("warehouse-logistics-robots-conveyor-blue-light", 0.6) },
    ),

    section("t10", "full", {
        a: cell(
            card(
                t("What it means for you", "label"),
                t("Reading the trends as an operator", "h2"),
                callout(
                    "tip",
                    group(
                        t("THE PRACTICAL TAKEAWAY", "label"),
                        t(
                            "If you run operations, the cost of waiting just went up. The combination of cheap cobots, working perception, and rentable capacity means the first automatable station in your plant probably pays back inside a year — and your competitors are doing the math too.",
                            "body",
                        ),
                    ),
                ),
                bullets(
                    "Start with one station, not a line. Pick a repetitive, single-task bottleneck and prove payback before scaling.",
                    "Pilot via RaaS to sidestep the capital case and learn before you commit hardware.",
                    "Insist on vision-guided flexibility — fixed automation ages badly as product mix changes.",
                    "Watch humanoids, but don't buy yet; budget attention this year, capital in two to three.",
                ),
            ),
        ),
    }),

    section("t11", "full", {
        a: cell(
            group(
                t("The outlook", "label"),
                t("Five predictions for the next five years", "h2"),
                t(
                    "Where the curves above point, with our confidence stated plainly. We will grade ourselves against these in next year's edition.",
                    "body",
                ),
                table(
                    "Prediction,Timeframe,Confidence\n" +
                        "Cobots exceed 40% of new installations,By 2028,High\n" +
                        "Vision-guided picking becomes standard on new cells,By 2027,High\n" +
                        "RaaS becomes the default for SMB automation,By 2029,Medium\n" +
                        "Robot density doubles in reshored U.S. plants,By 2031,Medium\n" +
                        "First single-site 10,000-unit humanoid fleet deployed,By 2031,Low",
                ),
            ),
        ),
    }),

    section("t12", "full", {
        a: cell(
            group(
                divider(),
                t("Methodology", "label"),
                t(
                    "This report draws on a survey of 420 manufacturing operations leaders across eleven sectors and nineteen countries, fielded in March–April 2026, supplemented by global robot shipment data, RaaS-provider contract figures, and forty in-depth interviews with plant managers and automation integrators. Forecasts represent our base case; ranges and full segment data are available in the data appendix.",
                    "body",
                ),
                button("Request the full data appendix"),
                t(
                    "Continuum Research · Automation & Robotics Practice · Lead analyst: Dr. Elena Vasquez · © 2026",
                    "caption",
                ),
            ),
        ),
    }),
]);
