import type { Accessor, Component, JSX } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";

const announceItems = [
    "Now in public beta",
    "One source — three polished views",
    "36 designer themes, one click",
    "Edit once, stays in sync",
    "Decks · docs · sites",
];

const valueProps = [
    "One source → three views",
    "Edit once, always in sync",
    "A real layout engine",
    "36 designer themes",
    "Prompt to polished draft",
    "Export to PDF · PPTX · web",
    "Built for teams",
];

const formatTicker: { word: string; hollow: boolean }[] = [
    { word: "DECK", hollow: false },
    { word: "DOC", hollow: true },
    { word: "SITE", hollow: false },
    { word: "DECK", hollow: true },
    { word: "DOC", hollow: false },
    { word: "SITE", hollow: true },
];

const sourceBlocks = [
    "TITLE BLOCK",
    "STAT · 3.4× GROWTH",
    "CHART · ARR",
    "QUOTE · CUSTOMER",
    "CALLOUT · THE ASK",
];

const viewCards = [
    {
        seed: "galleodeck",
        alt: "Deck view",
        name: "Deck",
        tag: "16:9",
        desc: "Big type, one idea per slide — present live or export to PPTX.",
    },
    {
        seed: "galleodoc",
        alt: "Document view",
        name: "Doc",
        tag: "A4",
        desc: "Flowing columns and footnotes — a leave-behind that reads like print.",
    },
    {
        seed: "galleosite",
        alt: "Website view",
        name: "Site",
        tag: "RESPONSIVE",
        desc: "A scrolling page on your domain — publish in a click, no build step.",
    },
];

const blockTypes = [
    "Text",
    "Image",
    "Chart",
    "Table",
    "Stat",
    "Quote",
    "Diagram",
    "Callout",
    "Bullets",
    "Divider",
];

const features = [
    {
        num: "01",
        title: "A real layout engine",
        body: "True typesetting, not boxes nudged on a canvas. Every block re-flows to fit the format, the column, the theme.",
    },
    {
        num: "02",
        title: "One source, three views",
        body: "Deck, doc, and site come from a single canonical artifact. Change a stat once; it updates everywhere.",
    },
    {
        num: "03",
        title: "36 designer themes",
        body: "Each is a complete system — font trio, color, radius, borders, shadow. One click restyles the whole artifact.",
    },
    {
        num: "04",
        title: "AI first draft",
        body: "Prompt it, or import an outline, and get a finished-feeling draft in seconds — structured, not a wall of text.",
    },
    {
        num: "05",
        title: "High-fidelity export",
        body: "PDF, PPTX, and live web publishing — pixel-faithful to what you see, ready to send or ship.",
    },
    {
        num: "06",
        title: "Built for teams",
        body: "Real-time collaboration, shared workspaces, and folders — so the whole team works from one source of truth.",
    },
];

const themesRowA = [
    "Studio",
    "Press",
    "Noir",
    "Signal",
    "Aura",
    "Canvas",
    "Brut",
    "Neon",
    "Retro",
    "Deco",
    "Swiss",
    "Botanic",
    "Candy",
    "Term",
    "Vapor",
    "Memphis",
    "Blue",
    "Riso",
];

const themesRowB = [
    "Couture",
    "Sunrise",
    "Sumi",
    "Mineral",
    "Dune",
    "Pine",
    "Cobalt",
    "Rose",
    "Mocha",
    "Lagoon",
    "Ember",
    "Pearl",
    "Amethyst",
    "Mint",
    "Rust",
    "Indigo",
    "Manuscript",
    "Carbon",
];

const stats: { value: string; label: string; accent?: boolean }[] = [
    { value: "3-in-1", label: "Deck · doc · site", accent: true },
    { value: "36", label: "Designer themes" },
    { value: "~8s", label: "To first draft" },
    { value: "12k+", label: "Artifacts made" },
];

const logos = [
    "Northwind",
    "Lumen",
    "Atlas Labs",
    "Foundry",
    "Vellum",
    "Meridian",
    "Parallel",
    "Northstar",
    "Hatch",
];

const plans = [
    {
        name: "Free",
        price: "$0",
        per: "/forever",
        blurb: "For trying it out and one-off artifacts.",
        features: [
            "3 active documents",
            "All 36 designer themes",
            "Deck, doc & site views",
            "PDF export (with watermark)",
        ],
        cta: "Get started",
        featured: false,
    },
    {
        name: "Pro",
        price: "$20",
        per: "/month",
        blurb: "For people who care how it looks.",
        features: [
            "Unlimited documents",
            "AI generation & rewrites",
            "High-fidelity PDF + PPTX",
            "Publish to your own domain",
            "No watermark · version history",
        ],
        cta: "Start Pro free",
        featured: true,
    },
    {
        name: "Team",
        price: "$48",
        per: "/user/mo",
        blurb: "For teams shipping from one source.",
        features: [
            "Everything in Pro",
            "Real-time collaboration",
            "Shared workspaces & folders",
            "Brand kit & locked themes",
            "Roles, permissions & SSO",
        ],
        cta: "Talk to us",
        featured: false,
    },
];

const wordmark = [false, true, false, true];

const footerCols = [
    {
        title: "Product",
        links: [
            { label: "Three views", href: "#views" },
            { label: "Features", href: "#features" },
            { label: "Themes", href: "#themes" },
            { label: "Pricing", href: "#pricing" },
        ],
    },
    {
        title: "Company",
        links: [
            { label: "About", href: "#" },
            { label: "Careers", href: "#" },
            { label: "Blog", href: "#" },
            { label: "Changelog", href: "#" },
        ],
    },
    {
        title: "Resources",
        links: [
            { label: "Docs", href: "#" },
            { label: "Templates", href: "#" },
            { label: "Community", href: "#" },
            { label: "Support", href: "#" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy", href: "#" },
            { label: "Terms", href: "#" },
            { label: "Security", href: "#" },
            { label: "Status", href: "#" },
        ],
    },
];

const Strip: Component<{ text: string; sep?: string }> = (props) => (
    <span class="strip">
        {props.text} <span class="star">{props.sep ?? "✺"}</span>
    </span>
);

// group rendered twice (2nd copy aria-hidden) so `web-mq` can translateX(-50%) for a seamless loop
function Marquee<T>(props: {
    items: readonly T[];
    speed: string;
    rev?: boolean;
    pauseable?: boolean;
    fade?: boolean;
    mqClass?: string;
    mqStyle?: JSX.CSSProperties;
    grpStyle?: JSX.CSSProperties;
    children: (item: T, index: Accessor<number>) => JSX.Element;
}): JSX.Element {
    const mqClasses = ["mq", props.fade ? "mq--fade" : "", props.mqClass ?? ""]
        .filter(Boolean)
        .join(" ");
    const rowClasses = ["mq__row", props.rev ? "rev" : "", props.pauseable ? "pauseable" : ""]
        .filter(Boolean)
        .join(" ");
    return (
        <div class={mqClasses} style={props.mqStyle}>
            <div class={rowClasses} style={{ "--mqd": props.speed }}>
                <For each={[0, 1] as const}>
                    {(dup) => (
                        <span
                            class="mq__grp"
                            aria-hidden={dup === 1 ? "true" : undefined}
                            style={props.grpStyle}
                        >
                            <For each={props.items}>{props.children}</For>
                        </span>
                    )}
                </For>
            </div>
        </div>
    );
}

const Wordmark: Component = () => (
    <a href="#top" class="flex items-center gap-2.5">
        <span
            class="grid place-items-center font-display font-black text-lg"
            style={{
                width: "34px",
                height: "34px",
                background: "var(--color-accent)",
                color: "var(--color-onaccent)",
                border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                "border-radius": "10px",
            }}
        >
            G
        </span>
        <span class="font-display font-black text-2xl tracking-tight">Galleo</span>
    </a>
);

// Auth-aware header CTA: / always renders marketing (no redirect), but a signed-in visitor gets "Go to app"
// instead of sign-in. The session cookie is httpOnly, so ask the API. null = still checking → show the
// signed-out CTA (works for everyone; visitors are unauthed far more often than not).
const AuthCta: Component = () => {
    const [authed, setAuthed] = createSignal<boolean | null>(null);
    onMount(async () => {
        try {
            const res = await fetch("/api/me", { credentials: "same-origin" });
            setAuthed(res.ok);
        } catch {
            setAuthed(false);
        }
    });
    return (
        <div class="flex items-center gap-3">
            <Show
                when={authed()}
                fallback={
                    <>
                        <a
                            href="/app/"
                            class="hidden sm:inline lab hover:text-accent transition-colors"
                        >
                            Sign in
                        </a>
                        <a
                            href="/app/"
                            class="btn btn-primary text-sm"
                            style={{ padding: "0.6rem 1.1rem" }}
                        >
                            Start free
                        </a>
                    </>
                }
            >
                <a
                    href="/app/"
                    class="btn btn-primary text-sm"
                    style={{ padding: "0.6rem 1.1rem" }}
                >
                    Go to app →
                </a>
            </Show>
        </div>
    );
};

export const WebsitePage: Component = () => (
    <div class="web h-full w-full overflow-y-auto bg-canvas font-body text-ink">
        <Marquee
            items={announceItems}
            speed="30s"
            pauseable
            mqStyle={{
                background: "var(--color-accent)",
                color: "var(--color-onaccent)",
                "border-bottom": "calc(var(--border-width) * 2) solid var(--color-ink)",
            }}
        >
            {(t) => <Strip text={t} />}
        </Marquee>

        <header
            class="sticky top-0 z-50"
            style={{
                background: "var(--color-canvas)",
                "border-bottom": "calc(var(--border-width) * 2) solid var(--color-ink)",
            }}
        >
            <div class="max-w-[1280px] mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
                <Wordmark />
                <nav class="hidden md:flex items-center gap-8 lab">
                    <a href="#views" class="hover:text-accent transition-colors">
                        Views
                    </a>
                    <a href="#features" class="hover:text-accent transition-colors">
                        Features
                    </a>
                    <a href="#themes" class="hover:text-accent transition-colors">
                        Themes
                    </a>
                    <a href="#pricing" class="hover:text-accent transition-colors">
                        Pricing
                    </a>
                </nav>
                <AuthCta />
            </div>
        </header>

        <section id="top" class="relative overflow-hidden">
            <div
                class="shape ring float hidden md:block"
                style={{
                    width: "120px",
                    height: "120px",
                    top: "90px",
                    right: "6%",
                    "animation-delay": "0.4s",
                }}
            />
            <div
                class="shape disc float hidden md:block"
                style={{
                    width: "34px",
                    height: "34px",
                    top: "240px",
                    left: "5%",
                    "animation-delay": "1.1s",
                }}
            />
            <div
                class="shape cross spin hidden md:block"
                style={{ width: "46px", height: "46px", bottom: "120px", right: "14%" }}
            />
            <div
                class="shape float hidden lg:block"
                style={{ bottom: "60px", left: "8%", "animation-delay": "0.7s" }}
            >
                <svg width="92" height="26" viewBox="0 0 92 26" fill="none">
                    <path
                        d="M2 24L14 4L26 24L38 4L50 24L62 4L74 24L86 4"
                        stroke="var(--color-accent)"
                        stroke-width="5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </div>

            <div class="max-w-[1280px] mx-auto px-5 md:px-8 pt-16 md:pt-24 pb-12 md:pb-16 relative">
                <div
                    class="flex items-center gap-3 mb-7 rise"
                    style={{ "animation-delay": "0.05s" }}
                >
                    <span class="lab text-accent">✺ AI content engine</span>
                    <span class="hidden sm:inline lab text-muted">Est. 2026</span>
                </div>

                <h1 class="display text-[clamp(3rem,11vw,8.4rem)]">
                    <span class="block rise" style={{ "animation-delay": "0.1s" }}>
                        One source.
                    </span>
                    <span class="block rise" style={{ "animation-delay": "0.22s" }}>
                        Three{" "}
                        <span
                            class="relative inline-block"
                            style={{
                                background: "var(--color-accent)",
                                color: "var(--color-onaccent)",
                                padding: "0 0.14em",
                                border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                                transform: "rotate(-1.5deg)",
                            }}
                        >
                            polished
                        </span>
                    </span>
                    <span class="block rise hollow-ink" style={{ "animation-delay": "0.34s" }}>
                        views.
                    </span>
                </h1>

                <div class="mt-9 grid md:grid-cols-12 gap-8 items-end">
                    <p
                        class="md:col-span-7 text-soft text-lg md:text-xl leading-relaxed rise"
                        style={{ "animation-delay": "0.46s" }}
                    >
                        Describe what you need. Galleo generates one canonical artifact that renders
                        three ways — a <strong style={{ color: "var(--color-ink)" }}>deck</strong>,
                        a <strong style={{ color: "var(--color-ink)" }}>document</strong>, and a
                        live <strong style={{ color: "var(--color-ink)" }}>website</strong>. Edit
                        once; every format stays in sync. Real typesetting, not
                        slides-with-textboxes.
                    </p>
                    <div
                        class="md:col-span-5 flex flex-wrap gap-3 md:justify-end rise"
                        style={{ "animation-delay": "0.58s" }}
                    >
                        <a href="/app/" class="btn btn-primary text-base">
                            Start creating free →
                        </a>
                        <a href="#views" class="btn btn-ghost text-base">
                            See it switch
                        </a>
                    </div>
                </div>
            </div>

            <Marquee
                items={valueProps}
                speed="34s"
                fade
                mqStyle={{
                    "border-top": "calc(var(--border-width) * 2) solid var(--color-ink)",
                    "border-bottom": "calc(var(--border-width) * 2) solid var(--color-ink)",
                    background: "var(--color-panel)",
                    padding: "0.9rem 0",
                }}
            >
                {(t) => <Strip text={t} />}
            </Marquee>
        </section>

        <section class="band-ink py-7 md:py-9 overflow-hidden">
            <Marquee items={formatTicker} speed="26s">
                {(f) => (
                    <span class={f.hollow ? "tick hollow-bg" : "tick"}>
                        {f.word}
                        <span class="sep">·</span>
                    </span>
                )}
            </Marquee>
        </section>

        <section id="views" class="max-w-[1280px] mx-auto px-5 md:px-8 py-20 md:py-28">
            <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
                <div>
                    <div class="lab text-accent mb-4">✺ One canonical artifact</div>
                    <h2 class="display text-[clamp(2.2rem,5.5vw,4rem)] max-w-2xl">
                        Write it once.
                        <br />
                        Ship it three ways.
                    </h2>
                </div>
                <p class="text-soft text-base md:text-lg max-w-sm leading-relaxed">
                    Every block — text, image, chart, table, stat, quote, diagram, callout — is a
                    first-class element that re-typesets per format. Switch deck ⇄ doc ⇄ site
                    instantly. No copy-paste, no drift.
                </p>
            </div>

            <div class="grid lg:grid-cols-12 gap-6">
                <div
                    class="lg:col-span-4 card p-6 flex flex-col"
                    style={{
                        background: "var(--color-ink)",
                        color: "var(--color-canvas)",
                        "border-color": "var(--color-ink)",
                    }}
                >
                    <div class="lab" style={{ color: "var(--color-canvas)", opacity: "0.7" }}>
                        The source
                    </div>
                    <div class="mt-4 font-display text-2xl font-bold leading-snug">
                        “Make a launch brief for Project Northwind — vision, traction, the ask.”
                    </div>
                    <div class="mt-6 space-y-2.5">
                        <For each={sourceBlocks}>
                            {(b) => (
                                <div
                                    class="flex items-center gap-3 lab"
                                    style={{ color: "var(--color-canvas)", opacity: "0.85" }}
                                >
                                    <span style={{ color: "var(--color-accent)" }}>■</span> {b}
                                </div>
                            )}
                        </For>
                    </div>
                    <div class="mt-auto pt-6 lab" style={{ color: "var(--color-accent)" }}>
                        ↓ renders as ↓
                    </div>
                </div>

                <div class="lg:col-span-8 grid sm:grid-cols-3 gap-6">
                    <For each={viewCards}>
                        {(v) => (
                            <article class="feat p-3 flex flex-col">
                                <div
                                    class="overflow-hidden"
                                    style={{
                                        border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                                        "border-radius": "calc(var(--radius) * 0.6)",
                                    }}
                                >
                                    <img
                                        src={`https://picsum.photos/seed/${v.seed}/800/520?grayscale`}
                                        alt={v.alt}
                                        class="w-full aspect-[4/3] object-cover"
                                    />
                                </div>
                                <div class="flex items-center justify-between mt-3 px-1">
                                    <span class="font-display font-bold text-lg">{v.name}</span>
                                    <span class="lab text-accent">{v.tag}</span>
                                </div>
                                <p class="text-muted text-sm px-1 mt-1 leading-snug">{v.desc}</p>
                                <span class="feat__bar" />
                            </article>
                        )}
                    </For>
                </div>
            </div>
        </section>

        <section
            class="overflow-hidden py-5"
            style={{
                "border-top": "calc(var(--border-width) * 2) solid var(--color-ink)",
                "border-bottom": "calc(var(--border-width) * 2) solid var(--color-ink)",
                background: "var(--color-panel)",
            }}
        >
            <Marquee items={blockTypes} speed="40s" rev fade>
                {(t) => <Strip text={t} sep="/" />}
            </Marquee>
        </section>

        <section id="features" class="max-w-[1280px] mx-auto px-5 md:px-8 py-20 md:py-28">
            <div class="mb-12 max-w-3xl">
                <div class="lab text-accent mb-4">✺ What's under the hood</div>
                <h2 class="display text-[clamp(2.2rem,5.5vw,4rem)]">
                    Built like a tool that
                    <br />
                    respects the work.
                </h2>
            </div>

            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <For each={features}>
                    {(f) => (
                        <article class="feat p-7">
                            <div class="font-mono text-accent text-sm">{f.num}</div>
                            <h3 class="font-display font-bold text-2xl mt-4">{f.title}</h3>
                            <p class="text-soft mt-2.5 leading-relaxed">{f.body}</p>
                            <span class="feat__bar" />
                        </article>
                    )}
                </For>
            </div>
        </section>

        <section class="band-ink py-20 md:py-28 relative overflow-hidden">
            <div
                class="shape disc float hidden md:block"
                style={{
                    width: "120px",
                    height: "120px",
                    top: "-30px",
                    right: "8%",
                    opacity: "0.9",
                }}
            />
            <div
                class="shape ring spin hidden md:block"
                style={{
                    width: "90px",
                    height: "90px",
                    bottom: "-20px",
                    left: "6%",
                    "border-color": "var(--color-canvas)",
                }}
            />
            <div class="max-w-[1100px] mx-auto px-5 md:px-8 relative">
                <div class="lab mb-7" style={{ color: "var(--color-accent)" }}>
                    ✺ Why we built it
                </div>
                <p class="font-display font-semibold text-[clamp(1.8rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight">
                    AI made a first draft free — and the average deck{" "}
                    <span style={{ color: "var(--color-accent)" }}>worse</span>. The bottleneck
                    moved from <span class="hollow-bg">making</span> to{" "}
                    <span style={{ "border-bottom": "6px solid var(--color-accent)" }}>
                        judging
                    </span>
                    . Galleo is the editor for the judging.
                </p>
                <div class="mt-9 flex flex-wrap items-center gap-4">
                    <a href="/app/" class="btn btn-on-ink text-base">
                        Try the editor →
                    </a>
                    <span class="lab" style={{ color: "var(--color-canvas)", opacity: "0.7" }}>
                        No credit card required
                    </span>
                </div>
            </div>
        </section>

        <section id="themes" class="py-20 md:py-28 overflow-hidden">
            <div class="max-w-[1280px] mx-auto px-5 md:px-8 mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                <div>
                    <div class="lab text-accent mb-4">✺ 36 designer themes</div>
                    <h2 class="display text-[clamp(2.2rem,5.5vw,4rem)] max-w-xl">
                        One click,
                        <br />a whole new look.
                    </h2>
                </div>
                <p class="text-soft text-base md:text-lg max-w-sm leading-relaxed">
                    Fonts, color, radius, borders, shadow — every theme is a full system. This page
                    wears your theme too: it matches whatever design you last picked in the editor.
                </p>
            </div>

            <Marquee items={themesRowA} speed="48s" pauseable fade mqClass="mb-4">
                {(name) => (
                    <span class="pill" style={{ "margin-right": "0.85rem" }}>
                        <span class="dot" />
                        {name}
                    </span>
                )}
            </Marquee>
            <Marquee items={themesRowB} speed="54s" rev pauseable fade>
                {(name) => (
                    <span class="pill" style={{ "margin-right": "0.85rem" }}>
                        <span class="dot" />
                        {name}
                    </span>
                )}
            </Marquee>
        </section>

        <section class="max-w-[1280px] mx-auto px-5 md:px-8 pb-6">
            <div
                class="grid grid-cols-2 lg:grid-cols-4 gap-px"
                style={{
                    background: "var(--color-ink)",
                    border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                    "border-radius": "var(--radius)",
                    overflow: "hidden",
                }}
            >
                <For each={stats}>
                    {(s) => (
                        <div class="p-7 md:p-9" style={{ background: "var(--color-canvas)" }}>
                            <div
                                class={`display text-[clamp(2.4rem,5vw,3.6rem)]${s.accent ? " text-accent" : ""}`}
                            >
                                {s.value}
                            </div>
                            <div class="lab text-muted mt-2">{s.label}</div>
                        </div>
                    )}
                </For>
            </div>
        </section>

        <section class="py-12 overflow-hidden">
            <div class="max-w-[1280px] mx-auto px-5 md:px-8 mb-6">
                <div class="lab text-muted text-center">
                    Teams that care how it looks build with Galleo
                </div>
            </div>
            <Marquee items={logos} speed="44s" pauseable fade grpStyle={{ gap: "0" }}>
                {(name) => (
                    <span
                        class="font-display font-black text-2xl md:text-3xl opacity-60 px-7"
                        style={{ "white-space": "nowrap" }}
                    >
                        {name}
                    </span>
                )}
            </Marquee>
        </section>

        <section class="max-w-[1280px] mx-auto px-5 md:px-8 pb-20 md:pb-28">
            <div class="card p-8 md:p-14 relative overflow-hidden">
                <span
                    class="font-display font-black absolute select-none"
                    style={{
                        "font-size": "14rem",
                        "line-height": "0.7",
                        top: "-1rem",
                        right: "1.5rem",
                        color: "var(--color-accent)",
                        opacity: "0.14",
                    }}
                >
                    ”
                </span>
                <blockquote class="font-display font-semibold text-[clamp(1.5rem,3.6vw,2.6rem)] leading-snug max-w-4xl relative">
                    We replaced three tools with one. The pitch deck, the leave-behind doc, and the
                    launch microsite now come from a single Galleo file — and they finally{" "}
                    <span class="text-accent">look the same</span>.
                </blockquote>
                <div class="mt-8 flex items-center gap-4 relative">
                    <img
                        src="https://picsum.photos/seed/galleoavatar/120/120?grayscale"
                        alt=""
                        class="w-12 h-12 rounded-full object-cover"
                        style={{ border: "calc(var(--border-width) * 2) solid var(--color-ink)" }}
                    />
                    <div>
                        <div class="font-bold">Priya Natarajan</div>
                        <div class="lab text-muted mt-1">Head of Brand · Meridian</div>
                    </div>
                </div>
            </div>
        </section>

        <section id="pricing" class="band-ink py-20 md:py-28">
            <div class="max-w-[1280px] mx-auto px-5 md:px-8">
                <div class="text-center mb-14">
                    <div class="lab mb-4" style={{ color: "var(--color-accent)" }}>
                        ✺ Pricing
                    </div>
                    <h2 class="display text-[clamp(2.2rem,5.5vw,4rem)]">
                        Start free.
                        <br />
                        Upgrade when it ships.
                    </h2>
                </div>

                <div class="grid md:grid-cols-3 gap-6 items-start">
                    <For each={plans}>
                        {(plan) => (
                            <Show
                                when={plan.featured}
                                fallback={
                                    <div
                                        class="p-8 flex flex-col"
                                        style={{
                                            background: "var(--color-canvas)",
                                            color: "var(--color-ink)",
                                            border: "calc(var(--border-width) * 2) solid var(--color-canvas)",
                                            "border-radius": "var(--radius)",
                                        }}
                                    >
                                        <div class="lab text-muted">{plan.name}</div>
                                        <div class="mt-4 flex items-end gap-1">
                                            <span class="display text-5xl">{plan.price}</span>
                                            <span class="text-muted mb-1">{plan.per}</span>
                                        </div>
                                        <p class="text-soft mt-3 leading-relaxed">{plan.blurb}</p>
                                        <ul class="mt-6 space-y-3 text-soft text-[15px]">
                                            <For each={plan.features}>
                                                {(item) => (
                                                    <li class="flex gap-3">
                                                        <span class="text-accent">✦</span> {item}
                                                    </li>
                                                )}
                                            </For>
                                        </ul>
                                        <a href="/app/" class="btn btn-ghost mt-8 justify-center">
                                            {plan.cta}
                                        </a>
                                    </div>
                                }
                            >
                                <div
                                    class="p-8 flex flex-col relative"
                                    style={{
                                        background: "var(--color-accent)",
                                        color: "var(--color-onaccent)",
                                        border: "calc(var(--border-width) * 2) solid var(--color-canvas)",
                                        "border-radius": "var(--radius)",
                                        "box-shadow": "8px 8px 0 var(--color-canvas)",
                                    }}
                                >
                                    <span
                                        class="absolute lab"
                                        style={{
                                            top: "-0.875rem",
                                            left: "2rem",
                                            background: "var(--color-canvas)",
                                            color: "var(--color-ink)",
                                            padding: "0.45rem 0.8rem",
                                            border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                                            "border-radius": "999px",
                                        }}
                                    >
                                        Most popular
                                    </span>
                                    <div class="lab" style={{ opacity: "0.8" }}>
                                        {plan.name}
                                    </div>
                                    <div class="mt-4 flex items-end gap-1">
                                        <span class="display text-5xl">{plan.price}</span>
                                        <span class="mb-1" style={{ opacity: "0.8" }}>
                                            {plan.per}
                                        </span>
                                    </div>
                                    <p class="mt-3 leading-relaxed" style={{ opacity: "0.9" }}>
                                        {plan.blurb}
                                    </p>
                                    <ul class="mt-6 space-y-3 text-[15px]">
                                        <For each={plan.features}>
                                            {(item) => (
                                                <li class="flex gap-3">
                                                    <span>✦</span> {item}
                                                </li>
                                            )}
                                        </For>
                                    </ul>
                                    <a
                                        href="/app/"
                                        class="btn mt-8 justify-center"
                                        style={{
                                            background: "var(--color-ink)",
                                            color: "var(--color-canvas)",
                                            border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                                        }}
                                    >
                                        {plan.cta}
                                    </a>
                                </div>
                            </Show>
                        )}
                    </For>
                </div>
            </div>
        </section>

        <section class="relative overflow-hidden py-20 md:py-32">
            <div
                class="shape ring float hidden md:block"
                style={{
                    width: "100px",
                    height: "100px",
                    top: "50px",
                    left: "8%",
                    "animation-delay": "0.5s",
                }}
            />
            <div
                class="shape disc spin hidden md:block"
                style={{
                    width: "40px",
                    height: "40px",
                    top: "90px",
                    right: "12%",
                    "border-radius": "0",
                }}
            />
            <div class="max-w-[1100px] mx-auto px-5 md:px-8 text-center relative">
                <div class="lab text-accent mb-6">✺ Ready when you are</div>
                <h2 class="display text-[clamp(2.6rem,9vw,7rem)]">
                    Make it once.
                    <br />
                    <span class="text-accent">Ship it everywhere.</span>
                </h2>
                <p class="text-soft text-lg md:text-xl mt-7 max-w-2xl mx-auto leading-relaxed">
                    Decks, docs, and sites from one canonical artifact. The editor for people who
                    care how it looks.
                </p>
                <div class="mt-10 flex flex-wrap gap-4 justify-center">
                    <a
                        href="/app/"
                        class="btn btn-primary text-lg"
                        style={{ padding: "1.1rem 2rem" }}
                    >
                        Start creating — it's free →
                    </a>
                    <a
                        href="#views"
                        class="btn btn-ghost text-lg"
                        style={{ padding: "1.1rem 2rem" }}
                    >
                        Watch the demo
                    </a>
                </div>
            </div>
        </section>

        <Marquee
            items={wordmark}
            speed="30s"
            mqClass="band-ink py-6"
            mqStyle={{
                "border-top": "calc(var(--border-width) * 2) solid var(--color-ink)",
                "border-bottom": "calc(var(--border-width) * 2) solid var(--color-ink)",
            }}
        >
            {(hollow) => (
                <span class={hollow ? "tick hollow-bg" : "tick"}>
                    Galleo
                    <span class="sep">✺</span>
                </span>
            )}
        </Marquee>

        <footer class="max-w-[1280px] mx-auto px-5 md:px-8 py-16 md:py-20">
            <div class="grid md:grid-cols-12 gap-10">
                <div class="md:col-span-4">
                    <Wordmark />
                    <p class="text-soft mt-5 max-w-xs leading-relaxed">
                        One source. Three polished views. The editor for people who care how it
                        looks.
                    </p>
                    <div class="mt-6 flex flex-wrap gap-2">
                        <span class="pill">
                            <span class="dot" />
                            Deck
                        </span>
                        <span class="pill">
                            <span class="dot" />
                            Doc
                        </span>
                        <span class="pill">
                            <span class="dot" />
                            Site
                        </span>
                    </div>
                </div>
                <For each={footerCols}>
                    {(col) => (
                        <nav class="md:col-span-2">
                            <div class="lab text-muted mb-4">{col.title}</div>
                            <ul class="space-y-3 text-soft">
                                <For each={col.links}>
                                    {(l) => (
                                        <li>
                                            <a
                                                href={l.href}
                                                class="hover:text-accent transition-colors"
                                            >
                                                {l.label}
                                            </a>
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </nav>
                    )}
                </For>
            </div>

            <div
                class="mt-14 pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 lab text-muted"
                style={{ "border-top": "calc(var(--border-width) * 2) solid var(--color-ink)" }}
            >
                <span>© 2026 Galleo — Decks, docs & sites from one source.</span>
                <span>Made for people who care how it looks ✺</span>
            </div>
        </footer>
    </div>
);
