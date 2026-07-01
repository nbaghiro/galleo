import type { ArtifactContent } from "@model/content";
import {
    bgImage,
    bullets,
    callout,
    cell,
    chart,
    divider,
    doc,
    group,
    img,
    quote,
    section,
    stat,
    t,
} from "@model/authoring";

export const slowweb: ArtifactContent = doc("press", [
    section(
        "cover",
        "full",
        {
            a: cell(
                group(
                    t("ESSAY · THE SLOW WEB", "eyebrow"),
                    t("The Slow Web", "display"),
                    t(
                        "We made the internet fast enough to outrun our own attention. A case for building the other kind — calmer, smaller, made to be returned to.",
                        "lead",
                    ),
                    t("by Mara Okafor · 14 min read", "byline"),
                ),
            ),
        },
        { background: bgImage("slowweb-quiet-morning", 0.55) },
    ),

    section("lede", "full", {
        a: cell(
            group(
                t(
                    "We optimized the web for speed and called it progress. Pages now load in milliseconds; our attention lasts even less. Somewhere in the long race toward instant, we misplaced the part of the internet that was actually worth staying for.",
                    "lead",
                ),
                t(
                    "The fast web is a slot machine. The slow web is a garden. One is engineered to capture you and meter you out to advertisers; the other simply asks to be tended. This essay is about that second kind — what it once looked like, why it thinned out, and how a few stubborn corners of the network are quietly growing it back.",
                    "body",
                ),
            ),
        ),
    }),

    section("meaning", "full", {
        a: cell(
            group(
                t("What we mean by slow", "h2"),
                t(
                    "Slow is a loaded word, so let me defend it before it gets misread. I don’t mean sluggish, and I don’t mean precious. A slow page can still render in fifty milliseconds; the speed of delivery was never the thing in question. I mean slow the way a long meal is slow, or an evening walk — built on a human timescale, meant to be returned to, serenely indifferent to the clock that measures us in seconds and scrolls.",
                    "body",
                ),
                t(
                    "The fast web treats every visit as a transaction to be closed as efficiently as possible. The slow web treats a visit as a conversation that might, with luck, continue. The distinction is not really technical. It is a question of what the thing is for — and almost nothing online today is honest about what it is for.",
                    "body",
                ),
            ),
        ),
    }),

    section("pull-1", "full", {
        a: cell(quote("The opposite of fast was never slow. It was deliberate.", "")),
    }),

    section("feed", "split-6040", {
        a: cell(
            group(
                t("What the feed replaced", "h2"),
                t(
                    "Feeds replaced front pages. Metrics replaced editors. The basic unit of the web shrank from the essay to the post to the take — each one shorter, louder, and more disposable than the one before it. Nobody decided this in a room. We A/B-tested our way into it, one local optimum at a time, until the global picture was a place that no single person had chosen and nearly everyone complained about.",
                    "body",
                ),
                t(
                    "What we lost in the trade is hard to name, because it was never a feature. It was a tempo. The old web had pages that ended, links that wandered off somewhere strange, corners that rewarded the patient. The feed has none of these, and is magnificent at exactly one thing: never letting you reach the bottom.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                img("slowweb-newsstand-lagos", 0.78, 6),
                t(
                    "A newsstand in Lagos. A front page is an act of editing — a hundred small choices about what deserves your morning.",
                    "caption",
                ),
            ),
        ),
    }),

    section("economics", "full", {
        a: cell(
            group(
                t("The economics of the infinite scroll", "h2"),
                t(
                    "Follow the money and the design explains itself. When attention is the product being sold to advertisers, every second you linger is revenue and every second you reflect is leakage. The infinite scroll is not lazy engineering. It is the most rational interface a company can possibly build when its incentive is to ensure you never quite reach the end. A page that ends is a page that lets you leave.",
                    "body",
                ),
                t(
                    "This is why the fast web feels, at once, frictionless and faintly hostile. It clears away every obstacle between you and the next item precisely so that you never pause long enough to ask whether you wanted the last one. The smoothness is the trap. There is no natural place to stop, because stopping was the first thing designed out.",
                    "body",
                ),
            ),
        ),
    }),

    section("arithmetic", "full", {
        a: cell(
            group(
                t("The arithmetic of attention", "h2"),
                t(
                    "You can watch the cost of all this in the numbers, if you have the stomach for them. Attention is the single resource the web has spent two decades learning to extract, and like any well-worked seam, it has begun to show the strain.",
                    "body",
                ),
            ),
        ),
    }),

    section("stats", "three-up", {
        a: cell(stat("2.5 hrs", "the average day now spent inside social feeds")),
        b: cell(stat("47%", "of page views that end in under fifteen seconds")),
        c: cell(stat("8 sec", "focused attention online, by one widely-cited measure")),
    }),

    section("friction", "split-4060", {
        a: cell(
            group(
                img("slowweb-letterpress-shop", 1.05, 6),
                t(
                    "A letterpress shop in Yaba. Some friction is just the feeling of a thing being made by hand.",
                    "caption",
                ),
            ),
        ),
        b: cell(
            group(
                t("The case for friction", "h2"),
                t(
                    "A little friction is not a defect to be sanded away. It is frequently the very thing that makes a place feel like a place. RSS readers, personal sites, the newsletter you actually open on a Sunday — they share a quiet refusal to be optimized. They ask for a moment instead of a tap. The small effort of subscribing, of typing out a real URL, of waiting a week for the next issue is the same effort that makes the result feel chosen rather than merely served to you.",
                    "body",
                ),
                t(
                    "Frictionless is a compliment we pay to vending machines. People — and the things people make out of love — are gloriously, stubbornly full of friction.",
                    "body",
                ),
            ),
        ),
    }),

    section("nostalgia", "full", {
        a: cell(
            callout(
                "note",
                group(
                    t("A NOTE ON NOSTALGIA", "eyebrow"),
                    t(
                        "I’m not claiming the old web was better at everything; it plainly wasn’t. It was slower to search, harder to publish to, and frequently hideous. The argument here is narrower than nostalgia: in optimizing those real problems away, we quietly discarded something we hadn’t thought to value — and we can now choose, on purpose, to build it again.",
                        "body",
                    ),
                ),
            ),
        ),
    }),

    section("build", "full", {
        a: cell(
            group(
                t("How to build for the slow web", "h2"),
                t(
                    "If you want to make something for the slow web, the principles are almost embarrassingly old-fashioned. They are less a methodology than a posture — a short list of refusals more than a list of features.",
                    "body",
                ),
                bullets(
                    "Own your words. A domain outlives every platform that will ever host it.",
                    "Publish on your own schedule, not the algorithm’s appetite.",
                    "Measure almost nothing. Write for the ten people who will genuinely care.",
                    "Let your pages end. A clear bottom of the page is a form of respect.",
                    "Link generously outward. The web was a conversation long before it was a feed.",
                ),
            ),
        ),
    }),

    section(
        "pull-2",
        "full",
        {
            a: cell(
                quote(
                    "We built machines to hold our attention, and then wondered why we had so little of it left to give to anything else.",
                    "",
                ),
            ),
        },
        { background: bgImage("slowweb-dusk-window", 0.6) },
    ),

    section("reading", "full", {
        a: cell(
            group(
                t("Reading at the speed of thought", "h2"),
                t(
                    "There is a particular pleasure the fast web cannot manufacture: the sensation of a long piece slowly earning its length. You can feel a writer thinking on the page — hedging, doubling back, changing their mind, arriving somewhere they plainly did not set out for. A feed flattens all of it into the same scrollable height, the same swipeable cadence, the same flat affect. The slow web restores the difference between a thought and a notification.",
                    "body",
                ),
                t(
                    "Length is not the point; intention is. A good short post belongs to the slow web too. What doesn’t belong is the assumption that everything must be the same size, arrive at the same speed, and compete in the same auction for the same restless glance.",
                    "body",
                ),
            ),
        ),
    }),

    section("revival", "split-6040", {
        a: cell(
            group(
                t("Where it’s coming back", "h2"),
                t(
                    "The revival, when you look closely, is not really nostalgic — it is practical. Writers are leaving the feeds for sites they actually control. Readers are paying, in real money, for calm. The tools have finally made a hand-built page nearly as easy to publish as a post, which is the only reason any of this is possible at all. You no longer have to choose between owning your work and reaching anyone with it.",
                    "body",
                ),
                t(
                    "It is a small movement, and a quiet one, which is rather the point. The graph below won’t trend on anything. It is simply going up.",
                    "body",
                ),
            ),
        ),
        b: cell(
            group(
                chart("line", "9, 14, 22, 31, 48, 67, 91"),
                t(
                    "Independent newsletters and personal sites, indexed to 100 in 2019. The quiet web is growing while no one livestreams it.",
                    "caption",
                ),
            ),
        ),
    }),

    section("pull-3", "full", {
        a: cell(quote("That web was never deleted. It was only out-shouted.", "")),
    }),

    section("invitation", "full", {
        a: cell(
            group(
                t("An invitation, not a manifesto", "h2"),
                t(
                    "I’m wary of any essay that ends by telling you to log off and go touch grass; the web is grass too, or it can be — a thing you walk out into, not only a thing that is done to you. So this is not a renunciation, and it asks you to give up nothing. It is an invitation to spend a small, deliberate portion of your time somewhere that was made on purpose: by a person, for no better reason than that they wanted it to exist.",
                    "body",
                ),
                t(
                    "None of this requires the fast web to die. It only requires a parallel one — smaller, quieter, built by hand — to be permitted to exist alongside it. And it always was.",
                    "body",
                ),
            ),
        ),
    }),

    section(
        "closing",
        "full",
        {
            a: cell(
                t(
                    "Start a site nobody asked for. Subscribe to a letter that arrives once a month. Read one thing all the way to its end. The fast web will still be there when you get back, exactly as loud as you left it. The slow web only ever asks for the part of your attention you actually decide to give.",
                    "lead",
                ),
            ),
        },
        { background: bgImage("slowweb-open-window-light", 0.55) },
    ),

    section("bio", "full", {
        a: cell(
            group(
                divider(),
                t(
                    "Mara Okafor writes about technology, attention, and the texture of everyday life from Lagos. She is a contributing editor at The Slow Web and writes the monthly newsletter Quiet Machines. This is the first essay in a series on building a calmer internet.",
                    "byline",
                ),
            ),
        ),
    }),
]);
