import type { ArtifactContent } from "@model/artifact";
import {
    bgImage,
    bullets,
    callout,
    doc,
    group,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
} from "@model/authoring";

export const fieldnotes: ArtifactContent = doc(
    "henna",
    [
        section(
            "s1",
            group(
                t("FIELD NOTES — A TRAVEL JOURNAL", "label"),
                t("Faroe Islands", "h1"),
                t(
                    "Two weeks adrift in the North Atlantic — eighteen islands, one sketchbook that never quite dried out.",
                    "subtitle",
                ),
                t("Words & sketches by Mara Okafor · 6–20 September 2026", "caption"),
            ),
            { background: bgImage("faroe-cover-seacliffs", 0.55) },
        ),
        section(
            "s2",
            group(
                t("The opening", "label"),
                t(
                    "I came to draw the light and stayed for the weather, which here turns out to be the same thing.",
                    "subtitle",
                ),
                t(
                    "Why the Faroes? Because the map runs out there. Eighteen specks of black basalt dropped between Iceland and Norway, stitched together by tunnels and ferries and a stubborn faith that the fog will lift. Nobody comes here by accident. You have to mean it.",
                    "body",
                ),
                t(
                    "I meant it the way you mean a long-postponed letter — out of a feeling that some places are getting quieter while the rest of the world gets louder, and that I wanted to stand in one before it changed its mind. These are the pages I managed to keep legible.",
                    "body",
                ),
            ),
        ),
        section(
            "s3",
            group(
                img("faroe-fjord-ferry-dawn", 1.6),
                t(
                    "First light off the bow — the islands rising out of the Atlantic like something the sea hadn't quite finished deciding on.",
                    "caption",
                ),
            ),
        ),
        section(
            "s4",
            split(
                60,
                group(
                    t("Day 1", "label"),
                    t("Tórshavn", "h2"),
                    t(
                        "The overnight ferry let us out at dawn into a harbour the colour of pewter. Tórshavn is the smallest capital I have ever walked clean across in twenty minutes — turf roofs furred green with grass, timber tarred black as liquorice, and everywhere the smell of diesel and salt cod.",
                        "body",
                    ),
                    t(
                        "I found a room above a café on Tinganes, the old rock spit where the parliament has met since the Vikings. The landlady handed me a wool blanket and said, very kindly, that I had brought entirely the wrong jacket.",
                        "body",
                    ),
                ),
                img("faroe-torshavn-harbour-boats", 0.82),
            ),
        ),
        section(
            "s5",
            split(
                40,
                img("faroe-tinganes-turf-roofs", 1.05),
                group(
                    t("Still Day 1", "label"),
                    t("Tinganes after dark", "h2"),
                    t(
                        "By evening the rain eased and the whole spit glowed — ox-blood timber, white window frames, roofs of living grass gone gold in the low sun. I sat on a wet bollard and drew the rooflines until the cold reached my drawing hand, which did not take long.",
                        "body",
                    ),
                    t(
                        "A man walked past with a wheelbarrow of cut grass; he had been mowing a roof. He nodded as though this were the most ordinary thing in the world, which, here, it is.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s6",
            quote(
                "There are more sheep than people here, and the sheep, on the whole, keep the better counsel.",
                "— notebook, day two",
            ),
        ),
        section(
            "s7",
            split(
                40,
                img("faroe-gasadalur-village-cliff", 1.05),
                group(
                    t("Day 3", "label"),
                    t("Gásadalur", "h2"),
                    t(
                        "You used to reach Gásadalur on foot over the mountain, or by helicopter, or not at all. Now there is a tunnel bored through the rock, lit a sickly orange, and then suddenly the whole Atlantic falls off the edge of the village.",
                        "body",
                    ),
                    t(
                        "Eleven houses, a handful of cats, and a view that does not seem fair to keep to so few people. I filled four pages on the wet grass while a sheep watched me with what I can only call professional disinterest.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s8",
            group(
                img("faroe-mulafossur-waterfall-sea", 1.6),
                t(
                    "Múlafossur — a waterfall that pours straight off the cliff into the open sea, with the village and the green mountain stacked behind it like a stage set built by someone showing off.",
                    "caption",
                ),
            ),
        ),
        section(
            "s9",
            split(
                60,
                group(
                    t("Day 5", "label"),
                    t("Saksun", "h2"),
                    t(
                        "Saksun is a tidal lagoon ringed by green cliffs and guarded by exactly one turf-roofed church. When the tide draws out you can walk the black sand all the way to the sea; when it comes back in, it does so faster than a polite person ought to have to run.",
                        "body",
                    ),
                    t(
                        "I lost track of the time, of course, and finished the afternoon by sprinting an incoming tide in borrowed wellies two sizes too large, laughing in a way that frightened the birds.",
                        "body",
                    ),
                ),
                img("faroe-saksun-turf-church-lagoon", 0.82),
            ),
        ),
        section(
            "s10",
            row(
                group(
                    img("faroe-gallery-black-sand", 0.8),
                    t(
                        "Black sand at low tide, ribbed by the water like the roof of a mouth.",
                        "caption",
                    ),
                ),
                group(
                    img("faroe-gallery-stone-church", 0.8),
                    t(
                        "A church the size of a shed, holding its ground against the whole sky.",
                        "caption",
                    ),
                ),
                group(
                    img("faroe-gallery-wool-drying", 0.8),
                    t(
                        "Wool on a line; lanolin and woodsmoke carried on the wind off the water.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s11",
            split(
                60,
                group(
                    t("Day 8", "label"),
                    t("Mykines", "h2"),
                    t(
                        "The boat to Mykines runs only when the swell allows, which is to say rarely and without warning. We made it on the third attempt. The whole island is a single green ridge crowded with puffins who let you sit among them as though you were a slightly disappointing piece of furniture.",
                        "body",
                    ),
                    t(
                        "By afternoon the fog came down like a lid and the keeper's path to the lighthouse simply vanished. We waited it out with the puffins, who seemed entirely unbothered by any of it.",
                        "body",
                    ),
                ),
                img("faroe-mykines-puffins-cliff", 0.82),
            ),
        ),
        section(
            "s12",
            group(
                t("Field note", "label"),
                t("Four seasons before lunch", "h2"),
                t(
                    "Nothing I read prepared me for how fast the sky here changes its mind. A clear morning is not a promise; it is an opening offer.",
                    "body",
                ),
                callout(
                    "note",
                    t(
                        "If a Faroese person tells you to wait twenty minutes, wait twenty minutes. The weather turns faster than any forecast can follow, and almost always in your favour — eventually. Pack for all of it and carry none of your assumptions.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s13",
            split(
                40,
                img("faroe-kallur-lighthouse-ridge", 1.08),
                group(
                    t("Day 11", "label"),
                    t("Kallur Lighthouse, Kalsoy", "h2"),
                    t(
                        "The walk out to Kallur is two hours of wet sheep track along a knife-edge ridge, the sea a thousand feet down on either side. Then the little white lighthouse appears, absurd and perfect at the end of the world, and you understand exactly why people risk the ferry for it.",
                        "body",
                    ),
                    t(
                        "I ate a cheese sandwich up there with my back to the wind and my feet hanging over more emptiness than I have ever felt comfortable hanging anything over.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s14",
            split(
                60,
                group(
                    t("Day 13", "label"),
                    t("Tjørnuvík", "h2"),
                    t(
                        "On my last full day I took the bus to Tjørnuvík, a black-sand cove at the top of Streymoy where you can watch the two sea stacks — the Giant and the Witch — stand petrified offshore, caught forever in the act of trying to drag the islands back to Iceland.",
                        "body",
                    ),
                    t(
                        "A surfer in a thick wetsuit was paddling out into water that cannot have been much warmer than a refrigerator. I drew him until my fingers stopped working, then drank a coffee so hot it felt like an apology.",
                        "body",
                    ),
                ),
                img("faroe-tjornuvik-sea-stacks", 0.82),
            ),
        ),
        section(
            "s15",
            quote(
                "I stopped trying to photograph the fog and started drawing it instead. The fog, it turns out, holds still for no one — and neither, in the end, does the light.",
                "— notebook, day fourteen",
            ),
            { background: bgImage("faroe-fog-ridge-quote", 0.55) },
        ),
        section(
            "s16",
            row(
                stat("214 km", "walked — most of it uphill, all of it into wind"),
                stat("9 of 14", "days of rain (the other five were merely threatening)"),
                stat("63", "pages filled, perhaps a dozen of them legible"),
            ),
        ),
        section(
            "s17",
            split(
                40,
                img("faroe-tunnel-road-coast", 1.05),
                group(
                    t("Practical notes", "label"),
                    t("Getting around", "h2"),
                    bullets(
                        "Rent a car — the sub-sea tunnels link the main islands and are worth every króna",
                        "Download an offline map; the signal dies past the second tunnel and never quite comes back",
                        "Ferries to Mykines and Kalsoy run on the swell, not the schedule — keep your days loose",
                        "The bus network is small but immaculate and absurdly punctual",
                    ),
                ),
            ),
        ),
        section(
            "s18",
            row(
                group(
                    t("Where to stay", "label"),
                    t("A room with weather", "h3"),
                    bullets(
                        "Base yourself in Tórshavn — everything is a day-trip from there",
                        "A guesthouse with a kitchen beats a hotel; restaurants close early and far apart",
                        "One night in a turf-roofed cottage, if you can manage it, for the sound of rain on grass",
                        "Book Mykines beds weeks ahead; there are roughly none left by August",
                    ),
                ),
                group(
                    t("What to pack", "label"),
                    t("Wear the wool", "h3"),
                    bullets(
                        "One good wool sweater — knitwear here is infrastructure, not a souvenir",
                        "Waterproof everything, then accept it still won't be enough",
                        "Proper boots with grip; the sheep tracks are wet basalt and unforgiving",
                        "A paper map, a warm hat, and far fewer expectations than you arrived with",
                    ),
                ),
            ),
        ),
        section(
            "s19",
            group(
                t("Going home", "label"),
                t("The last word belongs to the weather", "h2"),
                t(
                    "The ferry pulled out at first light and Tórshavn folded back into its hills until it was just another grey smudge under a greyer sky. You do not bring the Faroes home with you. You bring back a sketchbook swollen with damp, a sweater that still smells of woodsmoke, and the particular silence of a place where the weather always, eventually, gets the last word.",
                    "body",
                ),
                t("— Mara, on deck, somewhere past Suðuroy", "caption"),
            ),
            { background: bgImage("faroe-closing-ferry-wake", 0.55) },
        ),
    ],
    bgImage("fieldnotes-bg", 0.3),
);
