import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    chart,
    code,
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
} from "@model/authoring";

export const lumen: ArtifactContent = web(
    "clay",
    [
        section(
            "hero",
            split(
                60,
                group(
                    t("DEEP WORK, ON DEMAND", "label"),
                    badge("NOW ON MACOS, WINDOWS, iOS & ANDROID"),
                    t("Defend the hours that matter.", "h1"),
                    t(
                        "Lumen blocks the noise, runs your focus sessions, and shows you exactly where your attention goes — so your best work stops getting interrupted.",
                        "subtitle",
                    ),
                    group(button("Start focusing free"), button("Watch the 2-min tour")),
                    t("No card required · Free forever plan · Set up in 60 seconds", "caption"),
                ),
                img(
                    "https://images.pexels.com/photos/6237991/pexels-photo-6237991.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    1.2,
                ),
            ),
            {
                background: bgImage(
                    "https://images.pexels.com/photos/31020856/pexels-photo-31020856.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    0.58,
                ),
            },
        ),
        section(
            "trusted-label",
            t("TRUSTED BY 200,000+ MAKERS, ENGINEERS & WRITERS WHO SHIP", "label"),
        ),
        section(
            "trusted-logos",
            row(
                group(
                    img(
                        "https://images.pexels.com/photos/15779815/pexels-photo-15779815.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        1.6,
                    ),
                    t("Northwind Labs", "caption"),
                ),
                group(
                    img(
                        "https://images.pexels.com/photos/10526896/pexels-photo-10526896.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        1.6,
                    ),
                    t("Meridian Studio", "caption"),
                ),
                group(
                    img(
                        "https://images.pexels.com/photos/30880049/pexels-photo-30880049.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        1.6,
                    ),
                    t("Aperture AI", "caption"),
                ),
            ),
        ),
        section(
            "problem",
            split(
                40,
                img(
                    "https://images.pexels.com/photos/6991866/pexels-photo-6991866.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    0.95,
                ),
                group(
                    t("THE PROBLEM", "label"),
                    t("Your attention is under constant attack.", "h2"),
                    t(
                        "The average knowledge worker is interrupted every six minutes and needs twenty-three minutes to fully refocus. Notifications, open tabs, and 'quick' Slacks quietly drain the most valuable hours of your day.",
                        "body",
                    ),
                    callout(
                        "warn",
                        t(
                            "Most people get under ninety minutes of true deep work a day — and have no idea where the other seven hours went.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "problem-stats",
            row(
                stat("Every 6 min", "the average worker is interrupted"),
                stat("23 min", "to fully refocus after each interruption"),
                stat("2.1 hrs", "of real deep work in a typical 8-hour day"),
            ),
        ),
        section(
            "meet",
            split(
                60,
                group(
                    t("MEET LUMEN", "label"),
                    t("One calm room for your hardest work.", "h2"),
                    t(
                        "Open Lumen, pick what you're working on, and start a session. We close the door — blocking the apps and sites that pull you away — run a gentle timer, and log every minute of real focus to a journal that's always yours.",
                        "subtitle",
                    ),
                    button("See how it works"),
                ),
                img(
                    "https://images.pexels.com/photos/30480338/pexels-photo-30480338.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    1.15,
                ),
            ),
        ),
        section(
            "features-intro",
            group(
                t("WHAT'S INSIDE", "label"),
                t("Everything you need to protect your focus.", "h2"),
                t(
                    "Three tools, one quiet workspace: block the distractions, run the session, and finally see where your attention actually goes.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "features",
            row(
                card(
                    img(
                        "https://images.pexels.com/photos/14685268/pexels-photo-14685268.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        1,
                    ),
                    t("Distraction blocking", "h3"),
                    t(
                        "Block sites, apps, and notifications the moment a session starts — at the system level, across every device. Allowlists keep the few tools you truly need within reach.",
                        "body",
                    ),
                ),
                card(
                    img(
                        "https://images.pexels.com/photos/13151698/pexels-photo-13151698.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        1,
                    ),
                    t("Focus sessions", "h3"),
                    t(
                        "Run focused sprints with a calm timer and ambient soundscapes. Pause-proof tracking logs every minute of deep work, so your streak reflects reality.",
                        "body",
                    ),
                ),
                card(
                    img(
                        "https://images.pexels.com/photos/7845368/pexels-photo-7845368.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                        1,
                    ),
                    t("Focus analytics", "h3"),
                    t(
                        "See your deep-work hours, peak times, and longest streaks. Weekly reviews show exactly where your attention went — and where it leaked.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "blocking",
            split(
                60,
                group(
                    t("DISTRACTION BLOCKING", "label"),
                    t("Silence the noise — at the system level.", "h2"),
                    t(
                        "Start a session and Lumen closes the door for you across every device. No willpower required, no browser extension to forget, no escape hatch unless you genuinely need one.",
                        "body",
                    ),
                    bullets(
                        "One-click block lists for sites and desktop apps",
                        "Auto-silence notifications, Slack, and Do Not Disturb during sessions",
                        "Schedule recurring focus blocks straight on your calendar",
                        "Emergency bypass for the rare interruption that's actually real",
                    ),
                ),
                img(
                    "https://images.pexels.com/photos/1484538/pexels-photo-1484538.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    1.05,
                ),
            ),
        ),
        section(
            "analytics",
            split(
                40,
                img(
                    "https://images.pexels.com/photos/32836042/pexels-photo-32836042.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    1.05,
                ),
                group(
                    t("BUILT FOR BUILDERS", "label"),
                    t("Automate focus from your terminal.", "h2"),
                    t(
                        "Start a session, mute everything, and log deep work without leaving your editor. The Lumen CLI and API drop straight into the workflow you already have.",
                        "body",
                    ),
                    code(
                        "# Start a 90-minute deep-work block\nlumen focus start --duration 90m --block social,news\n\n# → Blocking 142 distractions. Timer running.\n# → Session #1,204 logged to your focus journal.",
                    ),
                ),
            ),
        ),
        section(
            "how",
            group(
                t("HOW IT WORKS", "label"),
                t("A simple loop that compounds.", "h2"),
                t(
                    "No new system to learn. Four steps, repeated daily, quietly stack into your most productive weeks on record.",
                    "subtitle",
                ),
                diagram("process", "Plan, Block, Focus, Review", 200),
            ),
        ),
        section(
            "science",
            split(
                60,
                group(
                    t("THE SCIENCE", "label"),
                    t("Focus is a muscle. Here's the proof.", "h2"),
                    t(
                        "We tracked 12,000 anonymized users through their first six weeks on Lumen. Average daily deep work — measured in real, uninterrupted minutes — climbs steadily as blocking becomes a habit instead of a decision.",
                        "body",
                    ),
                    t("Average daily deep work, minutes — weeks 1 through 6", "caption"),
                ),
                chart("line", "76, 112, 148, 181, 209, 238", 260),
            ),
        ),
        section(
            "results-stats",
            row(
                stat("3h 58m", "average daily deep work after 30 days"),
                stat("+38%", "self-reported focus score, week 1 → week 4"),
                stat("1.4M", "focus sessions completed last month"),
            ),
        ),
        section(
            "testimonial",
            split(
                60,
                quote(
                    "I went from two good hours a week to two good hours a day. Lumen is the only productivity app I've never quietly turned off after the first week.",
                    "— Dana Reyes · Staff Engineer, Meridian Studio",
                ),
                img(
                    "https://images.pexels.com/photos/27658223/pexels-photo-27658223.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    0.9,
                ),
            ),
        ),
        section(
            "press",
            row(
                group(
                    t("The Verge", "h3"),
                    t("“The rare focus app that actually disappears into your day.”", "caption"),
                ),
                group(
                    t("Wired", "h3"),
                    t(
                        "“Finally, attention tracking that feels like a coach, not a cop.”",
                        "caption",
                    ),
                ),
                group(
                    t("Fast Company", "h3"),
                    t("“The closest thing to a quiet office you can install.”", "caption"),
                ),
            ),
        ),
        section(
            "integrations",
            split(
                40,
                img(
                    "https://images.pexels.com/photos/7794427/pexels-photo-7794427.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    1,
                ),
                group(
                    t("WORKS WITH YOUR STACK", "label"),
                    t("Plays nicely with everything.", "h2"),
                    bullets(
                        "Google Calendar & Outlook — auto-schedule focus blocks",
                        "Slack & Teams — auto-set Do Not Disturb when a session starts",
                        "Notion, Linear & Jira — attach each session to the task at hand",
                        "macOS, Windows, iOS & Android — sync your focus everywhere",
                    ),
                ),
            ),
        ),
        section(
            "pricing",
            group(
                t("PRICING", "label"),
                t("Start free. Upgrade when focus pays off.", "h2"),
                t(
                    "Every plan includes unlimited sessions and core blocking. No card to try it, no surprises later.",
                    "subtitle",
                ),
                table(
                    "Plan,Price,Best for,Includes\nFree,$0,Trying deep work for the first time,Unlimited sessions + core blocking\nPro,$9/mo,People who focus every single day,Full blocking, analytics & soundscapes\nTeams,$12/seat,Teams protecting shared focus time,Shared blocks, group reports & admin\nEnterprise,Custom,Orgs that need SSO & controls,SSO, SCIM, audit logs & SLA",
                ),
            ),
        ),
        section(
            "faq",
            row(
                group(
                    t("Does Lumen really block apps?", "h3"),
                    t(
                        "Yes — it blocks distracting sites and desktop apps at the system level, with allowlists for the few tools you genuinely need open.",
                        "body",
                    ),
                    t("Will I lose my data if I close it?", "h3"),
                    t(
                        "Never. Every session syncs to the cloud, and your focus journal is always yours to export in one click.",
                        "body",
                    ),
                    t("Can I use it with my team?", "h3"),
                    t(
                        "Teams plans add shared focus blocks, group analytics, and admin controls — without ever exposing anyone's personal session data.",
                        "body",
                    ),
                ),
                group(
                    t("Is there really a free plan?", "h3"),
                    t(
                        "Always. The free plan includes unlimited sessions and core blocking, with no card required and no time limit.",
                        "body",
                    ),
                    t("What if I need to be reachable?", "h3"),
                    t(
                        "Set a list of people and apps that can always break through, and use one-tap bypass for the interruption that's genuinely urgent.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "Try Pro free for 14 days. If your deep-work hours don't go up, we'll refund you — no questions, no forms.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "cta",
            group(
                t("READY WHEN YOU ARE", "label"),
                t("Protect your next deep hour.", "h1"),
                t("Join 200,000+ people who do their best work with Lumen.", "subtitle"),
                button("Start focusing free"),
            ),
            {
                background: bgImage(
                    "https://images.pexels.com/photos/36595323/pexels-photo-36595323.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                    0.52,
                ),
            },
        ),
        section(
            "footer",
            row(
                group(
                    t("Lumen", "h3"),
                    t("The quiet your best work needs.", "caption"),
                    t("© 2026 Lumen Labs, Inc. · San Francisco & remote", "caption"),
                ),
                group(
                    t("PRODUCT", "label"),
                    t("Features", "caption"),
                    t("Pricing", "caption"),
                    t("Integrations", "caption"),
                    t("Download", "caption"),
                    t("Changelog", "caption"),
                ),
                group(
                    t("COMPANY", "label"),
                    t("About", "caption"),
                    t("The focus blog", "caption"),
                    t("Careers", "caption"),
                    t("Privacy & security", "caption"),
                    t("Contact", "caption"),
                ),
            ),
        ),
    ],
    bgImage(
        "https://images.pexels.com/photos/25342319/pexels-photo-25342319.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
        0.38,
    ),
);
