import type { ArtifactContent, ElementInstance, Section, SectionBackground } from "@model/artifact";
import type { Surface } from "@model/ai";
import {
    bgColor,
    button,
    col,
    faq,
    feature,
    fill,
    fitW,
    menu,
    row,
    section,
    t,
} from "@model/authoring";
import { galleo } from "@services/core/ai/corpus/galleo";
import { helios } from "@services/core/ai/corpus/helios";
import { terra } from "@services/core/ai/corpus/terra";
import { heading } from "./system";

const GOLD: Record<Surface, ArtifactContent> = { deck: galleo, doc: helios, web: terra };

function countEls(el: ElementInstance): number {
    const kids = (el.data as { children?: ElementInstance[] } | undefined)?.children;
    return 1 + (Array.isArray(kids) ? kids.reduce((n, k) => n + countEls(k), 0) : 0);
}
function sectionSize(s: Section): number {
    return countEls(s.root);
}

// keep `layout`: a child's column width is load-bearing, so exemplars show how columns carry widths
function cleanElement(el: ElementInstance): Record<string, unknown> {
    const data: Record<string, unknown> = { ...(el.data as Record<string, unknown>) };
    if (Array.isArray(data.children)) {
        data.children = (data.children as ElementInstance[]).map(cleanElement);
    }
    return el.layout ? { type: el.type, data, layout: el.layout } : { type: el.type, data };
}
function cleanSection(s: Section): unknown {
    return { id: s.id, root: cleanElement(s.root) };
}

function shapeOf(s: Section): string {
    const d = s.root.data as { direction?: string; children?: unknown[] };
    if (!Array.isArray(d.children)) return "leaf";
    return `${d.direction ?? "col"}:${d.children.length}`;
}

export function sectionExemplars(surface: Surface): string {
    const art = GOLD[surface] ?? GOLD.deck;
    const ranked = art.sections
        .map((s) => ({ s, n: sectionSize(s) }))
        .filter((x) => x.n >= 3 && x.n <= 12)
        .sort((a, b) => b.n - a.n);
    const first = ranked[0]?.s;
    const second = (ranked.find((x) => shapeOf(x.s) !== (first ? shapeOf(first) : "")) ?? ranked[1])
        ?.s;
    const picks = [first, second].filter((s): s is Section => !!s);
    if (!picks.length) return "";
    const body = picks
        .map(
            (s, i) =>
                `Example ${i + 1} · layout ${shapeOf(s)}:\n${JSON.stringify(cleanSection(s))}`,
        )
        .join("\n\n");
    return heading(
        `Gold-standard ${surface} sections. Match this richness and density`,
        `These are real sections from hand-crafted, published artifacts. Notice how each fills its frame with a clear headline plus purposeful, varied elements (stats, cards, groups, bullets, images). Never a lone line of text on an empty frame:\n\n${body}`,
    );
}

// The site anatomy, hand-authored rather than picked from the corpus: the corpus web artifact
// predates the docked topbar and the band frames, and an exemplar is prompt payload, so this is the
// smallest page that still shows every part. Image srcs are written as PHRASES here on purpose,
// which is the form the section writer is asked for.
const navLink = (label: string, href: string): ElementInstance =>
    fitW(button(label, href, { variant: "ghost", size: "sm" }));

const siteNav = (brand: string, ...items: ElementInstance[]): ElementInstance => ({
    ...row({ align: "center" }, fill(t(brand, "label")), ...items),
    layout: { dock: "top" },
});

const backdrop = (phrase: string, scrim: number): SectionBackground => ({
    kind: "image",
    image: phrase,
    scrim,
});

const SITE: Section[] = [
    section(
        "hero",
        col(
            siteNav(
                "Kestrel",
                fitW(
                    menu(
                        "Product",
                        button("How it works", "#how", { variant: "ghost", size: "sm" }),
                        button("Questions", "#faq", { variant: "ghost", size: "sm" }),
                    ),
                ),
                navLink("Changelog", "https://kestrel.dev/changelog"),
                fitW(
                    button("Start free", "#signup", {
                        variant: "filled",
                        size: "sm",
                        shape: "pill",
                    }),
                ),
            ),
            t("KESTREL", "label"),
            t("Every incident, on one timeline.", "h1"),
            t(
                "Kestrel stitches your alerts, deploys and chat into a single account of what happened, so the review afterwards takes an hour instead of a week.",
                "subtitle",
            ),
            row(
                { align: "center" },
                fitW(button("See how it works", "#how", { size: "lg" })),
                fitW(button("Start free", "#signup", { variant: "outline" })),
            ),
        ),
        {
            background: backdrop(
                "a dim operations room at night, screens glowing, wide shot",
                0.55,
            ),
            frame: { aspect: 2.29 },
        },
    ),
    section(
        "how",
        col(
            t("How it works", "label"),
            t("Three steps, and no new process to run.", "h2"),
            row(
                { align: "start" },
                feature(
                    "Connect",
                    "Point Kestrel at PagerDuty, GitHub and Slack. It reads what is already there.",
                    "01",
                ),
                feature(
                    "Watch",
                    "Every alert, deploy and message lands on one timeline while the incident is still running.",
                    "02",
                ),
                feature(
                    "Review",
                    "The timeline exports as a draft postmortem with the quiet gaps already marked.",
                    "03",
                ),
            ),
        ),
        { background: bgColor("#EFEDE9"), bleed: true },
    ),
    section("interlude", col(t("The account nobody had time to write.", "h2", "center")), {
        background: backdrop("a long empty office corridor at dawn, soft light", 0.5),
        bleed: true,
        frame: { aspect: 3.2 },
    }),
    section(
        "faq",
        col(
            t("Questions", "label"),
            t("Before you connect anything.", "h2"),
            faq(
                "collapsible",
                [
                    [
                        "Does it need an agent?",
                        "No. Kestrel reads the APIs you already pay for, so there is nothing to install in production.",
                    ],
                    [
                        "Who can see an incident?",
                        "Everyone in your workspace by default. A timeline can be locked to its responders instead.",
                    ],
                ],
                true,
            ),
        ),
    ),
    section(
        "signup",
        col(
            t("Start with the incident you remember.", "h2", "center"),
            t(
                "Connect one source and Kestrel rebuilds a timeline you lived through, so you can judge it against your own memory of the night.",
                "subtitle",
                "center",
            ),
            row(
                { align: "center" },
                fitW(button("Start free", "https://kestrel.dev/signup", { size: "lg" })),
            ),
        ),
        { background: bgColor("#1B1D22"), bleed: true },
    ),
    section(
        "footer",
        row(
            { justify: "between", align: "start" },
            fitW(col(t("Kestrel", "h3"), t("Incident timelines for on-call teams.", "caption"))),
            fitW(col(t("PRODUCT", "label"), t("How it works · Changelog · Status", "caption"))),
            fitW(col(t("COMPANY", "label"), t("hello@kestrel.dev", "caption"))),
        ),
    ),
];

// unlike cleanSection, the section-level keys ARE the lesson here, so they stay
function cleanSite(s: Section): unknown {
    return {
        id: s.id,
        root: cleanElement(s.root),
        ...(s.background ? { background: s.background } : {}),
        ...(s.bleed ? { bleed: s.bleed } : {}),
        ...(s.frame ? { frame: s.frame } : {}),
    };
}

export function siteExemplar(): string {
    return heading(
        "A whole site in miniature. Take the anatomy, not the words",
        `Six sections of a small marketing site. Read what each one is doing: the topbar docked inside the first section with its \`#id\` links and one menu, the hero's band \`frame\` over a scrimmed photo, a tinted band of \`feature\` blocks, a slim image interlude, a collapsible \`faq\`, the closing band in its own colour, and a footer row that justifies between. Your page is longer and about something else; these are the shapes it is built from.\n\n${SITE.map(
            (s) => JSON.stringify(cleanSite(s)),
        ).join("\n")}`,
    );
}
