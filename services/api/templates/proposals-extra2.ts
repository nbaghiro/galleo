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
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

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
                        t("HARBORLIGHT FESTIVAL 2026 · SPONSORSHIP PROSPECTUS", "eyebrow"),
                        t("Three days on the water. One unforgettable summer.", "display"),
                        t(
                            "Harborlight is Oakhaven’s flagship waterfront festival — three days of live music, regional food, and public art on the working piers. We’re inviting a small circle of partners to help us build the 2026 edition, and to reach the 65,000 people who’ll spend a long weekend with us.",
                            "lead",
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
                    t("THE PROPERTY", "eyebrow"),
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
                    t("OUR AUDIENCE", "eyebrow"),
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
                    t("REACH & ENGAGEMENT", "eyebrow"),
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
                        t("WHY PARTNER WITH US", "eyebrow"),
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
                    t("Branded lounges", "title"),
                    t(
                        "Shaded waterfront decks with seating, charging, and your brand as the host of the calm.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("harborlight-sampling-booth", 1.4),
                    t("Sampling & retail", "title"),
                    t(
                        "Hand product to 65,000 people in the exact moment they’re open to trying something new.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("harborlight-stage-naming", 1.4),
                    t("Stage & moment naming", "title"),
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
                    t("SPONSORSHIP TIERS", "eyebrow"),
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
                    t("WHAT SPONSORS GET", "eyebrow"),
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
                    t("PAST PARTNERS & RESULTS", "eyebrow"),
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
                    t("THE ASK", "eyebrow"),
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
                        t("STATEMENT OF WORK · SOW-2026-014", "eyebrow"),
                        t("Commerce Replatform & Returns Portal", "display"),
                        t(
                            "Prepared by Anvil & Oak Studio for Wexford Outdoor Co. This Statement of Work defines the scope, deliverables, timeline, and commercial terms for a twelve-week engagement to replatform wexfordoutdoor.com and ship a self-service returns experience.",
                            "lead",
                        ),
                        t(
                            "Effective: July 6, 2026 · Master Services Agreement dated March 2, 2026",
                            "byline",
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
                    t("1 · PROJECT OVERVIEW", "eyebrow"),
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
                    t("2 · OBJECTIVES", "eyebrow"),
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
                    t("AT A GLANCE", "eyebrow"),
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
                    t("3 · OUR APPROACH", "eyebrow"),
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
                    t("4 · SCOPE OF WORK", "eyebrow"),
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
                        t("5 · OUT OF SCOPE", "eyebrow"),
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
                    t("6 · DELIVERABLES", "eyebrow"),
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
                    t("7 · TIMELINE & MILESTONES", "eyebrow"),
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
                    t("8 · ROLES & RESPONSIBILITIES", "eyebrow"),
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
                    t("9 · PRICING & PAYMENT TERMS", "eyebrow"),
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
                    t("10 · ASSUMPTIONS & DEPENDENCIES", "eyebrow"),
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
                    t("11 · ACCEPTANCE", "eyebrow"),
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
