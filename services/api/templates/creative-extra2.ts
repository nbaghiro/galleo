import type { ArtifactContent } from "@model/content";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
    divider,
    doc,
    group,
    img,
    quote,
    section,
    t,
    table,
    web,
} from "@model/authoring";

export const eventInvite: ArtifactContent = web(
    "rose",
    [
        // 1 — Hero
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("WITH JOYFUL HEARTS, TOGETHER WITH THEIR FAMILIES", "label"),
                        badge("SATURDAY · 12 SEPTEMBER 2026"),
                        t("Amara & Théo", "h1"),
                        t(
                            "are getting married — and they would be overjoyed for you to be there, under the olive trees, when they say yes.",
                            "subtitle",
                        ),
                        t("Quinta da Lua · Sintra, Portugal", "caption"),
                        button("RSVP by 1 August"),
                    ),
                ),
            },
            { background: bgImage("wedding-hero-olive-grove-dusk", 0.55) },
        ),

        // 2 — The invitation note
        section("s2", "full", {
            a: cell(
                group(
                    t("A NOTE FROM US", "label"),
                    t("Eight years, two cities, and one very good dog later.", "h2"),
                    t(
                        "We met in a rained-out queue for a film neither of us ended up seeing, and we have been choosing each other on purpose every day since.",
                        "subtitle",
                    ),
                    t(
                        "This September we're gathering the people who made us who we are — in a hillside grove above Sintra, with the sea somewhere over the trees — to make it official and then to dance about it for as long as the band will let us. There's no part of this day that matters more than having you in it. So please: come early, stay late, wear shoes you can lose.",
                        "body",
                    ),
                ),
            ),
        }),

        // 3 — The couple (split, image right)
        section("s3", "split-6040", {
            a: cell(
                group(
                    t("THE TWO OF US", "label"),
                    t("Amara, who plans everything. Théo, who plans nothing.", "h2"),
                    t(
                        "Amara grew up in Lagos and London and reads three books at once; Théo is from Porto, cooks like he's feeding an army, and has never once been on time. Somehow it works. Most weekends you'll find us at the market, arguing happily about which tomatoes to buy and where to put the future couch.",
                        "body",
                    ),
                    t("— Amara & Théo", "caption"),
                ),
            ),
            b: cell(img("wedding-couple-portrait-laughing", 0.84)),
        }),

        // 4 — The details (three-up cards)
        section("s4", "three-up", {
            a: cell(
                card(
                    img("wedding-detail-ceremony-arch", 1),
                    t("The Ceremony", "h3"),
                    t("4:00 PM · The Olive Terrace · please be seated by 3:45", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("wedding-detail-dinner-table", 1),
                    t("The Reception", "h3"),
                    t("6:00 PM · The Stone Barn · dinner, toasts & dancing to follow", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("wedding-detail-dress-code-linen", 1),
                    t("What to Wear", "h3"),
                    t("Garden formal · soft colours · flat-friendly for grass & gravel", "caption"),
                ),
            ),
        }),

        // 5 — The schedule (table)
        section("s5", "full", {
            a: cell(
                group(
                    t("THE DAY, HOUR BY HOUR", "label"),
                    t("How Saturday will unfold.", "h2"),
                    table(
                        "Time,What's happening,Where\n3:30 PM,Arrival & welcome drinks,The Lower Courtyard\n4:00 PM,Ceremony,The Olive Terrace\n4:45 PM,Photos & golden-hour aperitivo,The Garden\n6:00 PM,Dinner & toasts,The Stone Barn\n8:30 PM,First dance & the band,The Barn\n11:00 PM,Late-night snacks & last orders,The Courtyard\n12:00 AM,Sparkler send-off,The Drive",
                    ),
                ),
            ),
        }),

        // 6 — The venue (bgImage feature)
        section(
            "s6",
            "full",
            {
                a: cell(
                    group(
                        t("THE PLACE", "label"),
                        t("Quinta da Lua", "h2"),
                        t(
                            "A working olive farm folded into the green hills above Sintra — terracotta, old stone, and rows of silver trees that go gold at dusk. It's a forty-minute drive from Lisbon and feels a hundred years from anywhere.",
                            "subtitle",
                        ),
                    ),
                ),
            },
            { background: bgImage("wedding-venue-quinta-hillside", 0.5) },
        ),

        // 7 — Travel & stay (two-col bullets)
        section("s7", "two-col", {
            a: cell(
                group(
                    t("GETTING THERE", "label"),
                    t("Finding the grove", "h3"),
                    bullets(
                        "Fly into Lisbon (LIS) — about 40 minutes by car from the quinta",
                        "We'll run shuttle vans from central Sintra at 3:00 and 3:20 PM",
                        "Driving? There's free parking on the lower drive; leave the car overnight if you'd rather",
                        "Taxis and rideshare reach the gate, but book the return ahead — signal is thin in the hills",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("WHERE TO STAY", "label"),
                    t("A few nights nearby", "h3"),
                    bullets(
                        "We've held a block of rooms at Casa do Vale in Sintra — code AMARATHEO until 1 August",
                        "Sintra's old town is the prettiest base; Cascais is lovelier still if you want the sea",
                        "Lisbon is close enough for a 'morning after' brunch — we'd love to see you there",
                        "Coming far? Make a holiday of it; we're happy to share our favourite places",
                    ),
                ),
            ),
        }),

        // 8 — Gallery (three-up image grid)
        section("s8", "three-up", {
            a: cell(
                group(
                    img("wedding-gallery-olive-rows-light", 0.8),
                    t("The grove at the hour we'll marry.", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("wedding-gallery-table-figs-candles", 0.8),
                    t("Long tables, figs, and far too many candles.", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("wedding-gallery-dancing-string-lights", 0.8),
                    t("And then, the part with the dancing.", "caption"),
                ),
            ),
        }),

        // 9 — A word from a friend (quote)
        section("s9", "full", {
            a: cell(
                quote(
                    "These two make everyone around them feel like the most interesting person in the room. Come September, that room has a sea view.",
                    "Lena · maid of honour",
                ),
            ),
        }),

        // 10 — RSVP (bgImage CTA)
        section(
            "s10",
            "full",
            {
                a: cell(
                    group(
                        t("THE ONLY HOMEWORK", "label"),
                        t("Let us know you're coming.", "h2"),
                        t(
                            "Kindly reply by 1 August so we can save you a seat, a glass, and a place at the long table. Tell us about dietary needs, songs that will get you dancing, and whether you'll need a shuttle.",
                            "subtitle",
                        ),
                        button("RSVP at amaraandtheo.love"),
                        callout(
                            "tip",
                            t(
                                "Bringing little ones? We adore them and have a quiet room with a sitter from 8 PM — just say the word when you reply.",
                                "body",
                            ),
                        ),
                    ),
                ),
            },
            { background: bgImage("wedding-rsvp-string-lights-evening", 0.55) },
        ),

        // 11 — Footer
        section("s11", "three-up", {
            a: cell(
                group(
                    t("Amara & Théo", "h3"),
                    t("12 September 2026 · Sintra", "caption"),
                    t("hello@amaraandtheo.love", "caption"),
                ),
            ),
            b: cell(
                group(
                    t("GIFTS", "label"),
                    t(
                        "Your presence is the whole gift. If you'd like to do more, we're saving for a honeymoon in the Azores — details on the site.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                group(
                    t("SHARE THE DAY", "label"),
                    t("Tag your photos #AmaraAndTheo so we don't miss a single one.", "caption"),
                    t("amaraandtheo.love", "caption"),
                ),
            ),
        }),

        // 12 — Fine print
        section("s12", "full", {
            a: cell(
                group(
                    divider(),
                    t(
                        "With love, and with thanks to our parents — Ngozi & Emeka Okonkwo and Inês & Rui Almeida — who started all of this.",
                        "caption",
                    ),
                ),
            ),
        }),
    ],
    bgImage("wedding-paper-texture-bg", 0.3),
);

export const photoEssay: ArtifactContent = doc(
    "sumi",
    [
        // 1 — Cover
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("A PHOTO ESSAY", "label"),
                        t("Before the City Wakes", "h1"),
                        t(
                            "One hour in Kyoto, between the last streetlight and the first delivery bike — when the old city briefly belongs to no one.",
                            "subtitle",
                        ),
                        t("Photographs & words by Rei Tanaka · winter, 5:40 AM", "caption"),
                    ),
                ),
            },
            { background: bgImage("kyoto-dawn-cover-misty-lane", 0.55) },
        ),

        // 2 — Opening reflection
        section("s2", "full", {
            a: cell(
                group(
                    t("The opening", "label"),
                    t(
                        "I started waking before the city to find out who it is when nobody is watching.",
                        "subtitle",
                    ),
                    t(
                        "There is a particular hour here — too late to be night, too early to be morning — when Kyoto sets itself down like a held breath. The shutters are still drawn. The lanterns have gone out but the sky hasn't quite caught up. For maybe sixty minutes the streets are returned to the stones, the river, the mist, and the few of us foolish enough to be out in the cold to see it.",
                        "body",
                    ),
                    t(
                        "These are the pictures I came home with — and the small things I noticed only because there was nothing else to look at.",
                        "body",
                    ),
                ),
            ),
        }),

        // 3 — Full image
        section("s3", "full", {
            a: cell(
                group(
                    img("kyoto-dawn-gion-empty-lane-lanterns", 1.6),
                    t(
                        "Gion, 5:48. The teahouse lanterns are dark, the cobbles wet from a rain that came and went while the city slept. Not a single footprint yet — only mine, and I keep them to the edge.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 4 — Split, image left
        section("s4", "split-4060", {
            a: cell(img("kyoto-dawn-river-heron-mist", 1.05)),
            b: cell(
                group(
                    t("Kamo River", "label"),
                    t("The first to clock in", "h2"),
                    t(
                        "A grey heron stands in the shallows of the Kamo, perfectly still, the way it has stood every morning for a thousand years of mornings. It is always here before me. It watches the water and not the photographer, which I take, on balance, as a kindness.",
                        "body",
                    ),
                ),
            ),
        }),

        // 5 — Full image
        section("s5", "full", {
            a: cell(
                group(
                    img("kyoto-dawn-fushimi-torii-tunnel", 1.6),
                    t(
                        "Fushimi Inari before the crowds — ten thousand vermilion gates and not one other soul. The light comes through sideways and turns the whole tunnel the colour of a lit ember.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 6 — Split, image right
        section("s6", "split-6040", {
            a: cell(
                group(
                    t("Nishiki", "label"),
                    t("The market, half-awake", "h2"),
                    t(
                        "Behind the shutters of the covered market the day is already starting in whispers — a knife on a board, the hiss of a kettle, a radio turned low. A fishmonger hoses down the stones outside his stall and nods at me without surprise, as if everyone is up at this hour and only pretending otherwise.",
                        "body",
                    ),
                    t(
                        "He hands me a cup of tea I didn't ask for. I drink it standing in the cold, grateful past the reach of my Japanese.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("kyoto-dawn-nishiki-shutter-steam", 0.82)),
        }),

        // 7 — Triptych gallery
        section("s7", "three-up", {
            a: cell(
                group(
                    img("kyoto-dawn-detail-frost-moss", 0.8),
                    t(
                        "Frost holding the edge of the temple moss, an hour from melting.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    img("kyoto-dawn-detail-bicycle-alley", 0.8),
                    t(
                        "One bicycle, leaning where it was left, keeping the alley company.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                group(
                    img("kyoto-dawn-detail-paper-window-glow", 0.8),
                    t(
                        "The first window to glow — someone, somewhere, putting on the rice.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 8 — Quote / interlude (bgImage)
        section(
            "s8",
            "full",
            {
                a: cell(
                    quote(
                        "I came to photograph the temples and stayed for the silence between them, which no lens has ever once held still.",
                        "— field notes, the third morning",
                    ),
                ),
            },
            { background: bgImage("kyoto-dawn-bamboo-grove-fog", 0.55) },
        ),

        // 9 — Split, image left
        section("s9", "split-4060", {
            a: cell(img("kyoto-dawn-arashiyama-bamboo-path", 1.08)),
            b: cell(
                group(
                    t("Arashiyama", "label"),
                    t("Among the bamboo", "h2"),
                    t(
                        "The grove makes its own weather. Up there the canes close over the path and the light arrives already filtered, green and underwater. In the wind the whole stand creaks and bows like the timbers of a ship, and you understand why the old poets kept coming back here to listen rather than to look.",
                        "body",
                    ),
                ),
            ),
        }),

        // 10 — Full image
        section("s10", "full", {
            a: cell(
                group(
                    img("kyoto-dawn-monk-sweeping-courtyard", 1.6),
                    t(
                        "A monk sweeps the courtyard of a temple that won't open for hours, drawing the same lines in the same gravel he drew yesterday. The point, I think, was never to finish.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 11 — Split, image right
        section("s11", "split-6040", {
            a: cell(
                group(
                    t("Pontocho", "label"),
                    t("The narrowest street", "h2"),
                    t(
                        "Pontocho is barely wide enough for two people to pass and politely apologise. By night it's all neon and noise; by 6 AM it's a corridor of shut doors and drying lanterns, the river breathing at one end of it, and the smell of last night's charcoal still hanging in the damp.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("kyoto-dawn-pontocho-narrow-alley", 0.82)),
        }),

        // 12 — Closing thought (bgImage)
        section(
            "s12",
            "full",
            {
                a: cell(
                    group(
                        t("The closing", "label"),
                        t("And then the bicycles", "h2"),
                        t(
                            "It ends the same way each time. A delivery bike turns the corner, a shutter rolls up with a clatter, a phone rings somewhere behind a wall — and the spell, which was never really mine to keep, lifts. The city stretches, remembers itself, and takes its streets back. I put the lens cap on and walk home into the noise, already a little homesick for an hour that hasn't even finished leaving.",
                            "body",
                        ),
                        t("— Rei, walking back along the Kamo", "caption"),
                    ),
                ),
            },
            { background: bgImage("kyoto-dawn-closing-sunrise-rooftops", 0.5) },
        ),
    ],
    bgImage("photoessay-paper-bg", 0.3),
);
