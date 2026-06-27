import type { ArtifactContent } from "@model/content";
import { bullets, cell, deck, group, img, quote, section, t } from "./build";

export const slowweb: ArtifactContent = deck("press", [
    section("s1", "full", {
        a: cell(group(t("ESSAY", "eyebrow"), t("The Slow Web", "display"), t("by Mara Okafor · 9 min read", "byline"))),
    }),
    section("s2", "full", {
        a: cell(
            group(
                t("We optimized the web for speed and called it progress. Pages load in milliseconds; attention lasts even less. Somewhere in the race to instant, we lost the part of the internet that was worth staying for.", "lead"),
                t("The fast web is a slot machine. The slow web is a garden. One is engineered to capture you; the other asks you to tend it. This essay is about the second kind — what it looked like, why it faded, and how a few stubborn corners are bringing it back.", "body"),
            ),
        ),
    }),
    section("s3", "full", { a: cell(quote("The opposite of fast isn’t slow. It’s deliberate.", "")) }),
    section("s4", "split-6040", {
        a: cell(
            group(
                t("What we traded away", "h2"),
                t("Feeds replaced front pages. Metrics replaced editors. The unit of the web shrank from the essay to the post to the take — each one shorter, louder, and more disposable than the last. We didn’t decide this. We A/B-tested our way into it.", "body"),
            ),
        ),
        b: cell(img("slowweb-1", 0.78, 4)),
    }),
    section("s5", "full", {
        a: cell(
            group(
                t("The case for friction", "h2"),
                t("A little friction is not a bug. It’s the thing that makes a place feel like a place. RSS readers, personal sites, newsletters you actually open — they share a quiet refusal to be optimized. They ask for a moment instead of a tap.", "body"),
                bullets("Own your words — a domain outlives a platform", "Publish on your schedule, not the algorithm’s", "Measure nothing; write for the ten people who care"),
            ),
        ),
    }),
    section("s6", "full", {
        a: cell(
            group(
                t("Where it’s coming back", "h2"),
                t("The revival isn’t nostalgic — it’s practical. Writers are leaving feeds for sites they control. Readers are paying for calm. The tools finally make a hand-built page as easy as a tweet, which is the only reason any of this is possible.", "body"),
                t("Mara Okafor writes about technology and attention from Lagos.", "byline"),
            ),
        ),
    }),
]);
