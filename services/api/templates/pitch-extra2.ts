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
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// Company overview — Fernwood & Co., a Portland furniture & lighting studio.
export const companyOverview: ArtifactContent = deck(
    "couture",
    [
        // ── Cover ────────────────────────────────────────────────────────────
        section(
            "c1",
            "full",
            {
                a: cell(
                    group(
                        t("FERNWOOD & CO.", "eyebrow"),
                        t("Furniture made to outlast the trend that inspired it.", "display"),
                        t(
                            "We are a Portland design studio and workshop making contemporary furniture, lighting, and objects — drawn by hand, built by people, and meant to be handed down.",
                            "lead",
                        ),
                        badge("EST. 2012 · PORTLAND, OREGON"),
                    ),
                ),
            },
            { background: bgImage("fernwood-workshop-cover", 0.55) },
        ),

        // ── What we do ───────────────────────────────────────────────────────
        section("c2", "split-6040", {
            a: cell(
                group(
                    t("WHAT WE DO", "eyebrow"),
                    t(
                        "We design and build furniture for the spaces people actually live in.",
                        "h2",
                    ),
                    t(
                        "From a single dining table to the seating for a 200-room hotel, every Fernwood piece is designed in-house and made to order in our Southeast Portland workshop. No middlemen, no warehouse of the same chair — just considered work, built to last.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("fernwood-dining-table", 0.82)),
        }),

        // ── Our story ────────────────────────────────────────────────────────
        section("c3", "split-4060", {
            a: cell(img("fernwood-founders-bench", 1.05)),
            b: cell(
                group(
                    t("OUR STORY", "eyebrow"),
                    t("It started with one stubborn bench.", "h2"),
                    t(
                        "In 2012, Mara and Elias Fernwood couldn't find a bench that would survive their kids, so they built one. Friends asked for theirs. A decade later, that same joinery holds up every piece we ship — now from a 12,000-square-foot workshop and a team of thirty makers.",
                        "body",
                    ),
                ),
            ),
        }),

        // ── What we make ─────────────────────────────────────────────────────
        section("c4", "three-up", {
            a: cell(
                card(
                    img("fernwood-seating", 1.4),
                    t("Seating", "title"),
                    t(
                        "Chairs, benches, and sofas with frames that are screwed, not stapled — and reupholstered, not replaced.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("fernwood-tables", 1.4),
                    t("Tables & casegoods", "title"),
                    t(
                        "Dining tables, desks, and storage in solid oak, walnut, and ash, finished by hand.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("fernwood-lighting", 1.4),
                    t("Lighting", "title"),
                    t(
                        "Pendants, sconces, and floor lamps in turned wood, blown glass, and brushed brass.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Our craft (feature background) ───────────────────────────────────
        section(
            "c5",
            "full",
            {
                a: cell(
                    group(
                        t("OUR CRAFT", "eyebrow"),
                        t("Real materials, joined to last a generation.", "h2"),
                        t(
                            "We work only in FSC-certified hardwoods, water-based finishes, and solid brass hardware — nothing veneered, nothing disposable. Each joint is cut to fit, each surface sanded through nine grits, and each piece signed by the maker who built it.",
                            "body",
                        ),
                        button("Tour the workshop"),
                    ),
                ),
            },
            { background: bgImage("fernwood-craft-joinery", 0.6) },
        ),

        // ── Who we serve ─────────────────────────────────────────────────────
        section("c6", "split-6040", {
            a: cell(
                group(
                    t("WHO WE SERVE", "eyebrow"),
                    t("Trusted by the people who care how a room feels.", "h2"),
                    t(
                        "Half our work is bespoke commissions for interior designers and architects; the rest furnishes hotels, restaurants, and workplaces that want pieces no one else will have.",
                        "body",
                    ),
                    bullets(
                        "Interior designers & architects — a trade program with to-the-trade pricing",
                        "Hospitality — hotels, restaurants, and members' clubs",
                        "Workplace — studios and offices that have outgrown the catalog",
                        "Private clients — heirloom commissions, made to measure",
                    ),
                    t(
                        "Selected clients · The Hoxton · Roman and Williams · Studio McGee · Ace Hotel",
                        "caption",
                    ),
                ),
            ),
            b: cell(img("fernwood-hotel-lobby", 0.82)),
        }),

        // ── Testimonials ─────────────────────────────────────────────────────
        section("c7", "two-col", {
            a: cell(
                quote(
                    "Fernwood is the only shop I trust with a lobby. The pieces arrive better than the drawings, every time.",
                    "Dahlia Reyes · Principal, Reyes + Co. Interiors",
                ),
            ),
            b: cell(
                quote(
                    "Five years and forty covers a night, and our Fernwood chairs haven't loosened a single joint.",
                    "Marco Bélanger · Owner, Cafe Mistral",
                ),
            ),
        }),

        // ── By the numbers ───────────────────────────────────────────────────
        section("c8", "three-up", {
            a: cell(stat("8,400", "pieces built and shipped since 2012")),
            b: cell(stat("30", "makers, finishers, and designers on the bench")),
            c: cell(stat("25 yrs", "structural warranty on every frame")),
        }),

        // ── How we work ──────────────────────────────────────────────────────
        section("c9", "split-6040", {
            a: cell(
                group(
                    t("HOW WE WORK", "eyebrow"),
                    t("From sketch to your room in four steps.", "h2"),
                    t(
                        "Every commission moves through the same calm process — so you always know where your piece is and who is building it.",
                        "body",
                    ),
                    diagram(
                        "process",
                        "Design & quote, Hand-cut joinery, Finish & sign, White-glove delivery",
                        180,
                    ),
                ),
            ),
            b: cell(img("fernwood-finishing-bench", 0.9)),
        }),

        // ── The team ─────────────────────────────────────────────────────────
        section("c10", "three-up", {
            a: cell(
                group(
                    img("fernwood-team-mara", 1),
                    t("Mara Fernwood", "title"),
                    t("Founder & Creative Director", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("fernwood-team-elias", 1),
                    t("Elias Fernwood", "title"),
                    t("Founder & Head of Workshop", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("fernwood-team-jun", 1),
                    t("Jun Park", "title"),
                    t("Design Lead · ex-Heath Ceramics", "caption"),
                ),
            ),
        }),

        // ── Our values ───────────────────────────────────────────────────────
        section("c11", "split-4060", {
            a: cell(img("fernwood-values-detail", 1.05)),
            b: cell(
                group(
                    t("WHAT WE BELIEVE", "eyebrow"),
                    t("Make less. Make it last.", "h2"),
                    bullets(
                        "Repairable by design — we keep the parts and plans for everything we ship",
                        "Local first — we mill, build, and finish under one Portland roof",
                        "Fair work — a living wage and a real bench for every maker",
                        "Honest materials — solid wood and metal, or we don't use it",
                    ),
                    callout(
                        "success",
                        t(
                            "Carbon-measured since 2021 — every piece ships climate-neutral, and our offcuts heat the shop.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),

        // ── Get in touch (feature background) ─────────────────────────────────
        section(
            "c12",
            "full",
            {
                a: cell(
                    group(
                        t("GET IN TOUCH", "eyebrow"),
                        t("Let's build something that lasts.", "display"),
                        t(
                            "Visit the workshop, start a commission, or join the trade program. We'd love to make something for your space.",
                            "lead",
                        ),
                        button("hello@fernwoodco.com"),
                    ),
                ),
            },
            { background: bgImage("fernwood-showroom-light", 0.55) },
        ),
    ],
    bgImage("fernwood-ambient", 0.34),
);

// Go-to-market plan — Tidepool, demand planning & inventory for growing brands.
export const gtmPlan: ArtifactContent = deck(
    "swiss",
    [
        // ── Cover ────────────────────────────────────────────────────────────
        section(
            "g1",
            "full",
            {
                a: cell(
                    group(
                        t("TIDEPOOL · GO-TO-MARKET PLAN", "eyebrow"),
                        t("Launching the inventory brain for growing brands.", "display"),
                        t(
                            "Our plan to take Tidepool — demand planning and inventory for multi-channel retail — from private beta to 1,000 paying brands in twelve months.",
                            "lead",
                        ),
                        badge("GO-TO-MARKET PLAN · H2 2026"),
                    ),
                ),
            },
            { background: bgImage("tidepool-warehouse-cover", 0.55) },
        ),

        // ── The opportunity ──────────────────────────────────────────────────
        section("g2", "split-6040", {
            a: cell(
                group(
                    t("THE OPPORTUNITY", "eyebrow"),
                    t("Growing brands are flying blind on inventory.", "h2"),
                    t(
                        "Once a brand sells across a website, three marketplaces, and a few wholesale accounts, spreadsheets stop working — and stockouts and overstock quietly eat the margin. The tools that solve it are built for the enterprise and priced out of reach. That gap is ours.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("bar", "12, 19, 31, 48, 72, 104", 240),
                    t(
                        "US mid-market brands adopting inventory software, 2021–2026 (thousands)",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Target segments ──────────────────────────────────────────────────
        section("g3", "three-up", {
            a: cell(
                card(
                    img("tidepool-dtc-brand", 1.4),
                    t("DTC brands", "title"),
                    t(
                        "$2M–$30M online sellers on Shopify juggling Amazon, TikTok Shop, and their own site.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("tidepool-multi-location", 1.4),
                    t("Multi-location retail", "title"),
                    t(
                        "3–20 store chains that need one source of truth across the floor and the stockroom.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("tidepool-wholesale", 1.4),
                    t("Wholesale & distribution", "title"),
                    t(
                        "Brands shipping to stockists who need to promise dates they can actually keep.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Positioning (feature background) ─────────────────────────────────
        section(
            "g4",
            "full",
            {
                a: cell(
                    group(
                        t("POSITIONING", "eyebrow"),
                        t("The demand-planning brain built for brands, not the enterprise.", "h2"),
                        t(
                            "For operators at growing multi-channel brands who are tired of guessing, Tidepool is the inventory platform that forecasts demand, flags stockouts before they happen, and tells you exactly what to reorder — without an ERP project or a six-figure contract.",
                            "body",
                        ),
                        callout(
                            "info",
                            t(
                                "Where the big platforms need a consultant and six months, Tidepool is live in an afternoon and pays for itself the first time it prevents a stockout.",
                                "body",
                            ),
                        ),
                    ),
                ),
            },
            { background: bgImage("tidepool-positioning-shelves", 0.6) },
        ),

        // ── The funnel ───────────────────────────────────────────────────────
        section("g5", "split-4060", {
            a: cell(img("tidepool-funnel-dashboard", 1.05)),
            b: cell(
                group(
                    t("THE FUNNEL", "eyebrow"),
                    t("How a curious operator becomes a paying brand.", "h2"),
                    t(
                        "We earn trust at the top with genuinely useful content, convert with a free plan that solves a real problem, and expand as a brand connects more channels.",
                        "body",
                    ),
                    diagram(
                        "funnel",
                        "Discover via search & community, Free plan sign-up, Connect a channel, Convert to paid, Expand seats & SKUs",
                        220,
                    ),
                ),
            ),
        }),

        // ── Channels ─────────────────────────────────────────────────────────
        section("g6", "three-up", {
            a: cell(
                card(
                    img("tidepool-channel-content", 1.4),
                    t("Content & SEO", "title"),
                    t(
                        "Operator-grade guides on demand planning that rank for the problems brands Google at 11pm.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("tidepool-channel-partners", 1.4),
                    t("Platform partnerships", "title"),
                    t(
                        "A featured Shopify app and co-marketing with 3PLs and agencies who already have the trust.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("tidepool-channel-community", 1.4),
                    t("Community & events", "title"),
                    t(
                        "Founder dinners and an operators' Slack where our best customers sell the next ones.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Pricing & packaging ──────────────────────────────────────────────
        section("g7", "full", {
            a: cell(
                group(
                    t("PRICING & PACKAGING", "eyebrow"),
                    t("Priced to land self-serve and grow with the brand.", "h2"),
                    table(
                        "Plan,Price,Built for,Key limits\nFree,$0,Single-channel sellers,1 channel · 500 SKUs · 90-day forecast\nGrowth,$149 / mo,Multi-channel DTC,Unlimited channels · 5k SKUs · reorder alerts\nPro,$399 / mo,Scaling & wholesale,Demand planning · POs · 3 seats\nEnterprise,Custom,Multi-entity brands,SSO · API · onboarding & SLAs",
                    ),
                    t(
                        "Land on Free or Growth self-serve, convert to Pro as channels and SKUs grow, Enterprise for multi-entity brands.",
                        "caption",
                    ),
                ),
            ),
        }),

        // ── Launch timeline ──────────────────────────────────────────────────
        section("g8", "full", {
            a: cell(
                group(
                    t("LAUNCH TIMELINE", "eyebrow"),
                    t("Four phases from beta to GA.", "h2"),
                    diagram(
                        "process",
                        "Private beta · 40 brands, Open beta · pricing live, Public launch · Shopify feature, Scale · paid channels on",
                        180,
                    ),
                ),
            ),
        }),

        // ── Goals & KPIs ─────────────────────────────────────────────────────
        section("g9", "three-up", {
            a: cell(stat("1,000", "paying brands by Q2 '27")),
            b: cell(stat("$3.6M", "ARR target in the first year")),
            c: cell(stat("< 4 mo", "CAC payback, blended across channels")),
        }),

        // ── First 90 days & owners ───────────────────────────────────────────
        section("g10", "two-col", {
            a: cell(
                group(
                    t("FIRST 90 DAYS", "eyebrow"),
                    t("What we ship before launch.", "h2"),
                    bullets(
                        "Weeks 1–4 — Finalize Free/Growth packaging and the self-serve onboarding",
                        "Weeks 5–8 — Ship the Shopify app listing and three cornerstone guides",
                        "Weeks 9–12 — Open beta to the waitlist and stand up the operators' community",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("OWNERS", "eyebrow"),
                    t("Who's accountable", "title"),
                    table(
                        "Workstream,Owner\nProduct & onboarding,Priya Anand\nContent & SEO,Tomas Lindqvist\nPartnerships,Renee Okoro\nCommunity & events,Dario Vella",
                    ),
                ),
            ),
        }),

        // ── Next steps (feature background) ──────────────────────────────────
        section(
            "g11",
            "full",
            {
                a: cell(
                    group(
                        t("NEXT STEPS", "eyebrow"),
                        t("Greenlight the launch.", "display"),
                        t(
                            "Approve the plan and the H2 budget this week, and Tidepool ships to the waitlist on September 15.",
                            "lead",
                        ),
                        button("Approve & kick off"),
                    ),
                ),
            },
            { background: bgImage("tidepool-launch-horizon", 0.55) },
        ),
    ],
    bgImage("tidepool-ambient", 0.34),
);
