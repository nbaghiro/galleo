import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    button,
    callout,
    card,
    cell,
    diagram,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
    web,
} from "@model/authoring";

// An event / conference site for a believable design-and-technology festival.
export const eventPage: ArtifactContent = web(
    "vapor",
    [
        // 1 — Hero (bgImage cover): name, date, location, register CTA
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("Frequency 2026 · A design + technology festival", "label"),
                        t("Where design meets the machine.", "h1"),
                        t(
                            "Three days of talks, workshops, and after-dark sessions on the new craft of building with AI — October 15–17, 2026 · Lx Factory, Lisbon.",
                            "subtitle",
                        ),
                        button("Register now"),
                    ),
                ),
            },
            { background: bgImage("frequency-lisbon-stage-lights", 0.58) },
        ),
        // 2 — About (split layout with image)
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("What is Frequency", "label"),
                    t("The festival for people who make the future feel good to use.", "h2"),
                    t(
                        "Frequency is where 3,000 designers, engineers, and founders gather to figure out what comes next — and how to build it with taste. No keynote theatre, no vendor booths shouting over each other. Just the people quietly shaping the tools everyone else will use in three years, in one beautiful old factory by the river.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("frequency-crowd-warehouse-talk", 0.92)),
        }),
        // 3 — Why attend (three-up cards)
        section("s3", "three-up", {
            a: cell(
                card(
                    img("frequency-workshop-hands-on", 1),
                    t("Learn the new craft", "h3"),
                    t(
                        "Forty hands-on workshops on prompt design, agent UX, and shipping AI features people actually trust.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("frequency-hallway-conversation", 1),
                    t("Meet your next collaborators", "h3"),
                    t(
                        "Curated dinners, hallway tracks, and a matchmaking app that puts the right five people in a room together.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("frequency-demo-night-projector", 1),
                    t("See it before everyone else", "h3"),
                    t(
                        "First looks at unreleased tools, live demo nights, and research that won’t be public for another year.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 4 — Speakers intro (split with image + CTA)
        section("s4", "split-4060", {
            a: cell(img("frequency-speaker-on-stage-portrait", 1.05)),
            b: cell(
                group(
                    t("The lineup", "label"),
                    t("Sixty voices worth flying for.", "h2"),
                    t(
                        "Heads of design from the labs defining the field, the engineers behind the tools in your dock, and the independent makers whose side projects became everyone’s daily driver. Every talk is brand-new for Frequency — no recycled conference deck in the building.",
                        "body",
                    ),
                    button("See all speakers"),
                ),
            ),
        }),
        // 5 — Featured speakers (image grid)
        section("s5", "three-up", {
            a: cell(
                card(
                    img("frequency-speaker-maya-okonkwo", 1),
                    t("Maya Okonkwo", "h3"),
                    t("Head of Design · Northwind", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("frequency-speaker-diego-salas", 1),
                    t("Diego Salas", "h3"),
                    t("Creative Technologist · Studio Mono", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("frequency-speaker-aisha-rahman", 1),
                    t("Aisha Rahman", "h3"),
                    t("Founder · Halcyon Labs", "caption"),
                ),
            ),
        }),
        // 6 — Agenda (table)
        section("s6", "full", {
            a: cell(
                group(
                    t("The agenda", "label"),
                    t("Three days, three frequencies.", "h2"),
                    table(
                        "Day,Morning,Afternoon,Night\nThu · Foundations,Keynote + craft talks,Hands-on workshops,Opening party on the terrace\nFri · Frontiers,Agent UX deep dives,Research showcase,Live demo night\nSat · Futures,Design fireside chats,Build-your-own labs,Closing set + dinner",
                    ),
                ),
            ),
        }),
        // 7 — Tracks (process diagram)
        section("s7", "full", {
            a: cell(
                group(
                    t("How a day flows", "label"),
                    t("Arrive curious, leave building.", "h2"),
                    t(
                        "Every day moves the same way — a big idea in the morning, your hands on the keyboard by lunch, and something real to show by the time the lights come down.",
                        "body",
                    ),
                    diagram("process", "Big talk, Hands-on lab, Build, Demo + connect", 240),
                ),
            ),
        }),
        // 8 — Past-event highlights (stats on a feature background)
        section(
            "s8",
            "three-up",
            {
                a: cell(stat("3,200", "makers in the room last year")),
                b: cell(stat("96%", "said they’d come back")),
                c: cell(stat("48", "countries on the badge list")),
            },
            { background: bgImage("frequency-crowd-from-above-night", 0.55) },
        ),
        // 9 — Attendee voices (two quotes)
        section("s9", "two-col", {
            a: cell(
                quote(
                    "I came with a half-finished prototype and left with three collaborators and a launch date. Frequency is the only conference I expense without asking.",
                    "Priya Raman · Product Lead, Cedarworks",
                ),
            ),
            b: cell(
                quote(
                    "It’s the rare event where the hallway is better than the stage — and the stage was incredible.",
                    "Tom Becker · Founder, Haloway",
                ),
            ),
        }),
        // 10 — Tickets (table)
        section("s10", "full", {
            a: cell(
                group(
                    t("Tickets", "label"),
                    t("Pick your pass before they’re gone.", "h2"),
                    table(
                        "Pass,Includes,Workshops,Price\nDay Pass,One day of talks,Not included,€220\nFull Festival,All three days + party,Open seating,€540\nMaker Pass,All three days + reserved labs,Guaranteed seats,€780\nTeam (5+),Everything in Maker,Guaranteed seats,€650 / person",
                    ),
                ),
            ),
        }),
        // 11 — Venue & FAQ (two-col)
        section("s11", "two-col", {
            a: cell(
                group(
                    t("The venue", "label"),
                    t("A printworks turned playground.", "h2"),
                    t(
                        "Lx Factory is a reclaimed industrial block in Alcântara — exposed brick, river light, and a courtyard built for the conversations that happen between sessions. Lisbon airport is twenty minutes away, and partner hotels are a short tram ride down the hill.",
                        "body",
                    ),
                    img("frequency-lx-factory-courtyard", 1.5),
                ),
            ),
            b: cell(
                group(
                    t("Good to know", "label"),
                    t("Is lunch included?", "h3"),
                    t(
                        "Yes — every full-festival pass includes lunch, all-day coffee, and the opening-night party.",
                        "body",
                    ),
                    t("Can I get a refund?", "h3"),
                    t(
                        "Full refunds up to 30 days out, and you can transfer your pass to a colleague any time before the doors open.",
                        "body",
                    ),
                    callout(
                        "info",
                        t(
                            "Travelling from abroad? We’ll send a visa invitation letter within 48 hours of your purchase — just reply to your confirmation email.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        // 12 — Final CTA (bgImage)
        section(
            "s12",
            "full",
            {
                a: cell(
                    group(
                        t("Three days that change how you build", "label"),
                        t("Lisbon, October 2026. Save your seat.", "h2"),
                        t(
                            "Early-bird pricing ends August 1, and Maker Passes sold out in nine days last year. Don’t watch the recap — be in the room.",
                            "subtitle",
                        ),
                        button("Get your pass"),
                    ),
                ),
            },
            { background: bgImage("frequency-river-sunset-lisbon", 0.55) },
        ),
    ],
    bgImage("frequency-bg-grain", 0.32),
);

// A coming-soon / waitlist site for a believable upcoming focus app.
export const waitlistPage: ArtifactContent = web(
    "noir",
    [
        // 1 — Hero (bgImage cover): teaser + join the waitlist
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("Coming this fall", "label"),
                        t("Vanta", "h1"),
                        t(
                            "The workspace that disappears. One thing at a time, in perfect quiet — built to hold your attention instead of stealing it. We’re opening the first invites soon.",
                            "subtitle",
                        ),
                        button("Join the waitlist"),
                    ),
                ),
            },
            { background: bgImage("vanta-dark-desk-single-light", 0.62) },
        ),
        // 2 — The vision (split with image)
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("The idea", "label"),
                    t("Your tools should get out of the way.", "h2"),
                    t(
                        "Every app you own is fighting for your attention — notifications, tabs, the endless pull to check one more thing. Vanta does the opposite. It shows you the single piece of work in front of you and hides everything else until you’re done. No feeds, no badges, no noise. Just the quiet you forgot work could feel like.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("vanta-minimal-interface-dark", 0.92)),
        }),
        // 3 — A sneak peek (image showcase)
        section("s3", "full", {
            a: cell(
                group(
                    t("First look", "label"),
                    t("This is what nothing-in-your-way looks like.", "h2"),
                    img("vanta-app-fullscreen-focus-mode", 1.7),
                ),
            ),
        }),
        // 4 — What's coming (three-up cards)
        section("s4", "three-up", {
            a: cell(
                card(
                    img("vanta-feature-single-focus", 1),
                    t("One thing at a time", "h3"),
                    t(
                        "Pull a task into focus and the rest of the world dims. When you finish, the next thing rises on its own.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("vanta-feature-on-device", 1),
                    t("Private by design", "h3"),
                    t(
                        "Everything runs on your device. Your notes, your work, your patterns — none of it leaves the machine.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("vanta-feature-quiet-ai", 1),
                    t("A quiet assistant", "h3"),
                    t(
                        "An AI that drafts, summarizes, and clears the busywork — then steps back without asking for a thing.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 5 — A deeper look (split with image on a feature background)
        section(
            "s5",
            "split-4060",
            {
                a: cell(img("vanta-night-mode-typing", 1.05)),
                b: cell(
                    group(
                        t("Built for deep work", "label"),
                        badge("ON-DEVICE"),
                        t("It learns your rhythm, not your data.", "h2"),
                        t(
                            "Vanta notices when you do your best work and protects it — softening the world during your focus hours, surfacing the right task at the right moment, and leaving you completely alone when you’re in flow. All of it happens locally, on hardware you own.",
                            "body",
                        ),
                    ),
                ),
            },
            { background: bgImage("vanta-dark-gradient-glow", 0.5) },
        ),
        // 6 — Numbers waiting (stats on a feature background)
        section(
            "s6",
            "three-up",
            {
                a: cell(stat("31,400", "people already on the list")),
                b: cell(stat("74", "countries waiting")),
                c: cell(stat("Invite-only", "at launch this fall")),
            },
            { background: bgImage("vanta-dark-particles-field", 0.55) },
        ),
        // 7 — Roadmap (table)
        section("s7", "full", {
            a: cell(
                group(
                    t("The plan", "label"),
                    t("Here’s when it lands.", "h2"),
                    table(
                        "Phase,When,What\nPrivate beta,August 2026,First 1,000 invites from the waitlist\nOpen beta,October 2026,Invites roll out in weekly batches\nLaunch,December 2026,Public release on macOS + iOS\nNext,Early 2027,Windows and a team workspace",
                    ),
                ),
            ),
        }),
        // 8 — Founders' note (image + quote)
        section("s8", "split-4060", {
            a: cell(img("vanta-founders-studio-portrait", 1.05)),
            b: cell(
                quote(
                    "We built Vanta because we were tired of software that treats your attention as inventory to sell. This is the tool we wanted for ourselves — and the first thing in years that made our own work feel quiet again.",
                    "Eli Brandt & Nora Vance · Co-founders",
                ),
            ),
        }),
        // 9 — FAQ (two-col)
        section("s9", "two-col", {
            a: cell(
                group(
                    t("Before you ask", "label"),
                    t("When do I get in?", "h3"),
                    t(
                        "Invites go out in order, starting in August. Join now and you’ll move up the list every time a friend signs up with your link.",
                        "body",
                    ),
                    t("What will it cost?", "h3"),
                    t(
                        "There’s a generous free tier, and waitlist members get six months of Vanta Pro free at launch — no card required to reserve your spot.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("Which platforms?", "h3"),
                    t(
                        "macOS and iOS first, with Windows and a shared team workspace following in early 2027.",
                        "body",
                    ),
                    t("Is my work really private?", "h3"),
                    t(
                        "Yes. Vanta runs entirely on your device — there’s no cloud account to create and nothing of yours is ever uploaded or sold.",
                        "body",
                    ),
                ),
            ),
        }),
        // 10 — Final waitlist CTA (bgImage)
        section(
            "s10",
            "full",
            {
                a: cell(
                    group(
                        t("Be first through the door", "label"),
                        t("The quiet is almost ready.", "h2"),
                        t(
                            "Join 31,000 people waiting for a calmer way to work. We’ll only email you twice before launch — once with your invite, once to say it’s live.",
                            "subtitle",
                        ),
                        button("Join the waitlist"),
                    ),
                ),
            },
            { background: bgImage("vanta-dawn-window-calm", 0.58) },
        ),
    ],
    bgImage("vanta-bg-noir-texture", 0.34),
);
