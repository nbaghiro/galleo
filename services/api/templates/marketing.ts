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
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
    web,
} from "@model/authoring";

// A product launch site for a believable fictional hardware product.
export const productLaunch: ArtifactContent = web(
    "botanic",
    [
        // 1 — Hero (bgImage cover)
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("Introducing Aer One", "eyebrow"),
                        t("The air you forgot you were breathing.", "display"),
                        t(
                            "A whisper-quiet purifier that reads your room and clears it in minutes — no app to babysit, no filters you’ll forget to change.",
                            "lead",
                        ),
                        button("Pre-order — $249"),
                    ),
                ),
            },
            { background: bgImage("aer-hero-living-room", 0.58) },
        ),
        // 2 — The problem
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("The problem", "eyebrow"),
                    t("Indoor air is the pollution nobody talks about.", "h2"),
                    t(
                        "We spend 90% of our lives indoors, where the air can be up to five times more polluted than the street outside — cooking smoke, off-gassing furniture, pollen, pet dander, and the fine particles that slip past every cheap filter. Most purifiers either roar like a jet or quietly do nothing at all.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("aer-dust-particles-light", 0.92)),
        }),
        // 3 — Stat band on a feature background
        section(
            "s3",
            "three-up",
            {
                a: cell(stat("99.97%", "of particles down to 0.1 microns captured")),
                b: cell(stat("12 min", "to clear a 400 sq ft room")),
                c: cell(stat("21 dB", "quieter than a library at night")),
            },
            { background: bgImage("aer-clean-air-gradient", 0.5) },
        ),
        // 4 — The product (split layout)
        section("s4", "split-4060", {
            a: cell(img("aer-device-on-floor", 1.05)),
            b: cell(
                group(
                    t("Meet Aer One", "eyebrow"),
                    t("Engineered to disappear into your home.", "h2"),
                    t(
                        "A single seamless aluminum shell, a fabric crown spun from recycled PET, and a glow ring that fades from amber to white as your air gets cleaner. It’s the first purifier we’ve made that people leave out on purpose.",
                        "body",
                    ),
                    button("Take the tour"),
                ),
            ),
        }),
        // 5 — Feature highlight with image (split, reversed)
        section("s5", "split-6040", {
            a: cell(
                group(
                    t("Intelligence", "eyebrow"),
                    badge("ON-DEVICE"),
                    t("It senses, then it acts.", "h2"),
                    t(
                        "Four laser sensors sample the room sixty times a second. When you sear a steak or the pollen count spikes, Aer One spins up before you’d ever notice — then settles back to a hush the moment the air is clear. All of it runs on the device. Nothing leaves your home.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("aer-sensor-closeup", 0.92)),
        }),
        // 6 — How it works (process diagram)
        section("s6", "full", {
            a: cell(
                group(
                    t("How it works", "eyebrow"),
                    t("Four stages, one breath.", "h2"),
                    t(
                        "Air is pulled in from every direction, stripped of particles and gases, and returned cooler and cleaner than it came — a full pass every ninety seconds.",
                        "body",
                    ),
                    diagram("process", "Draw in, Pre-filter, HEPA + carbon, Return clean", 240),
                ),
            ),
        }),
        // 7 — Key features (three-up cards)
        section("s7", "three-up", {
            a: cell(
                card(
                    img("aer-filter-cartridge", 1),
                    t("One-click filter", "title"),
                    t(
                        "A magnetic cartridge swaps in five seconds — and the device tells you the exact day it’s due.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("aer-quiet-bedroom-night", 1),
                    t("Sleep mode", "title"),
                    t(
                        "The glow ring dims to nothing and the fan drops below a whisper, so it works while you don’t hear it.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("aer-solar-panel-eco", 1),
                    t("Built to last", "title"),
                    t(
                        "Repairable by design, a five-year warranty, and a shell spun from 100% recycled aluminum.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 8 — Social proof: quote + stats on a feature background
        section(
            "s8",
            "split-6040",
            {
                a: cell(
                    quote(
                        "I stopped waking up congested within a week. I didn’t expect to feel the difference — but the whole house notices when it’s off.",
                        "Dr. Lena Osei · Pulmonologist & early tester",
                    ),
                ),
                b: cell(
                    group(
                        stat("4.9★", "average across 2,300 beta reviews"),
                        stat("96%", "would replace their old purifier"),
                    ),
                ),
            },
            { background: bgImage("aer-soft-home-window", 0.55) },
        ),
        // 9 — Performance chart
        section("s9", "split-4060", {
            a: cell(
                group(
                    t("Measured, not marketed", "eyebrow"),
                    t("From hazy to clear in twelve minutes.", "h2"),
                    t(
                        "Particulate count (PM2.5) in a sealed 400 sq ft room after a stovetop sear, sampled every two minutes. Lower is cleaner.",
                        "body",
                    ),
                ),
            ),
            b: cell(chart("line", "182, 168, 121, 74, 41, 18, 9, 4", 240)),
        }),
        // 10 — Pricing (table)
        section("s10", "full", {
            a: cell(
                group(
                    t("Pricing", "eyebrow"),
                    t("One device, three ways to live with it.", "h2"),
                    table(
                        "Model,Coverage,Filter,Price\nAer One,Up to 400 sq ft,12-month HEPA + carbon,$249\nAer One Plus,Up to 650 sq ft,18-month HEPA + carbon,$329\nAer Care,Any model,Auto-shipped filters + warranty,$6/mo",
                    ),
                ),
            ),
        }),
        // 11 — FAQ (two-col callouts + bullets)
        section("s11", "two-col", {
            a: cell(
                group(
                    t("Frequently asked", "eyebrow"),
                    t("The honest answers.", "h2"),
                    bullets(
                        "Yes — it’s true HEPA, independently certified, not “HEPA-type”.",
                        "Filters last a full year and ship to you the week they’re due.",
                        "No subscription required; Aer Care is entirely optional.",
                    ),
                ),
            ),
            b: cell(
                callout(
                    "info",
                    t(
                        "Ships free across North America in 2–4 days. Try it for 60 nights — if your air doesn’t feel different, send it back and we’ll refund every cent, return shipping included.",
                        "body",
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
                        t("Breathe better, starting now", "eyebrow"),
                        t("Your first clear breath ships in March.", "h2"),
                        t(
                            "Reserve yours today with a fully refundable $25 deposit and lock in launch pricing before it goes up.",
                            "lead",
                        ),
                        button("Pre-order Aer One"),
                    ),
                ),
            },
            { background: bgImage("aer-final-cta-sky", 0.55) },
        ),
    ],
    bgImage("aer-bg-texture", 0.32),
);

// A SaaS landing page for a believable fictional analytics product.
export const landingPage: ArtifactContent = web(
    "sunrise",
    [
        // 1 — Hero with CTA (bgImage cover)
        section(
            "s1",
            "split-6040",
            {
                a: cell(
                    group(
                        t("Northwind Analytics", "eyebrow"),
                        t("Your metrics, finally in one place.", "display"),
                        t(
                            "Connect every tool your team already uses and watch a single, trustworthy dashboard build itself — no SQL, no data team, no waiting on a Monday report.",
                            "lead",
                        ),
                        button("Start free — no card"),
                    ),
                ),
                b: cell(img("northwind-dashboard-hero", 0.95)),
            },
            { background: bgImage("northwind-hero-workspace", 0.52) },
        ),
        // 2 — Trusted-by / logos row (caption + stats)
        section("s2", "three-up", {
            a: cell(stat("8,400+", "teams shipping with Northwind")),
            b: cell(stat("42M", "events processed every day")),
            c: cell(stat("99.99%", "uptime over the last 12 months")),
        }),
        section("s3", "full", {
            a: cell(
                group(
                    t("Trusted by fast-moving teams", "caption"),
                    t("Lumen · Cedarworks · Haloway · Norrøn · Bellweather · Patchwork", "title"),
                ),
            ),
        }),
        // 3 — Core benefits (three-up)
        section("s4", "three-up", {
            a: cell(
                card(
                    img("northwind-connect-sources", 1),
                    t("Connect in minutes", "title"),
                    t(
                        "Forty native integrations — Stripe, Postgres, HubSpot, GA4 and more — live the moment you click connect.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("northwind-ask-question", 1),
                    t("Ask in plain English", "title"),
                    t(
                        "Type “revenue by plan last quarter” and get a chart you can trust — and edit — in seconds.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("northwind-team-share", 1),
                    t("Share without friction", "title"),
                    t(
                        "Dashboards, alerts, and weekly digests land where your team already works — Slack, email, or the wall TV.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 4 — Feature deep-dive (split with image, on a feature background)
        section(
            "s5",
            "split-4060",
            {
                a: cell(img("northwind-live-metrics-screen", 1.05)),
                b: cell(
                    group(
                        t("Live, not stale", "eyebrow"),
                        badge("REAL-TIME"),
                        t("Numbers that move when your business does.", "h2"),
                        t(
                            "Northwind streams your data instead of batching it overnight, so the figure on the screen is the figure right now. Set a threshold once and we’ll ping you the instant signups dip or churn spikes — long before it shows up in a monthly review.",
                            "body",
                        ),
                        button("See it live"),
                    ),
                ),
            },
            { background: bgImage("northwind-feature-glow", 0.5) },
        ),
        // 5 — Growth chart deep-dive
        section("s6", "split-6040", {
            a: cell(
                group(
                    t("Why teams switch", "eyebrow"),
                    t("Less time wrangling, more time deciding.", "h2"),
                    t(
                        "Average hours per week our customers spend building reports, before Northwind and after their first month.",
                        "body",
                    ),
                ),
            ),
            b: cell(chart("bar", "11, 9, 4, 2, 1", 240)),
        }),
        // 6 — Testimonials (quote)
        section("s7", "two-col", {
            a: cell(
                quote(
                    "We replaced a $90k BI contract and two spreadsheets with Northwind in an afternoon. Our whole company reads the same numbers now.",
                    "Priya Raman · VP Growth, Cedarworks",
                ),
            ),
            b: cell(
                quote(
                    "I’m not technical, and I built our exec dashboard myself on day one. That has never once been true of an analytics tool.",
                    "Tom Becker · Founder, Haloway",
                ),
            ),
        }),
        // 7 — Pricing tiers (table)
        section("s8", "full", {
            a: cell(
                group(
                    t("Pricing", "eyebrow"),
                    t("Start free. Grow when you’re ready.", "h2"),
                    table(
                        "Plan,Best for,Data sources,Price\nFree,Side projects,3 sources,$0\nTeam,Growing startups,15 sources,$49/mo\nBusiness,Scaling companies,Unlimited,$199/mo\nEnterprise,Custom needs,Unlimited + SSO,Let’s talk",
                    ),
                ),
            ),
        }),
        // 8 — Final FAQ + CTA
        section("s9", "two-col", {
            a: cell(
                group(
                    t("Questions, answered", "eyebrow"),
                    t("Everything before you sign up.", "h2"),
                    bullets(
                        "Free forever for three sources — no trial clock, no card.",
                        "SOC 2 Type II certified; your data is encrypted in transit and at rest.",
                        "Cancel or export everything in one click, any time.",
                    ),
                ),
            ),
            b: cell(
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
        }),
    ],
    bgImage("northwind-bg-texture", 0.3),
);
