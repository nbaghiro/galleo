import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    chart,
    diagram,
    group,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    web,
    divider,
    doc,
} from "@model/authoring";

export const productLaunch: ArtifactContent = web(
    "botanic",
    [
        section(
            "s1",
            group(
                t("Introducing Aer One", "label"),
                t("The air you forgot you were breathing.", "h1"),
                t(
                    "A whisper-quiet purifier that reads your room and clears it in minutes — no app to babysit, no filters you’ll forget to change.",
                    "subtitle",
                ),
                button("Pre-order — $249"),
            ),
            { background: bgImage("aer-hero-living-room", 0.58) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("The problem", "label"),
                    t("Indoor air is the pollution nobody talks about.", "h2"),
                    t(
                        "We spend 90% of our lives indoors, where the air can be up to five times more polluted than the street outside — cooking smoke, off-gassing furniture, pollen, pet dander, and the fine particles that slip past every cheap filter. Most purifiers either roar like a jet or quietly do nothing at all.",
                        "body",
                    ),
                ),
                img("aer-dust-particles-light", 0.92),
            ),
        ),
        section(
            "s3",
            row(
                stat("99.97%", "of particles down to 0.1 microns captured"),
                stat("12 min", "to clear a 400 sq ft room"),
                stat("21 dB", "quieter than a library at night"),
            ),
            { background: bgImage("aer-clean-air-gradient", 0.5) },
        ),
        section(
            "s4",
            split(
                40,
                img("aer-device-on-floor", 1.05),
                group(
                    t("Meet Aer One", "label"),
                    t("Engineered to disappear into your home.", "h2"),
                    t(
                        "A single seamless aluminum shell, a fabric crown spun from recycled PET, and a glow ring that fades from amber to white as your air gets cleaner. It’s the first purifier we’ve made that people leave out on purpose.",
                        "body",
                    ),
                    button("Take the tour"),
                ),
            ),
        ),
        section(
            "s5",
            split(
                60,
                group(
                    t("Intelligence", "label"),
                    badge("ON-DEVICE"),
                    t("It senses, then it acts.", "h2"),
                    t(
                        "Four laser sensors sample the room sixty times a second. When you sear a steak or the pollen count spikes, Aer One spins up before you’d ever notice — then settles back to a hush the moment the air is clear. All of it runs on the device. Nothing leaves your home.",
                        "body",
                    ),
                ),
                img("aer-sensor-closeup", 0.92),
            ),
        ),
        section(
            "s6",
            group(
                t("How it works", "label"),
                t("Four stages, one breath.", "h2"),
                t(
                    "Air is pulled in from every direction, stripped of particles and gases, and returned cooler and cleaner than it came — a full pass every ninety seconds.",
                    "body",
                ),
                diagram("process", "Draw in, Pre-filter, HEPA + carbon, Return clean", 240),
            ),
        ),
        section(
            "s7",
            row(
                card(
                    img("aer-filter-cartridge", 1),
                    t("One-click filter", "h3"),
                    t(
                        "A magnetic cartridge swaps in five seconds — and the device tells you the exact day it’s due.",
                        "caption",
                    ),
                ),
                card(
                    img("aer-quiet-bedroom-night", 1),
                    t("Sleep mode", "h3"),
                    t(
                        "The glow ring dims to nothing and the fan drops below a whisper, so it works while you don’t hear it.",
                        "caption",
                    ),
                ),
                card(
                    img("aer-solar-panel-eco", 1),
                    t("Built to last", "h3"),
                    t(
                        "Repairable by design, a five-year warranty, and a shell spun from 100% recycled aluminum.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s8",
            split(
                60,
                quote(
                    "I stopped waking up congested within a week. I didn’t expect to feel the difference — but the whole house notices when it’s off.",
                    "Dr. Lena Osei · Pulmonologist & early tester",
                ),
                group(
                    stat("4.9★", "average across 2,300 beta reviews"),
                    stat("96%", "would replace their old purifier"),
                ),
            ),
            { background: bgImage("aer-soft-home-window", 0.55) },
        ),
        section(
            "s9",
            split(
                40,
                group(
                    t("Measured, not marketed", "label"),
                    t("From hazy to clear in twelve minutes.", "h2"),
                    t(
                        "Particulate count (PM2.5) in a sealed 400 sq ft room after a stovetop sear, sampled every two minutes. Lower is cleaner.",
                        "body",
                    ),
                ),
                chart("line", "182, 168, 121, 74, 41, 18, 9, 4", 240),
            ),
        ),
        section(
            "s10",
            group(
                t("Pricing", "label"),
                t("One device, three ways to live with it.", "h2"),
                table(
                    "Model,Coverage,Filter,Price\nAer One,Up to 400 sq ft,12-month HEPA + carbon,$249\nAer One Plus,Up to 650 sq ft,18-month HEPA + carbon,$329\nAer Care,Any model,Auto-shipped filters + warranty,$6/mo",
                ),
            ),
        ),
        section(
            "s11",
            row(
                group(
                    t("Frequently asked", "label"),
                    t("The honest answers.", "h2"),
                    bullets(
                        "Yes — it’s true HEPA, independently certified, not “HEPA-type”.",
                        "Filters last a full year and ship to you the week they’re due.",
                        "No subscription required; Aer Care is entirely optional.",
                    ),
                ),
                callout(
                    "info",
                    t(
                        "Ships free across North America in 2–4 days. Try it for 60 nights — if your air doesn’t feel different, send it back and we’ll refund every cent, return shipping included.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s12",
            group(
                t("Breathe better, starting now", "label"),
                t("Your first clear breath ships in March.", "h2"),
                t(
                    "Reserve yours today with a fully refundable $25 deposit and lock in launch pricing before it goes up.",
                    "subtitle",
                ),
                button("Pre-order Aer One"),
            ),
            { background: bgImage("aer-final-cta-sky", 0.55) },
        ),
    ],
    bgImage("aer-bg-texture", 0.32),
);

export const landingPage: ArtifactContent = web(
    "sunrise",
    [
        section(
            "s1",
            split(
                60,
                group(
                    t("Northwind Analytics", "label"),
                    t("Your metrics, finally in one place.", "h1"),
                    t(
                        "Connect every tool your team already uses and watch a single, trustworthy dashboard build itself — no SQL, no data team, no waiting on a Monday report.",
                        "subtitle",
                    ),
                    button("Start free — no card"),
                ),
                img("northwind-dashboard-hero", 0.95),
            ),
            { background: bgImage("northwind-hero-workspace", 0.52) },
        ),
        section(
            "s2",
            row(
                stat("8,400+", "teams shipping with Northwind"),
                stat("42M", "events processed every day"),
                stat("99.99%", "uptime over the last 12 months"),
            ),
        ),
        section(
            "s3",
            group(
                t("Trusted by fast-moving teams", "caption"),
                t("Lumen · Cedarworks · Haloway · Norrøn · Bellweather · Patchwork", "h3"),
            ),
        ),
        section(
            "s4",
            row(
                card(
                    img("northwind-connect-sources", 1),
                    t("Connect in minutes", "h3"),
                    t(
                        "Forty native integrations — Stripe, Postgres, HubSpot, GA4 and more — live the moment you click connect.",
                        "caption",
                    ),
                ),
                card(
                    img("northwind-ask-question", 1),
                    t("Ask in plain English", "h3"),
                    t(
                        "Type “revenue by plan last quarter” and get a chart you can trust — and edit — in seconds.",
                        "caption",
                    ),
                ),
                card(
                    img("northwind-team-share", 1),
                    t("Share without friction", "h3"),
                    t(
                        "Dashboards, alerts, and weekly digests land where your team already works — Slack, email, or the wall TV.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            split(
                40,
                img("northwind-live-metrics-screen", 1.05),
                group(
                    t("Live, not stale", "label"),
                    badge("REAL-TIME"),
                    t("Numbers that move when your business does.", "h2"),
                    t(
                        "Northwind streams your data instead of batching it overnight, so the figure on the screen is the figure right now. Set a threshold once and we’ll ping you the instant signups dip or churn spikes — long before it shows up in a monthly review.",
                        "body",
                    ),
                    button("See it live"),
                ),
            ),
            { background: bgImage("northwind-feature-glow", 0.5) },
        ),
        section(
            "s6",
            split(
                60,
                group(
                    t("Why teams switch", "label"),
                    t("Less time wrangling, more time deciding.", "h2"),
                    t(
                        "Average hours per week our customers spend building reports, before Northwind and after their first month.",
                        "body",
                    ),
                ),
                chart("bar", "11, 9, 4, 2, 1", 240),
            ),
        ),
        section(
            "s7",
            row(
                quote(
                    "We replaced a $90k BI contract and two spreadsheets with Northwind in an afternoon. Our whole company reads the same numbers now.",
                    "Priya Raman · VP Growth, Cedarworks",
                ),
                quote(
                    "I’m not technical, and I built our exec dashboard myself on day one. That has never once been true of an analytics tool.",
                    "Tom Becker · Founder, Haloway",
                ),
            ),
        ),
        section(
            "s8",
            group(
                t("Pricing", "label"),
                t("Start free. Grow when you’re ready.", "h2"),
                table(
                    "Plan,Best for,Data sources,Price\nFree,Side projects,3 sources,$0\nTeam,Growing startups,15 sources,$49/mo\nBusiness,Scaling companies,Unlimited,$199/mo\nEnterprise,Custom needs,Unlimited + SSO,Let’s talk",
                ),
            ),
        ),
        section(
            "s9",
            row(
                group(
                    t("Questions, answered", "label"),
                    t("Everything before you sign up.", "h2"),
                    bullets(
                        "Free forever for three sources — no trial clock, no card.",
                        "SOC 2 Type II certified; your data is encrypted in transit and at rest.",
                        "Cancel or export everything in one click, any time.",
                    ),
                ),
                group(
                    callout(
                        "tip",
                        t(
                            "Most teams have their first live dashboard within ten minutes of signing up — and our team will migrate your old reports for free.",
                            "body",
                        ),
                    ),
                    button("Create your free workspace"),
                ),
            ),
        ),
    ],
    bgImage("northwind-bg-texture", 0.3),
);

export const eventPage: ArtifactContent = web(
    "vapor",
    [
        section(
            "s1",
            group(
                t("Frequency 2026 · A design + technology festival", "label"),
                t("Where design meets the machine.", "h1"),
                t(
                    "Three days of talks, workshops, and after-dark sessions on the new craft of building with AI — October 15–17, 2026 · Lx Factory, Lisbon.",
                    "subtitle",
                ),
                button("Register now"),
            ),
            { background: bgImage("frequency-lisbon-stage-lights", 0.58) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("What is Frequency", "label"),
                    t("The festival for people who make the future feel good to use.", "h2"),
                    t(
                        "Frequency is where 3,000 designers, engineers, and founders gather to figure out what comes next — and how to build it with taste. No keynote theatre, no vendor booths shouting over each other. Just the people quietly shaping the tools everyone else will use in three years, in one beautiful old factory by the river.",
                        "body",
                    ),
                ),
                img("frequency-crowd-warehouse-talk", 0.92),
            ),
        ),
        section(
            "s3",
            row(
                card(
                    img("frequency-workshop-hands-on", 1),
                    t("Learn the new craft", "h3"),
                    t(
                        "Forty hands-on workshops on prompt design, agent UX, and shipping AI features people actually trust.",
                        "caption",
                    ),
                ),
                card(
                    img("frequency-hallway-conversation", 1),
                    t("Meet your next collaborators", "h3"),
                    t(
                        "Curated dinners, hallway tracks, and a matchmaking app that puts the right five people in a room together.",
                        "caption",
                    ),
                ),
                card(
                    img("frequency-demo-night-projector", 1),
                    t("See it before everyone else", "h3"),
                    t(
                        "First looks at unreleased tools, live demo nights, and research that won’t be public for another year.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s4",
            split(
                40,
                img("frequency-speaker-on-stage-portrait", 1.05),
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
        ),
        section(
            "s5",
            row(
                card(
                    img("frequency-speaker-maya-okonkwo", 1),
                    t("Maya Okonkwo", "h3"),
                    t("Head of Design · Northwind", "caption"),
                ),
                card(
                    img("frequency-speaker-diego-salas", 1),
                    t("Diego Salas", "h3"),
                    t("Creative Technologist · Studio Mono", "caption"),
                ),
                card(
                    img("frequency-speaker-aisha-rahman", 1),
                    t("Aisha Rahman", "h3"),
                    t("Founder · Halcyon Labs", "caption"),
                ),
            ),
        ),
        section(
            "s6",
            group(
                t("The agenda", "label"),
                t("Three days, three frequencies.", "h2"),
                table(
                    "Day,Morning,Afternoon,Night\nThu · Foundations,Keynote + craft talks,Hands-on workshops,Opening party on the terrace\nFri · Frontiers,Agent UX deep dives,Research showcase,Live demo night\nSat · Futures,Design fireside chats,Build-your-own labs,Closing set + dinner",
                ),
            ),
        ),
        section(
            "s7",
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
        section(
            "s8",
            row(
                stat("3,200", "makers in the room last year"),
                stat("96%", "said they’d come back"),
                stat("48", "countries on the badge list"),
            ),
            { background: bgImage("frequency-crowd-from-above-night", 0.55) },
        ),
        section(
            "s9",
            row(
                quote(
                    "I came with a half-finished prototype and left with three collaborators and a launch date. Frequency is the only conference I expense without asking.",
                    "Priya Raman · Product Lead, Cedarworks",
                ),
                quote(
                    "It’s the rare event where the hallway is better than the stage — and the stage was incredible.",
                    "Tom Becker · Founder, Haloway",
                ),
            ),
        ),
        section(
            "s10",
            group(
                t("Tickets", "label"),
                t("Pick your pass before they’re gone.", "h2"),
                table(
                    "Pass,Includes,Workshops,Price\nDay Pass,One day of talks,Not included,€220\nFull Festival,All three days + party,Open seating,€540\nMaker Pass,All three days + reserved labs,Guaranteed seats,€780\nTeam (5+),Everything in Maker,Guaranteed seats,€650 / person",
                ),
            ),
        ),
        section(
            "s11",
            row(
                group(
                    t("The venue", "label"),
                    t("A printworks turned playground.", "h2"),
                    t(
                        "Lx Factory is a reclaimed industrial block in Alcântara — exposed brick, river light, and a courtyard built for the conversations that happen between sessions. Lisbon airport is twenty minutes away, and partner hotels are a short tram ride down the hill.",
                        "body",
                    ),
                    img("frequency-lx-factory-courtyard", 1.5),
                ),
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
        ),
        section(
            "s12",
            group(
                t("Three days that change how you build", "label"),
                t("Lisbon, October 2026. Save your seat.", "h2"),
                t(
                    "Early-bird pricing ends August 1, and Maker Passes sold out in nine days last year. Don’t watch the recap — be in the room.",
                    "subtitle",
                ),
                button("Get your pass"),
            ),
            { background: bgImage("frequency-river-sunset-lisbon", 0.55) },
        ),
    ],
    bgImage("frequency-bg-grain", 0.32),
);

export const waitlistPage: ArtifactContent = web(
    "noir",
    [
        section(
            "s1",
            group(
                t("Coming this fall", "label"),
                t("Vanta", "h1"),
                t(
                    "The workspace that disappears. One thing at a time, in perfect quiet — built to hold your attention instead of stealing it. We’re opening the first invites soon.",
                    "subtitle",
                ),
                button("Join the waitlist"),
            ),
            { background: bgImage("vanta-dark-desk-single-light", 0.62) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("The idea", "label"),
                    t("Your tools should get out of the way.", "h2"),
                    t(
                        "Every app you own is fighting for your attention — notifications, tabs, the endless pull to check one more thing. Vanta does the opposite. It shows you the single piece of work in front of you and hides everything else until you’re done. No feeds, no badges, no noise. Just the quiet you forgot work could feel like.",
                        "body",
                    ),
                ),
                img("vanta-minimal-interface-dark", 0.92),
            ),
        ),
        section(
            "s3",
            group(
                t("First look", "label"),
                t("This is what nothing-in-your-way looks like.", "h2"),
                img("vanta-app-fullscreen-focus-mode", 1.7),
            ),
        ),
        section(
            "s4",
            row(
                card(
                    img("vanta-feature-single-focus", 1),
                    t("One thing at a time", "h3"),
                    t(
                        "Pull a task into focus and the rest of the world dims. When you finish, the next thing rises on its own.",
                        "caption",
                    ),
                ),
                card(
                    img("vanta-feature-on-device", 1),
                    t("Private by design", "h3"),
                    t(
                        "Everything runs on your device. Your notes, your work, your patterns — none of it leaves the machine.",
                        "caption",
                    ),
                ),
                card(
                    img("vanta-feature-quiet-ai", 1),
                    t("A quiet assistant", "h3"),
                    t(
                        "An AI that drafts, summarizes, and clears the busywork — then steps back without asking for a thing.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            split(
                40,
                img("vanta-night-mode-typing", 1.05),
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
            { background: bgImage("vanta-dark-gradient-glow", 0.5) },
        ),
        section(
            "s6",
            row(
                stat("31,400", "people already on the list"),
                stat("74", "countries waiting"),
                stat("Invite-only", "at launch this fall"),
            ),
            { background: bgImage("vanta-dark-particles-field", 0.55) },
        ),
        section(
            "s7",
            group(
                t("The plan", "label"),
                t("Here’s when it lands.", "h2"),
                table(
                    "Phase,When,What\nPrivate beta,August 2026,First 1,000 invites from the waitlist\nOpen beta,October 2026,Invites roll out in weekly batches\nLaunch,December 2026,Public release on macOS + iOS\nNext,Early 2027,Windows and a team workspace",
                ),
            ),
        ),
        section(
            "s8",
            split(
                40,
                img("vanta-founders-studio-portrait", 1.05),
                quote(
                    "We built Vanta because we were tired of software that treats your attention as inventory to sell. This is the tool we wanted for ourselves — and the first thing in years that made our own work feel quiet again.",
                    "Eli Brandt & Nora Vance · Co-founders",
                ),
            ),
        ),
        section(
            "s9",
            row(
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
        ),
        section(
            "s10",
            group(
                t("Be first through the door", "label"),
                t("The quiet is almost ready.", "h2"),
                t(
                    "Join 31,000 people waiting for a calmer way to work. We’ll only email you twice before launch — once with your invite, once to say it’s live.",
                    "subtitle",
                ),
                button("Join the waitlist"),
            ),
            { background: bgImage("vanta-dawn-window-calm", 0.58) },
        ),
    ],
    bgImage("vanta-bg-noir-texture", 0.34),
);

export const agencySite: ArtifactContent = web(
    "carbon",
    [
        section(
            "s1",
            group(
                t("Counterform · Brand & digital studio", "label"),
                badge("EST. 2015 · LISBON & NEW YORK"),
                t("We design brands that know how to behave.", "h1"),
                t(
                    "A small studio for ambitious companies. We build identities, products, and the systems that hold them together — so the work still looks like itself on the fortieth screen, not just the first.",
                    "subtitle",
                ),
                button("Start a project"),
            ),
            { background: bgImage("counterform-studio-wall-pinups-mono", 0.58) },
        ),
        section(
            "s2",
            row(
                card(
                    img("counterform-service-brand-identity", 1.6),
                    t("Brand", "h3"),
                    t(
                        "Naming, identity, voice, and the guidelines that keep it all honest as you grow.",
                        "caption",
                    ),
                ),
                card(
                    img("counterform-service-digital-product", 1.6),
                    t("Digital", "h3"),
                    t(
                        "Websites and product interfaces — designed and built, from the first sketch to shipped code.",
                        "caption",
                    ),
                ),
                card(
                    img("counterform-service-design-system", 1.6),
                    t("Systems", "h3"),
                    t(
                        "Design systems, motion, and the components that let your team move fast without us in the room.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s3",
            group(
                t("Selected work", "label"),
                t("A few things we’re proud of.", "h2"),
                t(
                    "Eleven years, a hundred-odd launches, and a stubborn belief that the details are the work. A small selection below — the rest lives in the deck we’ll send once we’ve talked.",
                    "body",
                ),
            ),
        ),
        section(
            "s4",
            row(
                card(
                    img("counterform-work-meridian-bank-brand", 1.4),
                    t("Meridian", "h3"),
                    t("Brand & app for a challenger bank · 2025", "caption"),
                ),
                card(
                    img("counterform-work-orchard-grocery-identity", 1.4),
                    t("Orchard", "h3"),
                    t("Identity & packaging for a grocery startup · 2024", "caption"),
                ),
                card(
                    img("counterform-work-atlas-analytics-product", 1.4),
                    t("Atlas", "h3"),
                    t("Product design for an analytics platform · 2024", "caption"),
                ),
            ),
        ),
        section(
            "s5",
            row(
                card(
                    img("counterform-work-novel-press-rebrand", 1.6),
                    t("Novel Press", "h3"),
                    t("Full rebrand & site for an independent publisher · 2023", "caption"),
                ),
                card(
                    img("counterform-work-tidal-energy-campaign", 1.6),
                    t("Tidal", "h3"),
                    t("Campaign & motion system for a clean-energy launch · 2023", "caption"),
                ),
            ),
        ),
        section(
            "s6",
            group(
                t("Our approach", "label"),
                t("Four phases, no surprises.", "h2"),
                t(
                    "Every engagement runs the same clear arc, whether it’s a six-week sprint or a year-long build. You always know what we’re working on, why it matters, and what lands next.",
                    "body",
                ),
                diagram("process", "Discover, Define, Design, Build"),
                callout(
                    "note",
                    t(
                        "Most projects run 8–14 weeks. We take on six clients a year, on purpose — so yours is never the one we’re squeezing in.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            group(
                t("Clients", "label"),
                t("In good company.", "h2"),
                t(
                    "Meridian · Orchard · Atlas · Novel Press · Tidal · Halcyon · Cedarworks · Field Day · Northwind · Bright Coast · Mara Health · Postscript",
                    "subtitle",
                ),
                t(
                    "From two-person seed startups to public companies rebuilding from the logo out — the constant is people who care how the thing actually works.",
                    "caption",
                ),
            ),
        ),
        section(
            "s8",
            row(
                stat("120+", "brands and products shipped"),
                stat("11 yrs", "designing in the open"),
                stat("6", "clients a year, on purpose"),
            ),
            { background: bgImage("counterform-studio-shelves-archive", 0.55) },
        ),
        section(
            "s9",
            quote(
                "Counterform didn’t hand us a logo and leave. They gave us a way of making decisions — a year on, we still design like they’re in the room.",
                "Dana Okoro · VP Brand, Meridian",
            ),
            { background: bgImage("counterform-meeting-table-warm-light", 0.6) },
        ),
        section(
            "s10",
            row(
                card(
                    img("counterform-team-sofia-marques", 1),
                    t("Sofia Marques", "h3"),
                    t("Founder & Creative Director", "caption"),
                ),
                card(
                    img("counterform-team-ravi-anand", 1),
                    t("Ravi Anand", "h3"),
                    t("Design Director", "caption"),
                ),
                card(
                    img("counterform-team-june-park", 1),
                    t("June Park", "h3"),
                    t("Engineering Lead", "caption"),
                ),
            ),
        ),
        section(
            "s11",
            group(
                t("Start a project", "label"),
                t("Tell us what you’re building.", "h2"),
                t(
                    "A brand from scratch, a product that’s outgrown its first look, or a system to hold a fast-growing team together — whatever it is, we’d love to hear about it. We reply to every note within two days.",
                    "subtitle",
                ),
                button("Start a project"),
            ),
            { background: bgImage("counterform-studio-window-morning-light", 0.55) },
        ),
        section(
            "s12",
            row(
                group(
                    t("Counterform", "h3"),
                    t("Brand & digital studio. Lisbon & New York.", "caption"),
                    t("hello@counterform.studio", "caption"),
                ),
                group(
                    t("STUDIO", "label"),
                    bullets("Work", "Services", "About", "Journal", "Careers"),
                ),
                group(
                    t("ELSEWHERE", "label"),
                    bullets("Instagram", "Dribbble", "LinkedIn", "Read.cv", "Newsletter"),
                ),
            ),
        ),
    ],
    bgImage("counterform-paper-texture-mono-bg", 0.3),
);

export const newsletter: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            group(
                t("Common Ground · Issue No. 58", "label"),
                t("Common Ground", "h1"),
                t(
                    "A fortnightly letter on cities, design, and the small things that make a place feel like home.",
                    "subtitle",
                ),
                t("Saturday, June 27, 2026 · edited by Lena Hartmann", "caption"),
            ),
            { background: bgImage("commonground-city-square-morning-light", 0.55) },
        ),
        section(
            "s2",
            group(
                t("From the editor", "label"),
                t("Good morning from the square.", "h2"),
                t(
                    "This issue nearly missed its deadline, because the street outside my window has been closed to cars for three weeks and I keep going down to sit in it. That’s the whole newsletter, really — the strange, immediate joy of a place suddenly built for people instead of through-traffic.",
                    "subtitle",
                ),
                t(
                    "So this fortnight: a street that closed for the summer, a bench worth the detour, the economics of a well-lit evening, and a postcard from Ghent. As always, hit reply — the best half of this letter is the part you write back.",
                    "body",
                ),
            ),
        ),
        section(
            "s3",
            split(
                60,
                group(
                    t("The lead", "label"),
                    t("The street that closed for the summer.", "h2"),
                    t(
                        "In May the city did something quietly radical: it closed Rua das Flores to cars, put down forty planters and a few hundred chairs, and waited to see what would happen. What happened is that the street filled up — not with programming or events, just people doing the ordinary things people do when there’s finally room for them. Children drew on the cobbles. The café tripled its tables. An old man brought a folding chair and a newspaper and held court by the fountain every morning at nine.",
                        "body",
                    ),
                    t(
                        "The merchants, who fought it, now want it made permanent. Foot traffic is up, the bakery sold out by noon three Saturdays running, and the hardware store — the one everyone was sure would suffer — reports its best quarter in a decade. It turns out a street you want to linger on is a street you also want to shop on.",
                        "body",
                    ),
                ),
                group(
                    img("commonground-pedestrian-street-chairs", 0.78, 6),
                    t(
                        "Rua das Flores, three weeks after the cars left. The chairs were the city’s only intervention.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s4",
            split(
                40,
                group(
                    img("commonground-public-bench-waterfront", 1.05, 6),
                    t(
                        "The new benches on the waterfront — backs, armrests, and shade, which is more than most cities manage.",
                        "caption",
                    ),
                ),
                group(
                    t("A bench worth sitting on.", "h3"),
                    t(
                        "It sounds like nothing, but most public benches are designed to be looked at, not used — backless, armrest-less, deliberately uncomfortable so no one stays too long. The new ones along the harbour do the radical thing of being comfortable: a real back to lean on, armrests to push up from, and a tree planted to throw shade by August. The test of a city isn’t its monuments. It’s whether an eighty-year-old can find somewhere to rest between the bus and the front door.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            group(
                t("The 8 p.m. economy.", "h3"),
                t(
                    "A surprising line in this month’s council report: streets with warm, human-scale lighting see thirty percent more evening foot traffic than those lit by the usual orange floodlights — and, counter-intuitively, less crime. Light that makes a place feel watched-over rather than interrogated turns out to be the cheapest urban safety measure we have. The city is swapping two thousand fixtures this autumn. Watch the corners that used to empty at dusk.",
                    "body",
                ),
            ),
        ),
        section(
            "s6",
            split(
                60,
                group(
                    t("Field notes from Ghent.", "h3"),
                    t(
                        "I spent last weekend in Ghent, which famously banned through-traffic from its medieval centre back in 2017 and has spent the years since being smug about it — deservedly. What strikes you isn’t the absence of cars; it’s the presence of everything else. Deliveries happen by cargo bike before ten. Children ride to school alone. The air, measurably, is cleaner. It isn’t a museum either — it’s loud and ordinary and full of teenagers. The lesson Ghent keeps trying to teach the rest of us: you don’t lose a city by slowing it down. You finally get to keep it.",
                        "body",
                    ),
                ),
                group(
                    img("commonground-ghent-cargo-bike-delivery", 0.78, 6),
                    t(
                        "Morning deliveries in central Ghent. The cargo bike has quietly replaced the delivery van.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            quote("A street you want to linger on is a street you also want to shop on.", ""),
        ),
        section(
            "s8",
            group(
                t("From the mailbag", "label"),
                t("“Doesn’t pedestrianizing just push the traffic somewhere else?”", "h3"),
                t(
                    "It’s the first question every time, and the honest answer is: less than you’d think. The phenomenon is called traffic evaporation — when you remove road capacity, a measurable share of trips simply stop happening. People combine errands, walk the short ones, or shift the discretionary ones off the peak. Study after study finds that roughly a fifth of the displaced traffic just disappears. Cars, it turns out, are not water. They don’t have to go somewhere.",
                    "body",
                ),
            ),
        ),
        section(
            "s9",
            row(
                stat("21%", "of displaced car trips that simply evaporate"),
                stat("+38%", "weekend foot traffic on Rua das Flores"),
                stat("2,000", "streetlights the city swaps out this autumn"),
            ),
        ),
        section(
            "s10",
            group(
                t("Worth your time", "label"),
                t("Five things I saved this fortnight.", "h2"),
                bullets(
                    "“The Death and Life of Great American Streets” — a long, generous reappraisal of Jane Jacobs at sixty.",
                    "A photo essay on Tokyo’s pocket parks, the smallest of which is the size of a single parking space.",
                    "The council’s own before-and-after data on Rua das Flores (a PDF, but worth the download).",
                    "A short film on Pontevedra, the Spanish town that banned cars and forgot what a traffic jam feels like.",
                    "My friend Cira’s newsletter on trees in cities, which is better than this one and you should read it too.",
                ),
            ),
        ),
        section(
            "s11",
            group(
                divider(),
                t(
                    "That’s the fortnight. I’ll be in the square if you need me — third chair from the fountain, the one with the newspaper. See you in two weeks. — Lena",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s12",
            group(
                divider(),
                t(
                    "Common Ground is written every other Saturday by Lena Hartmann, a writer and former city planner in Lisbon. Forwarded this? Subscribe at commonground.letter. Reply to anything — it all reaches me.",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage("commonground-paper-grain-bg", 0.26),
);
