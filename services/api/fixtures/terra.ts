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
    divider,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
    web,
} from "@model/authoring";

export const terra: ArtifactContent = web(
    "botanic",
    [
        // 1 — Hero
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("TERRA · SUSTAINABLE GOODS", "label"),
                        badge("NEW — THE LOAM COLLECTION"),
                        t("Beautiful things that return to the earth.", "h1"),
                        t(
                            "We design everyday objects — for the kitchen, the table, the bath — from single, plant-based materials. Built to last for years, and to compost in weeks. No plastic, no mystery coatings, no landfill.",
                            "subtitle",
                        ),
                        button("Shop the collection"),
                    ),
                ),
            },
            { background: bgImage("terra-hero-still-life", 0.55) },
        ),

        // 2 — Promise strip
        section("s2", "three-up", {
            a: cell(
                group(
                    t("Plastic-free, always", "h3"),
                    t(
                        "Every order ships in molded pulp and paper tape — zero plastic anywhere in the box.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("Home-compostable", "h3"),
                    t(
                        "Breaks down in a backyard bin in weeks — no 1,400°F industrial facility required.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                group(
                    t("1% for the Planet", "h3"),
                    t(
                        "One percent of every sale funds soil and forest restoration, audited each year.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 3 — Philosophy / manifesto
        section("s3", "full", {
            a: cell(
                group(
                    t("OUR PHILOSOPHY", "label"),
                    t("Made to last. Made to return.", "h2"),
                    t(
                        "We design the opposite of disposable: objects good enough to keep for a decade — and honest enough to disappear in a season when you finally let them go.",
                        "subtitle",
                    ),
                    t(
                        "Most “sustainable” goods are a compromise dressed up as a virtue — bamboo bonded with melamine, “plant-based” plastics that need an industrial furnace to break down, a recycling symbol that quietly means landfill. Terra began because the honest version didn’t exist: single-material objects, beautifully made, that you compost in your own garden into something that actually feeds the soil they came from.",
                        "body",
                    ),
                ),
            ),
        }),

        // 4 — Why we exist (image left)
        section("s4", "split-4060", {
            a: cell(img("terra-flax-field-golden", 1.05)),
            b: cell(
                group(
                    t("WHY WE EXIST", "label"),
                    t("Borrowed from the earth, returned with care.", "h2"),
                    t(
                        "We don’t offset our way to better. Every Terra object is designed to give back more than it takes — from the regenerative farms our materials grow on to the compost bin each one ends up in. No micro-plastics shed in your sink, no mystery coatings, no landfill at the end of the line. Only soil.",
                        "body",
                    ),
                ),
            ),
        }),

        // 5 — Collection intro
        section("s5", "full", {
            a: cell(
                group(
                    t("THE COLLECTION", "label"),
                    t("Objects for the everyday.", "h2"),
                    t(
                        "Fourteen essentials for the kitchen, table, bath, and garden — each made from a single compostable material, built to last for years and to vanish in weeks. Quietly designed to be the best version of the thing you already reach for every day.",
                        "body",
                    ),
                ),
            ),
        }),

        // 6 — Collection grid 1
        section("s6", "three-up", {
            a: cell(
                card(
                    img("terra-flax-tumbler", 1),
                    t("The Daily Tumbler", "h3"),
                    t("Pressed flax husk · keeps coffee hot for 3 hours · $28", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("terra-cane-bowl-set", 1),
                    t("Everyday Bowl Set", "h3"),
                    t("Sugarcane cane-resin · set of four · $36", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("terra-beech-dish-brush", 1),
                    t("Hearth Dish Brush", "h3"),
                    t("Coppiced beech + agave bristle · replaceable head · $14", "caption"),
                ),
            ),
        }),

        // 7 — Collection grid 2
        section("s7", "three-up", {
            a: cell(
                card(
                    img("terra-mycelium-planter", 1),
                    t("Field Planter", "h3"),
                    t("Grown from mushroom mycelium · plant it, pot and all · $22", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("terra-beech-bath-tray", 1),
                    t("The Bath Tray", "h3"),
                    t("Oiled coppiced beechwood · for soap, stone & sponge · $32", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("terra-flax-linen-napkins", 1),
                    t("Table Linens", "h3"),
                    t("Belgian flax linen · set of four napkins · $40", "caption"),
                ),
            ),
        }),

        // 8 — Featured bestseller (image right)
        section("s8", "split-6040", {
            a: cell(
                group(
                    t("NEW · THE LOAM COLLECTION", "label"),
                    badge("BESTSELLER"),
                    t("The Loam Caddy.", "h2"),
                    t(
                        "Our countertop compost bin — grown, not molded, from mushroom mycelium and flax. It holds five days of kitchen scraps, seals tight against odor, and looks like something you’d actually leave out on the counter. When it finally wears out, bury it in the garden it helped grow.",
                        "body",
                    ),
                    t("$48", "h3"),
                    button("Shop the Loam Caddy"),
                ),
            ),
            b: cell(img("terra-loam-caddy-counter", 0.92)),
        }),

        // 9 — Materials & craft (image left)
        section("s9", "split-4060", {
            a: cell(img("terra-workshop-hands-pressing", 1.05)),
            b: cell(
                group(
                    t("MATERIALS & CRAFT", "label"),
                    t("One material. Nothing hidden.", "h2"),
                    t(
                        "Every Terra object is made from a single, traceable, plant-based material — never a laminate, never a blend you can’t take apart. That’s harder to engineer and slower to make. It’s also the only way an object can return cleanly to the earth. We press flax husk into warm, durable forms; we grow mycelium into shape in seven days; we finish beech with nothing but plant oil.",
                        "body",
                    ),
                ),
            ),
        }),

        // 10 — Materials table
        section("s10", "full", {
            a: cell(
                group(
                    t("EVERY MATERIAL, AND WHERE IT ENDS UP", "label"),
                    table(
                        "Material,Source,Used in,End of life\nFlaxfoam,Belgian flax husk (a milling byproduct),Tumblers & bowls,Home compost in ~8 weeks\nMycopress,Regenerative mushroom mycelium,Planters & the Loam Caddy,Garden soil in ~45 days\nCane resin,Sugarcane bagasse,Bowl sets & crocks,Home compost in ~16 weeks\nCoppiced beech,FSC-certified beechwood,Brushes & trays,Compost or clean burn\nFlax linen,Belgian flax fibre,Napkins & aprons,Home compost in ~10 weeks",
                    ),
                ),
            ),
        }),

        // 11 — How it's made (process diagram)
        section("s11", "full", {
            a: cell(
                group(
                    t("HOW IT’S MADE", "label"),
                    t("From field to shelf, in five steps.", "h2"),
                    t(
                        "No assembly lines and no overseas freight. Each object moves through five hands in our own workshop before it’s allowed to ship.",
                        "body",
                    ),
                    diagram("process", "Grow, Press, Finish, Inspect, Ship"),
                ),
            ),
        }),

        // 12 — In the workshop (bgImage feature)
        section(
            "s12",
            "full",
            {
                a: cell(
                    group(
                        t("IN THE WORKSHOP", "label"),
                        t("Slow made, by hand.", "h2"),
                        t(
                            "Everything is made in small batches in our Portland workshop by a team of fourteen makers who sign the bottom of what they build. No overseas freight, no warehouse full of guesswork — we make to the season, and we make it to keep.",
                            "subtitle",
                        ),
                    ),
                ),
            },
            { background: bgImage("terra-workshop-interior-warm", 0.5) },
        ),

        // 13 — Our impact (three-up stats)
        section("s13", "three-up", {
            a: cell(stat("100%", "home-compostable — certified, not merely claimed")),
            b: cell(stat("−42%", "lower carbon than the conventional equivalent")),
            c: cell(stat("1.2M", "trees funded through 1% for the Planet")),
        }),

        // 14 — Impact chart (text left, chart right)
        section("s14", "split-6040", {
            a: cell(
                group(
                    t("OUR IMPACT", "label"),
                    t("Compost in, forests out.", "h2"),
                    t(
                        "For every order we fund tree-planting and soil restoration through 1% for the Planet. Here’s the cumulative count, in thousands of trees, since we opened our doors in 2022.",
                        "body",
                    ),
                ),
            ),
            b: cell(chart("line", "40, 130, 290, 540, 860, 1200", 240)),
        }),

        // 15 — The standards we hold (bullets + callout)
        section("s15", "full", {
            a: cell(
                group(
                    t("THE STANDARDS WE HOLD", "label"),
                    t("Proof, not promises.", "h2"),
                    t(
                        "We publish the receipts. Every product page lists its material, its independent lab results, and exactly how long it takes to break down — because “eco” should be something you can check, not something you’re asked to believe.",
                        "body",
                    ),
                    bullets(
                        "Certified home-compostable to TÜV AUSTRIA OK Compost HOME — verified by an independent lab, not a logo we bought",
                        "Every product ships with a free repair kit; worn parts are sold on their own, never as a whole new object",
                        "Send anything back with a prepaid label and we’ll compost it for you, then credit your next order",
                        "Plastic-free from the field to your front door — molded pulp and paper tape, nothing else",
                        "One percent of every sale goes to soil and forest restoration, audited annually",
                    ),
                    callout(
                        "success",
                        t(
                            "Full third-party test results are published for every single product on our site. If we can’t prove it, we don’t print it.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),

        // 16 — Testimonials
        section("s16", "two-col", {
            a: cell(
                quote(
                    "I composted my old dish brush in the same bin as my vegetable peels. I didn’t know I’d been waiting my whole life to do that.",
                    "Priya N. · Lisbon",
                ),
            ),
            b: cell(
                quote(
                    "The Loam Caddy is the first compost bin my partner hasn’t tried to hide in a cupboard. It just lives on the counter now.",
                    "Marcus R. · Portland",
                ),
            ),
        }),

        // 17 — The people behind it (image right)
        section("s17", "split-6040", {
            a: cell(
                group(
                    t("THE PEOPLE BEHIND IT", "label"),
                    t("Started by a designer and a soil scientist.", "h2"),
                    t(
                        "Terra began at a kitchen table in 2022, when Ada Mensah — an industrial designer tired of making things destined for landfill — teamed up with Joon Park, a soil scientist who could grow a planter out of mushrooms. Four years and fourteen products later, we’re still a small team in one workshop, making objects we’d want in our own homes and would be glad to give back to the ground.",
                        "body",
                    ),
                    t("— Ada & Joon, founders", "caption"),
                ),
            ),
            b: cell(img("terra-founders-portrait-studio", 0.82)),
        }),

        // 18 — Join / newsletter (bgImage)
        section(
            "s18",
            "full",
            {
                a: cell(
                    group(
                        t("STAY IN THE LOOP", "label"),
                        t("One good thing, every season.", "h2"),
                        t(
                            "Join 60,000 people getting first access to new objects, repair guides, and the occasional dispatch from the farm. No noise — four emails a year, and 10% off your first order to say hello.",
                            "subtitle",
                        ),
                        button("Get 10% off your first order"),
                    ),
                ),
            },
            { background: bgImage("terra-flax-field-dusk", 0.5) },
        ),

        // 19 — Footer columns
        section("s19", "three-up", {
            a: cell(
                group(
                    t("Terra", "h3"),
                    t("Beautiful things that return to the earth.", "caption"),
                    t("hello@terragoods.com", "caption"),
                ),
            ),
            b: cell(
                group(
                    t("SHOP", "label"),
                    bullets("Kitchen", "Table & dining", "Bath", "Garden", "Gift cards"),
                ),
            ),
            c: cell(
                group(
                    t("COMPANY", "label"),
                    bullets("Our story", "Materials & impact", "Stockists", "Journal", "Careers"),
                ),
            ),
        }),

        // 20 — Fine print
        section("s20", "full", {
            a: cell(
                group(
                    divider(),
                    t(
                        "© 2026 Terra Goods, Inc. · Portland, Oregon · Carbon-negative shipping · 100-day returns · 1% for the Planet member",
                        "caption",
                    ),
                ),
            ),
        }),
    ],
    bgImage("terra-paper-grain-bg", 0.28),
);
