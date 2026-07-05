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

export const helios: ArtifactContent = doc(
    "stark",
    [
        // 01 — Cover
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("ANNUAL CLIMATE REPORT · 2026", "label"),
                        t("The Year in Degrees", "h1"),
                        t(
                            "The state of the global climate — one year measured in degrees, gigatonnes, and the distance still left to 1.5°C.",
                            "subtitle",
                        ),
                        t(
                            "Helios Climate Institute · Lead authors Dr. Amara Síle & Dr. Kenji Watanabe · Published June 2026",
                            "caption",
                        ),
                        badge("PEER-REVIEWED · 214 CONTRIBUTORS · 41 COUNTRIES"),
                    ),
                ),
            },
            { background: bgImage("helios-earth-from-space-blue-marble-night", 0.55) },
        ),

        // 02 — The year in one sentence
        section("s2", "full", {
            a: cell(
                group(
                    t("The year in one sentence", "label"),
                    t(
                        "2025 was the warmest year in the instrumental record — the first twelve months to breach 1.5°C above pre-industrial levels — and global emissions still climbed to a new high.",
                        "subtitle",
                    ),
                ),
            ),
        }),

        // 03 — Headline numbers
        section("s3", "three-up", {
            a: cell(stat("+1.49°C", "global mean temperature above the 1850–1900 baseline")),
            b: cell(stat("424.6 ppm", "atmospheric CO₂ — the highest in over 3 million years")),
            c: cell(stat("37.8 Gt", "fossil CO₂ emitted — a new record high")),
        }),

        // 04 — Executive summary
        section("s4", "split-6040", {
            a: cell(
                group(
                    t("Executive summary", "label"),
                    t("The hottest year on record — again", "h2"),
                    t(
                        "For the first time, the rolling twelve-month mean brushed the 1.5°C guardrail that 195 governments pledged in Paris to defend. The line held for a moment, then crossed.",
                        "subtitle",
                    ),
                    t(
                        "Emissions did not fall. They grew 0.9% to a record 37.8 gigatonnes of CO₂, even as the world added more clean-energy capacity than in any year before. The distance between what the atmosphere requires and what economies delivered is the subject of this report.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("helios-glacier-meltwater-stream", 0.82)),
        }),

        // 05 — Pull quote
        section("s5", "full", {
            a: cell(
                quote(
                    "We have not run out of time. We have run out of excuses for wasting it.",
                    "— Dr. Amara Síle, lead author",
                ),
            ),
        }),

        // 06 — Global temperature trend
        section("s6", "split-6040", {
            a: cell(
                group(
                    t("01 — The year in degrees", "label"),
                    t("Warming is accelerating", "h2"),
                    stat("+0.27°C", "warming per decade — up from 0.18°C in the 1990s"),
                    t(
                        "Nineteen of the twenty warmest years on record have occurred since 2005. The ocean, which absorbs more than 90% of the planet's excess heat, set a fresh record for the seventh consecutive year — banking energy that will surface as hotter seasons for decades to come.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "1.01, 1.10, 1.16, 1.24, 1.29, 1.34, 1.42, 1.49", 300),
                    t(
                        "Annual global temperature anomaly, °C above 1850–1900 · 2018–2025",
                        "caption",
                    ),
                ),
            ),
        }),

        // 07 — Temperature context
        section("s7", "three-up", {
            a: cell(
                stat("4.6 mm/yr", "rate of global sea-level rise — nearly double the 1990s pace"),
            ),
            b: cell(stat("−13.1%", "Arctic sea-ice extent, per decade")),
            c: cell(stat("+1.06°C", "ocean surface anomaly — warmest in the satellite record")),
        }),

        // 08 — Threshold crossed
        section("s8", "full", {
            a: cell(
                callout(
                    "warn",
                    t("The 1.5°C line was crossed", "h3"),
                    t(
                        "For the rolling twelve-month period ending February 2026, global temperature ran 1.52°C above pre-industrial levels — the first sustained breach of the Paris aspiration. A single year above 1.5°C is not yet a permanent one, but it narrows the remaining carbon budget to roughly 200 Gt CO₂ — about five years at today's rate of emission.",
                        "body",
                    ),
                ),
            ),
        }),

        // 09 — Emissions by sector
        section("s9", "full", {
            a: cell(
                group(
                    t("02 — Emissions by sector", "label"),
                    t("Where the carbon comes from", "h2"),
                    t(
                        "Power and heat remain the largest single source — and the fastest-growing in absolute terms. Buildings were the only sector to fall, as heat pumps and a milder northern winter cut fossil use in homes and offices.",
                        "body",
                    ),
                    table(
                        "Sector,2024 Gt,2025 Gt,Share,Δ YoY\nPower & heat,15.1,15.4,39.1%,+2.0%\nTransport,8.4,8.6,21.8%,+2.4%\nIndustry,6.4,6.5,16.5%,+1.6%\nAgriculture & land,5.8,5.9,15.0%,+1.7%\nBuildings,3.1,3.0,7.6%,−3.2%",
                    ),
                    chart("bar", "15.4, 8.6, 6.5, 5.9, 3.0", 260),
                    t("Sector emissions, Gt CO₂-equivalent · 2025", "caption"),
                ),
            ),
        }),

        // 10 — Emissions stats
        section("s10", "three-up", {
            a: cell(stat("+0.9%", "rise in fossil CO₂ — the slowest growth in a decade")),
            b: cell(stat("57%", "of global emissions from just three economies")),
            c: cell(stat("8.4 Gt", "absorbed by land and ocean sinks — and weakening")),
        }),

        // 11 — Regional breakdown (intro)
        section("s11", "split-4060", {
            a: cell(img("helios-world-night-lights-from-space", 1.1)),
            b: cell(
                group(
                    t("03 — Regional breakdown", "label"),
                    t("A divided ledger", "h2"),
                    t(
                        "Growth concentrated in fast-industrialising economies, while mature ones extended a slow decline. Asia-Pacific now accounts for more than half the global total; the European Union posted its lowest output since 1960, and the United States its lowest since 1990. Per head, the picture inverts — the highest-emitting citizens live where totals are already falling.",
                        "body",
                    ),
                ),
            ),
        }),

        // 12 — Regional ledger (table + pie)
        section("s12", "split-6040", {
            a: cell(
                group(
                    t("By region", "label"),
                    t("The 2025 ledger", "h2"),
                    table(
                        "Region,Emissions Gt,Share,Per-capita t,Δ YoY\nAsia-Pacific,19.4,51.3%,5.8,+2.1%\nNorth America,5.9,15.6%,13.4,−1.4%\nEurope,4.1,10.8%,5.5,−2.6%\nMiddle East,2.9,7.7%,9.1,+3.0%\nLatin America,2.0,5.3%,3.0,+0.8%\nAfrica,1.6,4.2%,1.1,+3.4%",
                    ),
                    t(
                        "International shipping and aviation account for the remaining ~5%.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("pie", "19.4, 5.9, 4.1, 2.9, 2.0, 1.6", 260),
                    t("Share of 2025 emissions by region · Gt CO₂", "caption"),
                ),
            ),
        }),

        // 13 — What's driving it
        section("s13", "split-6040", {
            a: cell(
                group(
                    t("04 — What's driving it", "label"),
                    t("Heat, demand, and a slow turn", "h2"),
                    t(
                        "A strong El Niño added roughly 0.1–0.2°C of transient warmth on top of the long-term trend, and a record-hot ocean released heat it had banked for years. Strip the El Niño away and the underlying, human-driven signal is unmistakable: the floor beneath global temperature keeps rising.",
                        "body",
                    ),
                    t(
                        "Demand is the other story. Electricity use grew 4.3% — the fastest in more than a decade — pulled up by cooling, data centres, and electrified transport. Clean power met most of that new demand, but not all of it, and coal filled the gap.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("helios-coal-plant-cooling-towers-steam", 0.85)),
        }),

        // 14 — Tipping points (intro)
        section("s14", "full", {
            a: cell(
                group(
                    t("05 — Tipping points", "label"),
                    t("Lines you don't want to cross", "h2"),
                    t(
                        "Some parts of the climate system do not respond gradually. Pushed past a threshold, they shift to a new state and stay there — on timescales no policy can reverse. Three are now close enough to watch by the year.",
                        "body",
                    ),
                ),
            ),
        }),

        // 15 — Tipping points (callouts)
        section("s15", "two-col", {
            a: cell(
                callout(
                    "caution",
                    t("Amazon rainforest", "h3"),
                    t(
                        "Parts of the eastern Amazon now release more carbon than they absorb. Sustained drought and clearing are nudging the basin toward a drier, savanna-like state that, once crossed, does not easily return.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                callout(
                    "warn",
                    t("West Antarctic ice", "h3"),
                    t(
                        "The grounding line of Thwaites Glacier retreated a further 1.2 km this year. Its eventual collapse alone would commit the world to roughly 65 cm of sea-level rise over the coming centuries.",
                        "body",
                    ),
                ),
            ),
        }),

        // 16 — What's working
        section("s16", "split-6040", {
            a: cell(
                group(
                    t("06 — What's working", "label"),
                    t("The transition is real — and uneven", "h2"),
                    bullets(
                        "Solar and wind supplied 30% of global electricity, overtaking coal for the first time",
                        "A record 740 GW of new renewable capacity came online — more than half of it in China",
                        "Grid-scale battery storage costs fell 24% year on year",
                        "Electric vehicles reached 24% of new car sales worldwide",
                    ),
                    callout(
                        "success",
                        t(
                            "Per-capita emissions fell in 38 countries representing 41% of global GDP — decoupling growth from carbon at scale, for the first time.",
                            "body",
                        ),
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "11, 12, 14, 16, 19, 22, 26, 30", 280),
                    t("Wind & solar share of global electricity, % · 2018–2025", "caption"),
                ),
            ),
        }),

        // 17 — Projections
        section("s17", "split-6040", {
            a: cell(
                group(
                    t("07 — Three paths to 2035", "label"),
                    t("The decade that decides it", "h2"),
                    t(
                        "Under today's stated policies, emissions plateau near 38 Gt and bend down only after 2028 — a trajectory consistent with about 2.6°C of warming by 2100. The pledged-policy path falls faster. The 1.5°C path demands a 43% cut by 2030 — roughly 7% every year, beginning now.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "37.8, 38.0, 37.7, 36.9, 35.4, 33.1, 30.0", 280),
                    t("Emissions under stated policies, Gt CO₂ · 2025–2031", "caption"),
                ),
            ),
        }),

        // 18 — What must happen next
        section("s18", "full", {
            a: cell(
                group(
                    t("08 — What must happen next", "label"),
                    t("From pledges to delivered tonnes", "h2"),
                    t(
                        "The gap between climate ambition and climate reality is not, at root, a gap of technology or even of money. It is a gap of delivery — the long attrition from a stated pledge to a tonne that never reaches the air.",
                        "body",
                    ),
                    diagram(
                        "funnel",
                        "Stated pledges, Financed projects, Permitted capacity, Delivered abatement",
                        200,
                    ),
                    bullets(
                        "1 · Triple grid-scale storage to absorb the renewables already built",
                        "2 · Cut transmission permitting from years to months",
                        "3 · Price methane leakage and retire the dirtiest 5% of coal first",
                        "4 · Redirect $1.3T in fossil-fuel subsidies toward clean capacity",
                        "5 · Fund adaptation across the 40 most-exposed economies",
                    ),
                ),
            ),
        }),

        // 19 — Methodology & sources
        section("s19", "split-6040", {
            a: cell(
                group(
                    t("09 — Methodology", "label"),
                    t("How these numbers were built", "h2"),
                    t(
                        "Temperature anomalies blend six independent surface and satellite records, homogenised to the 1850–1900 baseline. Emissions estimates combine national inventories, fuel-trade statistics, and atmospheric-inversion modelling, reconciled to within ±0.7 Gt. Every figure in this report is traceable to a published dataset.",
                        "body",
                    ),
                    t(
                        "Sources: World Meteorological Organization · Global Carbon Project · International Energy Agency · NASA GISS · Copernicus Climate Change Service · 194 national reporting bodies. Datasets and code released open under CC-BY 4.0.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Sources & uncertainty", "h3"),
                    bullets(
                        "6 independent surface & satellite temperature records",
                        "194 national greenhouse-gas inventories",
                        "Atmospheric inversions from 11 monitoring networks",
                        "Annual totals reconciled to within ±0.7 Gt CO₂",
                    ),
                ),
            ),
        }),

        // 20 — Closing call to action
        section(
            "s20",
            "full",
            {
                a: cell(
                    group(
                        t("The work continues", "label"),
                        t("The next degree is still ours to decide.", "h1"),
                        t(
                            "Every tonne avoided buys time. Every fraction of a degree spared is counted in harvests kept, coastlines held, and lives not displaced. The data is open. The decade is now.",
                            "subtitle",
                        ),
                        button("Explore the full dataset →"),
                        t(
                            "Helios Climate Institute · Dr. Amara Síle & Dr. Kenji Watanabe · helios.report · June 2026",
                            "caption",
                        ),
                    ),
                ),
            },
            { background: bgImage("helios-sunrise-over-ocean-horizon-hope", 0.55) },
        ),
    ],
    bgImage("helios-report-bg", 0.32),
);
