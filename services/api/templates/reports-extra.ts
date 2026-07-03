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
    diagram,
    doc,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// A research report / whitepaper — the sixth edition of an annual study on remote work.
export const researchReport: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("RESEARCH REPORT · THE STATE OF REMOTE WORK 2026", "label"),
                        t("Where Work Lives Now", "h1"),
                        t(
                            "Six years after the office emptied, the question is no longer whether knowledge work can happen anywhere — it's where it happens best, and what that means for the people, places, and companies caught in between.",
                            "subtitle",
                        ),
                        t(
                            "Northwind Institute for Work · Annual Survey, sixth edition · June 2026",
                            "caption",
                        ),
                        badge("11,400 KNOWLEDGE WORKERS · 38 COUNTRIES · 6 INDUSTRIES"),
                    ),
                ),
            },
            { background: bgImage("remote-work-home-office-morning-light", 0.55) },
        ),
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("Executive summary", "label"),
                    t("Hybrid won — but nobody agrees what it means.", "h2"),
                    t(
                        "The headline of 2026 is settlement, not revolution. The fully-remote surge has cooled and the return-to-office mandates have plateaued; what's left is a durable, messy middle. Fifty-four percent of knowledge workers now split their week between home and an office, and almost none of them define that split the same way.",
                        "subtitle",
                    ),
                    t(
                        "Across 11,400 respondents we found that flexibility has become the single strongest predictor of retention — outranking pay growth for the first time in the survey's history. But the same flexibility that keeps people is quietly fragmenting how teams collaborate, mentor, and belong. The companies pulling ahead are not the most remote or the most in-person; they are the most deliberate.",
                        "body",
                    ),
                    t(
                        "This report lays out what changed in the past year, what the data says about productivity and presence, and what we believe the next phase of distributed work requires.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("remote-worker-laptop-kitchen-table", 0.82)),
        }),
        section("s3", "split-4060", {
            a: cell(img("research-survey-data-charts-desk", 1.05)),
            b: cell(
                group(
                    t("Methodology", "label"),
                    t("How we ran the study", "h2"),
                    t(
                        "Between February and April 2026 the Northwind Institute surveyed 11,400 full-time knowledge workers and conducted 84 structured interviews with people leaders. Respondents span six industries — technology, finance, healthcare, media, professional services, and the public sector — across 38 countries, weighted to reflect each market's knowledge-economy workforce.",
                        "body",
                    ),
                    bullets(
                        "11,400 survey responses, margin of error ±1.1 points",
                        "84 qualitative interviews with managers and HR leaders",
                        "Six industries, weighted to national workforce data",
                        "Productivity self-reports validated against 1,900 anonymized output logs",
                        "Year-over-year trends benchmarked to the 2021–2025 editions",
                    ),
                ),
            ),
        }),
        section("s4", "full", {
            a: cell(
                group(
                    t("Key findings", "label"),
                    t("Five things the data made clear", "h2"),
                    t(
                        "The numbers this year tell a coherent story: the location debate is over, the calendar debate has just begun. Here is what stood out across the five findings that follow.",
                        "subtitle",
                    ),
                ),
            ),
        }),
        section("s5", "split-6040", {
            a: cell(
                group(
                    t("Finding 01 · Where work happens", "label"),
                    t("The week is split, not the workforce", "h2"),
                    t(
                        "Hybrid is no longer a transitional state on the way back to the office — it is the destination. A majority now work in a blended pattern, while fully-remote roles held steady and fully-in-office work continued its slow decline. The interesting movement is inside hybrid: the median in-office stint fell from 3.0 days to 2.4.",
                        "body",
                    ),
                    stat("2.4 days", "median time in-office per week among hybrid workers"),
                ),
            ),
            b: cell(
                group(
                    chart("pie", "54, 27, 19", 280),
                    t(
                        "Work pattern: hybrid 54% · fully remote 27% · fully in-office 19%",
                        "caption",
                    ),
                ),
            ),
        }),
        section("s6", "three-up", {
            a: cell(stat("+11%", "self-reported focus-work output vs. a fully in-office baseline")),
            b: cell(stat("72 min", "average daily commute time reclaimed by remote-capable staff")),
            c: cell(stat("1 in 3", "managers who say measuring output still relies on presence")),
        }),
        section("s7", "split-4060", {
            a: cell(img("modern-office-collaboration-space-bright", 1.05)),
            b: cell(
                group(
                    t("Finding 02 · The office's new job", "label"),
                    t("Buildings became meeting rooms", "h2"),
                    t(
                        "When people come in, they come in to be together. The share of office time spent in scheduled collaboration jumped sharply, while solo desk work — the thing offices were built for — migrated home. The implication for real estate is stark: companies need less square footage but far more of it configured for groups.",
                        "body",
                    ),
                    chart("bar", "31, 44, 58, 67", 220),
                    t("Share of office hours spent in collaboration, 2023→2026", "caption"),
                ),
            ),
        }),
        section(
            "s8",
            "full",
            {
                a: cell(
                    group(
                        t("Finding 03 · The geography of talent", "label"),
                        quote(
                            "We stopped hiring from a forty-mile radius and started hiring from a forty-country one. Our best engineer last year lives three time zones from anyone she works with.",
                            "— Priya Raghunathan, VP of Engineering, interviewed for this report",
                        ),
                        t(
                            "Remote-capable employers now draw 41% of new hires from outside their headquarters metro — up from 12% in 2020. Talent is dispersing toward lower-cost cities and toward the lives people actually want, and the firms that embraced distributed hiring report the widest candidate pools and the shortest time-to-fill.",
                            "body",
                        ),
                    ),
                ),
            },
            { background: bgImage("world-map-talent-network-connections", 0.6) },
        ),
        section("s9", "full", {
            a: cell(
                group(
                    t("Finding 04 · The trade-offs, side by side", "label"),
                    t("No model wins on every axis", "h2"),
                    t(
                        "When we hold output, retention, mentorship, and cost up against each other, each working model trades one strength for another. Hybrid leads on retention and balance; fully-remote leads on cost and reach; in-office still leads on early-career mentorship. There is no free lunch — only an honest choice about what a team needs most.",
                        "body",
                    ),
                    table(
                        "Dimension,Fully in-office,Hybrid,Fully remote\nFocus-work output,Baseline,+11%,+14%\n12-month retention,81%,89%,84%\nEarly-career mentorship,Strong,Moderate,Weak\nReal-estate cost / head,$11.2k,$6.4k,$1.9k\nReported belonging,High,High,Moderate",
                    ),
                ),
            ),
        }),
        section("s10", "split-6040", {
            a: cell(
                callout(
                    "warn",
                    group(
                        t("Implications · The proximity gap", "label"),
                        t("Mentorship is the quiet casualty", "h3"),
                        t(
                            "The clearest warning in the data concerns people in their first three years of work. Junior staff in fully-remote roles reported 28% fewer informal coaching moments and were promoted, on average, four months later than in-office peers. Flexibility is a benefit the experienced enjoy and the inexperienced often pay for — unless mentorship is designed in on purpose.",
                            "body",
                        ),
                    ),
                ),
            ),
            b: cell(img("mentor-junior-colleague-pairing-desk", 0.85)),
        }),
        section(
            "s11",
            "full",
            {
                a: cell(
                    group(
                        t("Recommendations", "label"),
                        t("What deliberate distributed work looks like", "h2"),
                        t(
                            "The companies thriving in 2026 treat flexibility as an operating model to be designed, not a perk to be granted. Five practices separated the leaders from the strugglers in our data.",
                            "subtitle",
                        ),
                        bullets(
                            "Anchor days, not mandates — coordinate when teams overlap, don't police where they sit",
                            "Make the office a collaboration venue, then size and shape the space for that one job",
                            "Write decisions down by default so presence stops being a prerequisite for influence",
                            "Engineer mentorship explicitly — pair, sponsor, and review on a schedule, not by chance",
                            "Measure outcomes, never hours; retire any metric that rewards being seen",
                        ),
                        diagram(
                            "process",
                            "Set anchors, Document, Pair & sponsor, Measure outcomes",
                            200,
                        ),
                    ),
                ),
            },
            { background: bgImage("team-planning-whiteboard-session", 0.5) },
        ),
        section("s12", "full", {
            a: cell(
                group(
                    t(
                        "The office is no longer the workplace; it is one tool among several for doing work together. The organizations that say this out loud — and redesign around it — are quietly building the most resilient, far-reaching, and loyal teams we have measured in six years of this study.",
                        "subtitle",
                    ),
                ),
            ),
        }),
        section("s13", "split-6040", {
            a: cell(
                group(
                    t("About the research", "label"),
                    t("Northwind Institute for Work", "h3"),
                    t(
                        "The Northwind Institute is an independent research body studying how work is changing. The State of Remote Work is its longest-running annual study, first published in 2021. This edition was authored by Dr. Lena Halvorsen and the Future of Work team, with fieldwork by Halden Research Partners. Full datasets and methodology notes are available at northwind.org/remote-2026.",
                        "body",
                    ),
                    t(
                        "© 2026 Northwind Institute for Work · Oslo & Toronto · CC BY-NC 4.0",
                        "caption",
                    ),
                    button("Download the full dataset"),
                ),
            ),
            b: cell(img("research-institute-team-portrait", 0.82)),
        }),
    ],
    bgImage("remote-work-report-bg", 0.3),
);

// A market analysis — the global EV charging infrastructure sector, top to bottom.
export const marketAnalysis: ArtifactContent = doc(
    "blue",
    [
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("MARKET ANALYSIS · 2026 OUTLOOK", "label"),
                        t("Charging the Transition", "h1"),
                        t(
                            "The plug is the new pump. As electric vehicles cross from early adopters to the mainstream, the race to power them is becoming one of the decade's largest infrastructure build-outs — and one of its most contested markets.",
                            "subtitle",
                        ),
                        t(
                            "Meridian Research · Global EV Infrastructure Practice · June 2026",
                            "caption",
                        ),
                        badge("GLOBAL · PUBLIC + HOME CHARGING · 2026–2032 FORECAST"),
                    ),
                ),
            },
            { background: bgImage("ev-charging-station-night-blue-lights", 0.55) },
        ),
        section("s2", "full", {
            a: cell(
                group(
                    t("The market at a glance", "label"),
                    t("Three numbers that frame the sector", "h2"),
                    t(
                        "Before the segments and the players, start here: how big the market is, how fast it's growing, and how much hardware is already in the ground.",
                        "subtitle",
                    ),
                ),
            ),
        }),
        section("s3", "three-up", {
            a: cell(stat("$34.2B", "global EV charging market in 2025")),
            b: cell(stat("23.6%", "projected CAGR through 2032")),
            c: cell(stat("4.1M", "public charge points installed worldwide")),
        }),
        section("s4", "split-6040", {
            a: cell(
                group(
                    t("Market size & growth", "label"),
                    t("A market compounding above 20% a year", "h2"),
                    t(
                        "The EV charging market has grown roughly fourfold since 2021 and shows no sign of slowing. Vehicle parc is the engine: every new EV on the road creates years of downstream demand for energy, hardware, and services. On our base case the market reaches $148B by 2032, with the steepest gains in DC fast charging and managed home charging.",
                        "body",
                    ),
                    stat("$148B", "projected market size by 2032, base case"),
                ),
            ),
            b: cell(
                group(
                    chart("line", "9, 13, 19, 26, 34, 44, 56", 300),
                    t("Global market revenue, $B, 2021–2027E", "caption"),
                ),
            ),
        }),
        section("s5", "full", {
            a: cell(
                group(
                    t("Segments", "label"),
                    t("Where the dollars sit, and where they're moving", "h2"),
                    t(
                        "The market splits along charging speed and location. Level 2 AC charging dominates by unit volume — it's what sits in homes and workplaces — but ultra-fast DC is capturing revenue share fastest as highway corridors and fleets electrify. Home charging, long an afterthought, is becoming a managed-energy business in its own right.",
                        "body",
                    ),
                    table(
                        "Segment,2025 revenue,Share,2025–2032 CAGR\nLevel 2 AC (home),$11.6B,34%,21%\nLevel 2 AC (public/work),$7.2B,21%,18%\nDC fast (50–150kW),$8.1B,24%,26%\nUltra-fast (>150kW),$5.5B,16%,31%\nFleet & depot,$1.8B,5%,29%",
                    ),
                    chart("bar", "11.6, 7.2, 8.1, 5.5, 1.8", 240),
                    t("2025 revenue by segment, $B", "caption"),
                ),
            ),
        }),
        section("s6", "three-up", {
            a: cell(
                card(
                    img("ev-network-charging-hub-canopy", 1),
                    t("Voltline Networks", "h3"),
                    t(
                        "The volume leader in public Level 2, with ~190k connectors and a software platform others license.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("highway-fast-charging-corridor", 1),
                    t("AmpGrid", "h3"),
                    t(
                        "Pure-play ultra-fast operator betting on highway corridors and 350kW megawatt-ready sites.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("automaker-proprietary-charging-stalls", 1),
                    t("Hyperion (OEM)", "h3"),
                    t(
                        "An automaker's captive network now opening to other brands — distribution as a moat.",
                        "caption",
                    ),
                ),
            ),
        }),
        section("s7", "split-4060", {
            a: cell(img("ev-charging-operator-control-room", 1.05)),
            b: cell(
                group(
                    t("Competitive landscape", "label"),
                    t("Four ways players are trying to win", "h2"),
                    t(
                        "The field is crowded and consolidating at the same time. Differentiation is moving away from hardware — increasingly commoditized — and toward uptime, energy economics, and the driver experience.",
                        "body",
                    ),
                    bullets(
                        "Reliability — guaranteed uptime is becoming the headline SLA buyers pay for",
                        "Energy arbitrage — on-site batteries and smart load management protect margins",
                        "Network density — winning corridors and fleets before rivals plant hardware",
                        "Software & roaming — one app, one payment, every network is the experience play",
                    ),
                ),
            ),
        }),
        section(
            "s8",
            "full",
            {
                a: cell(
                    group(
                        t("Trends", "label"),
                        t("What's reshaping the next five years", "h2"),
                        t(
                            "Five forces are pulling the market forward and changing what a charging site is. The endpoint isn't a parking lot full of plugs — it's a distributed energy asset that happens to charge cars.",
                            "subtitle",
                        ),
                        diagram(
                            "process",
                            "Plug-and-charge, Megawatt charging, Battery-buffered sites, V2G pilots, Charging-as-a-service",
                            200,
                        ),
                    ),
                ),
            },
            { background: bgImage("solar-canopy-battery-charging-site", 0.5) },
        ),
        section("s9", "two-col", {
            a: cell(
                callout(
                    "success",
                    group(
                        t("Opportunities", "label"),
                        t("Where the upside concentrates", "h3"),
                        bullets(
                            "Fleet & depot electrification — sticky, high-utilization contracts",
                            "Reliability-as-a-product for networks battling a trust deficit",
                            "Software, payments, and roaming layers that ride on anyone's hardware",
                            "Behind-the-meter storage that turns volatile power prices into margin",
                        ),
                    ),
                ),
            ),
            b: cell(
                callout(
                    "caution",
                    group(
                        t("Risks", "label"),
                        t("What could stall the curve", "h3"),
                        bullets(
                            "Utilization risk — too many stalls chasing too few sessions early",
                            "Grid interconnection delays of 12–24 months in key metros",
                            "Subsidy dependence as public incentives taper after 2027",
                            "Standards fragmentation slowing the seamless-roaming promise",
                        ),
                    ),
                ),
            ),
        }),
        section(
            "s10",
            "full",
            {
                a: cell(
                    quote(
                        "The winners won't be whoever pours the most concrete. They'll be whoever keeps the most plugs working, at the lowest cost of energy, with the fewest taps to pay.",
                        "— Marcus Idowu, Partner, Meridian Research",
                    ),
                ),
            },
            { background: bgImage("ev-driver-charging-app-payment", 0.6) },
        ),
        section("s11", "split-6040", {
            a: cell(
                group(
                    t("Outlook", "label"),
                    t("Our base case: $148B and a flight to quality", "h2"),
                    t(
                        "We expect the market to keep compounding above 20% through 2032, but the easy growth phase is ending. As utilization matures, capital will reward operators with reliable hardware, smart energy stacks, and real network density — and punish those who built for subsidies rather than sessions. Expect consolidation to accelerate from 2027 as the long tail of sub-scale networks is acquired or shut.",
                        "body",
                    ),
                    stat("23.6%", "base-case CAGR, 2025–2032"),
                ),
            ),
            b: cell(img("ev-charging-future-cityscape-dusk", 0.9)),
        }),
        section("s12", "full", {
            a: cell(
                group(
                    t(
                        "Meridian Research is an independent technology and infrastructure research firm. This analysis draws on operator filings, our proprietary connector database, and 40 industry interviews. Full segment models and the bull/bear scenarios are available to subscribers at meridian.research/ev-2026.",
                        "caption",
                    ),
                ),
            ),
        }),
    ],
    bgImage("ev-market-report-bg", 0.3),
);
