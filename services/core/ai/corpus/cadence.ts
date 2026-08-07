import type { ArtifactContent } from "@model/artifact";
import { bgImage, bullets, group, quote, section, social, stat, t } from "@model/authoring";

// B2B SaaS ad on the Linear/Notion shape: name the pain, show the product doing the work, put numbers
// behind it, handle the "not another chat app" objection, close on the free tier. Software has no
// ingredient list to teach, so the middle cards carry features rather than materials.
export const cadence: ArtifactContent = social("graphite", [
    section(
        "s1",
        group(
            t("CADENCE", "label"),
            t("Your standup is 40 minutes long.", "h1"),
            t("Swipe →", "caption"),
        ),
        { background: bgImage("cadence-standup-meeting-room", 0.6) },
    ),
    section(
        "s2",
        group(
            t("2 / 12", "label"),
            t("And nobody remembers what was said.", "h2"),
            t("Decisions end up in three tools and one person's memory.", "body"),
        ),
        { background: bgImage("cadence-sticky-notes-wall", 0.66) },
    ),
    section(
        "s3",
        group(
            t("3 / 12", "label"),
            t("Nine people. One talking.", "h2"),
            t("Eight of them are waiting for their turn to say “no blockers”.", "body"),
        ),
        { background: bgImage("cadence-bored-video-call", 0.66) },
    ),
    section(
        "s4",
        group(
            t("4 / 12 · THE FIX", "label"),
            t("Cadence writes it down.", "h1"),
            t("Async threads, one per team. Nobody schedules anything.", "body"),
        ),
        { background: bgImage("cadence-app-thread-ui", 0.58) },
    ),
    section(
        "s5",
        group(
            t("5 / 12 · POSTING", "label"),
            t("Two minutes, from wherever you are.", "h2"),
            t("Slack, email, or the app. Same thread either way.", "body"),
        ),
        { background: bgImage("cadence-phone-commute-typing", 0.64) },
    ),
    section(
        "s6",
        group(
            t("6 / 12 · FRIDAY", "label"),
            t("One summary. Whole week.", "h1"),
            t("Written for the person who was on holiday.", "body"),
        ),
        { background: bgImage("cadence-friday-desk-summary", 0.6) },
    ),
    section(
        "s7",
        group(
            t("7 / 12 · THE DECISION LOG", "label"),
            t("Every “we decided”, searchable.", "h2"),
            t("Six months later, you can find out why.", "body"),
        ),
        { background: bgImage("cadence-archive-shelves-rows", 0.66) },
    ),
    section(
        "s8",
        group(
            t("8 / 12 · IT PLUGS IN", "label"),
            bullets(
                "Slack and Teams, both directions",
                "Linear and Jira issues inline",
                "GitHub PRs auto-attached",
                "Calendar, to delete the meeting",
            ),
        ),
        { background: bgImage("cadence-server-lights-dark", 0.74) },
    ),
    section(
        "s9",
        group(
            t("9 / 12 · THE NUMBER", "label"),
            stat("6.5 hrs", "meeting time returned per person, per month"),
            t("Median across 2,400 teams in their first quarter.", "caption"),
        ),
        { background: bgImage("cadence-empty-calendar-week", 0.72) },
    ),
    section(
        "s10",
        group(
            quote(
                "We killed three recurring meetings in the first fortnight and nobody asked for them back.",
                "Dani Okonkwo · Eng Manager, Halfmoon",
            ),
        ),
        { background: bgImage("cadence-office-quiet-morning", 0.64) },
    ),
    section(
        "s11",
        group(
            t("11 / 12", "label"),
            t("It's not another chat app.", "h2"),
            t(
                "No channels, no threads to catch up on. One post a day, one summary a week.",
                "body",
            ),
        ),
        { background: bgImage("cadence-notification-overload", 0.68) },
    ),
    section(
        "s12",
        group(
            t("12 / 12", "label"),
            t("Free under 10 people.", "h1"),
            t("No card. Import from Slack in a minute.", "body"),
            t("cadence.app →", "caption"),
        ),
        { background: bgImage("cadence-desk-morning-light", 0.58) },
    ),
]);
