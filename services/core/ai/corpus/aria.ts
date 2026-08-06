import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    chart,
    deck,
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
    video,
} from "@model/authoring";

export const aria: ArtifactContent = deck(
    "carbon",
    [
        section(
            "s1",
            group(
                t("ARIA", "label"),
                t("VELVET STATIC", "h1"),
                t(
                    "The second album. Twelve tracks of midnight pop and slow-burning noir-soul, written, performed, and self-produced between London, Lisbon, and a coast in winter.",
                    "subtitle",
                ),
                badge("OUT SEPTEMBER 4 · 2026"),
            ),
            { background: bgImage("aria-velvet-static-night-cover", 0.55) },
        ),
        section(
            "s2",
            group(
                t("The album, in one line", "label"),
                t(
                    "A late-night record about the static that's left when someone you love goes quiet.",
                    "h1",
                ),
                t("VELVET STATIC · the second album from ARIA", "caption"),
            ),
        ),
        section(
            "s3",
            split(
                40,
                img("aria-portrait-fog-window", 0.78),
                group(
                    t("The artist", "label"),
                    t("ARIA", "h2"),
                    t(
                        "Born Aria Vance in Lisbon and raised between her grandmother's record shop and the late-night radio she fell asleep to, ARIA is a singer, songwriter, and producer who builds her records alone, after dark, one layer at a time.",
                        "body",
                    ),
                    t(
                        "Her 2024 debut, Paper Saints, began as bedroom demos and ended on year-end lists — a self-released breakout that crossed 80 million streams with no label and no press. Velvet Static is the sound of that solitude going widescreen.",
                        "body",
                    ),
                    badge("LISBON → LONDON → LOS ANGELES"),
                ),
            ),
        ),
        section(
            "s4",
            split(
                60,
                group(
                    t("The concept", "label"),
                    t("Written in the static between two cities.", "h2"),
                    t(
                        "ARIA wrote Velvet Static across eighteen restless months — a sublet in East London, a friend's studio in Lisbon, and the long flights in between. The album is about the in-between itself: the dead air on the line, the message you draft and never send, the version of a person that only exists at 3 a.m.",
                        "body",
                    ),
                    t(
                        "She tracked most of it to tape and finished it in a single coastal winter, trading polish for atmosphere — room tone, breath, the hum of an amp someone forgot to switch off.",
                        "body",
                    ),
                    callout(
                        "note",
                        t(
                            "No co-writers and no toplines for hire — ARIA wrote, performed, and produced every song on the record herself.",
                            "body",
                        ),
                    ),
                ),
                img("aria-tape-machine-studio", 0.82),
            ),
        ),
        section(
            "s5",
            quote(
                "I wanted it to sound like the second after a room goes silent — when the static clears and you finally hear the thing you've been trying not to.",
                "— ARIA, on Velvet Static",
            ),
            { background: bgImage("aria-empty-room-blue-light", 0.6) },
        ),
        section(
            "s6",
            split(
                40,
                img("aria-neon-diner-portrait", 0.78),
                group(
                    t("The visual world", "label"),
                    t("Blue light, wet asphalt, and the glow of a screen left on.", "h2"),
                    t(
                        "The album's world was art-directed with photographer Linnea Roos: a palette of cobalt and sodium-orange, shot on 35mm across empty parking structures, all-night diners, and the blue hour over the Pacific. Every frame looks like the last text you stared at before falling asleep.",
                        "body",
                    ),
                    bullets(
                        "A cobalt-and-sodium colour story, shot entirely on 35mm film",
                        "Locations: night highways, 24-hour diners, and empty pools",
                        "Hand-set type and visible grain — no gloss, no retouching",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            row(
                group(
                    img("aria-mood-allnight-diner", 0.8),
                    t("01 — The all-night diner", "caption"),
                ),
                group(
                    img("aria-mood-bluehour-pool", 0.8),
                    t("02 — Blue hour, empty pool", "caption"),
                ),
                group(img("aria-mood-wet-highway", 0.8), t("03 — The drive home", "caption")),
            ),
        ),
        section(
            "s8",
            group(
                t("Tracklist", "label"),
                t("Twelve tracks. One long night.", "h2"),
                table(
                    "No.,Track,Length\n01,Cobalt Hours,3:48\n02,Velvet Static,4:12\n03,Paper Saints,3:21\n04,Ghost Radio,3:57\n05,Neon Sundays,4:30\n06,Slow Disaster,3:09\n07,Lighthouse,4:44\n08,Tokyo in the Rain,3:33\n09,Static Lover,3:52\n10,The Quiet Part,2:58\n11,Dial Tone,3:14\n12,After Hours,5:21",
                ),
            ),
        ),
        section(
            "s9",
            group(
                t("The singles", "label"),
                t("Three songs already out in the world.", "h2"),
                t(
                    "Velvet Static arrives one signal at a time. Lead single 'Cobalt Hours' landed in March; 'Ghost Radio' and 'Lighthouse' have followed in the months since. Watch the 'Cobalt Hours' video — shot in a single unbroken take across downtown Los Angeles at 4 a.m.",
                    "body",
                ),
                video("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            ),
            { background: bgImage("aria-city-night-driving", 0.6) },
        ),
        section(
            "s10",
            row(
                group(
                    img("aria-single-cobalt-hours-art", 1),
                    t("'Cobalt Hours'", "h3"),
                    t("Lead single · out now", "caption"),
                ),
                group(
                    img("aria-single-ghost-radio-art", 1),
                    t("'Ghost Radio'", "h3"),
                    t("Second single · out now", "caption"),
                ),
                group(
                    img("aria-single-lighthouse-art", 1),
                    t("'Lighthouse'", "h3"),
                    t("Third single · out now", "caption"),
                ),
            ),
        ),
        section(
            "s11",
            row(
                stat("31M", "streams across the singles"),
                stat("240K", "pre-saves on Velvet Static"),
                stat("1.4M", "followers across platforms"),
            ),
        ),
        section(
            "s12",
            split(
                60,
                group(
                    t("Momentum", "label"),
                    t("From a cult following to a breakout in motion.", "h2"),
                    t(
                        "Monthly listeners since 'Cobalt Hours' dropped, in millions. Two editorial playlist adds and one runaway clip turned a quiet rollout into the fastest-rising independent campaign on the platform this quarter.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "'Cobalt Hours' crossed 10 million streams in its first 18 days — fully independent, with no major-label push.",
                            "body",
                        ),
                    ),
                ),
                chart("line", "0.4, 0.7, 1.1, 1.9, 2.8, 3.6, 4.2", 240),
            ),
        ),
        section(
            "s13",
            group(
                t("Campaign", "label"),
                t("The rollout, start to encore.", "h2"),
                diagram("process", "Announce, Singles, Album, World tour, Deluxe", 180),
            ),
        ),
        section(
            "s14",
            group(
                t("Live", "label"),
                t("The Velvet Static World Tour.", "h2"),
                table(
                    "Date,City,Venue\nSep 12,Los Angeles,The Wiltern\nSep 16,San Francisco,The Fillmore\nSep 20,Chicago,Metro\nSep 24,New York,Webster Hall\nOct 01,London,Village Underground\nOct 05,Paris,La Cigale\nOct 09,Berlin,Säälchen\nOct 13,Amsterdam,Paradiso\nOct 18,Lisbon,LAV\nOct 23,Tokyo,Liquidroom",
                ),
                badge("TICKETS ON SALE NOW"),
            ),
        ),
        section(
            "s15",
            row(
                quote(
                    "ARIA makes heartbreak sound like a city at three in the morning — gorgeous, exhausted, and impossible to switch off.",
                    "— Pitchfork",
                ),
                quote(
                    "A follow-up with nothing to prove and everything to say. Velvet Static doesn't announce itself; it just refuses to leave.",
                    "— DAZED",
                ),
            ),
        ),
        section(
            "s16",
            quote(
                "A slow-burning marvel. Every track feels like a secret she decided, at the very last second, to tell you anyway.",
                "— The FADER",
            ),
        ),
        section(
            "s17",
            split(
                40,
                img("aria-vinyl-cobalt-gatefold", 0.9),
                group(
                    t("Physical", "label"),
                    t("Velvet Static on wax.", "h2"),
                    card(
                        t("Deluxe Edition", "h3"),
                        bullets(
                            "180g translucent cobalt vinyl in a gatefold sleeve",
                            "Two bonus tracks: 'Last Bus' and 'Cobalt Hours (4 a.m. Version)'",
                            "A 36-page lyric and photo booklet shot on 35mm",
                        ),
                    ),
                    badge("SIGNED FIRST PRESSING OF 1,000"),
                ),
            ),
        ),
        section(
            "s18",
            group(
                t("Credits", "label"),
                t("Made by a small circle of collaborators.", "h2"),
                table(
                    "Role,Credit\nWritten & produced by,ARIA\nAdditional production,Sander Voss\nMixed by,Tom Eriksen\nMastered by,Emily Lazar\nStrings,The Lisbon Session Players\nArt direction & photography,Linnea Roos\nManagement,Halcyon Artists\nLabel,Static Bloom / Nightline Records",
                ),
            ),
        ),
        section(
            "s19",
            group(
                t("Where to listen + follow", "label"),
                t("Out everywhere September 4.", "h2"),
                t(
                    "Pre-save Velvet Static, follow ARIA, and request the full press kit — hi-res photography, stems, lyric sheets, and interview availability are all on request.",
                    "subtitle",
                ),
                group(
                    button("Pre-save Velvet Static"),
                    button("Follow @ariasound"),
                    button("press@ariamusic.com"),
                ),
            ),
            { background: bgImage("aria-stage-silhouette-blue", 0.55) },
        ),
    ],
    bgImage("aria-cover-grain", 0.4),
);
