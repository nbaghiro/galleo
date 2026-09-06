import type { Accessor, Component, JSX } from "solid-js";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { THEME_LIST } from "@themes";
import { PLAN_ORDER, PLANS } from "@model/billing";
import { TEMPLATE_INDEX } from "@model/templates";
import { listElements } from "@elements/spec";
import { capture } from "@ui/analytics";
// the marketing page paints real artifacts through the real engine, so it needs the element
// registry: without this side-effect import the solver has no spec for a text or media
// element and lays every one out as a bare block
import "@elements/register";
import { ArtifactPlate, plateGeometry } from "@ui/section";
import { showcaseFor, type ShowcasePiece } from "./showcase";
import type { ArtifactContent } from "@model/artifact";

// Which placement earned the account. The landing itself is a $pageview carrying the referrer and
// the click id; this is the click that leaves for signup, so the two together close the loop from
// an ad to a paid plan.
const ctaClicked = (placement: string) => (): void => {
    capture("signup_cta_clicked", { placement }, { beacon: true });
};

// the marketing "N designer themes" claim, so it cannot drift from the theme library
const THEME_COUNT = THEME_LIST.length;

const announceItems = [
    "One source, three views",
    `${THEME_COUNT} designer themes, one click`,
    "Edit once, stays in sync",
    "Decks · docs · sites",
];

const valueProps = [
    "One source → three views",
    "Edit once, always in sync",
    "A real layout engine",
    `${THEME_COUNT} designer themes`,
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

// The three shapes one artifact takes. Rendered from a single piece so the claim is literally true:
// it is the same content in all three, not three different documents photographed separately.
// a strip cell is bigger than a library card, so it wants more head room than
// PLATE_PAD_TOP: at 14 the pieces ran off the top edge of the frame
const STRIP_PAD_TOP = 26;

const VIEW_PIECE: ShowcasePiece = showcaseFor("deck")[0]!;
const VIEWS: { format: ShowcasePiece["format"]; name: string; tag: string; desc: string }[] = [
    {
        format: "deck",
        name: "Deck",
        tag: "16:9",
        desc: "Big type, one idea per slide. Present live, or export to PPTX.",
    },
    {
        format: "doc",
        name: "Doc",
        tag: "A4",
        desc: "Flowing columns and footnotes. A leave-behind that reads like print.",
    },
    {
        format: "web",
        name: "Site",
        tag: "RESPONSIVE",
        desc: "A scrolling page on your domain. Publish in one click, with no build step.",
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

// Counted from the registries the editor reads, never typed. The two this replaced ("~8s to
// first draft", "12k+ artifacts made") were invented, and a landing page may not invent numbers.
const stats: { value: string; label: string; accent?: boolean }[] = [
    { value: "3-in-1", label: "Deck · doc · site", accent: true },
    { value: String(THEME_COUNT), label: "Designer themes" },
    { value: String(TEMPLATE_INDEX.length), label: "Starters" },
    { value: String(listElements().length), label: "Elements" },
];

// Derived from @model/billing, never retyped: the table drifted to a $48 "Team" tier while the
// product sold Premium at $99, and promised a Pro trial that does not exist.
const plans = PLAN_ORDER.map((id) => PLANS[id]).map((p) => ({
    name: p.name,
    price: `$${p.billing.priceMonthly}`,
    // every price is per seat; a solo plan is one seat, so it reads as a plain monthly price
    per:
        p.billing.priceMonthly === 0
            ? "/forever"
            : p.billing.maxSeats > 1
              ? "/seat/month"
              : "/month",
    blurb: p.tagline,
    features: p.highlights,
    cta: p.billing.priceMonthly === 0 ? "Get started" : `Start ${p.name}`,
    href: "/signup",
    featured: !!p.badge,
}));

const wordmark = [false, true, false, true];

const footerCols = [
    {
        title: "Product",
        links: [
            { label: "Three views", href: "#views" },
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
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
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

/**
 * An artifact plate that fits whatever box it is given.
 *
 * ArtifactPlate draws at an exact pixel width, so a hardcoded one overflows its container the
 * moment a border or a breakpoint changes the box: the format cards asked for 236px inside a 224px
 * hole and the artifact hung off the right edge. Measuring means the plate is correct at every
 * width instead of at the one it was tuned against.
 */
const FitPlate: Component<{
    content: ArtifactContent;
    theme: string;
    /** head margin in drawn px; the backdrop still fills the box behind it */
    padTop?: number;
}> = (props) => {
    let box!: HTMLDivElement;
    const [w, setW] = createSignal(0);
    onMount(() => {
        const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
        ro.observe(box);
        onCleanup(() => ro.disconnect());
    });
    // the shared rule, so a deck, a doc and a site drawn in identical boxes still look like three
    // different formats rather than three copies of the same page
    const geom = (): { width: number; layoutWidth: number; padTop: number } =>
        plateGeometry(props.content.format, w(), props.padTop);
    return (
        // A rendered artifact is real content, so its links are real links: 283 of this page's 314
        // tab stops were anchors inside the pieces, ahead of the actual call to action. Here they
        // are illustration, so the subtree is taken out of the tab order and out of the
        // accessibility tree entirely. `pointer-events: none` does neither.
        <div ref={box} class="flex h-full w-full justify-center" inert aria-hidden="true">
            <Show when={w() > 0}>
                <ArtifactPlate
                    content={props.content}
                    themeId={props.theme}
                    width={geom().width}
                    layoutWidth={geom().layoutWidth}
                    padTop={geom().padTop}
                    // the plate paints six sections unless told otherwise, and a card on a large
                    // display is tall enough to run out of artifact before it runs out of box
                    depth={props.content.sections.length}
                />
            </Show>
        </div>
    );
};

/**
 * Real artifacts orbiting the hero copy.
 *
 * Each card is an ArtifactPlate, so these are the pieces themselves rather than pictures of them,
 * and they wear the reader's theme.
 *
 * Two rules, both learned the hard way. They live in the margins either side of the centred column
 * and never cross into it: cards tucked into whatever corner the type left over is what made every
 * previous arrangement feel crowded. And a few of them are blurred rather than dimmed, which is
 * what puts a card behind another card. Fading toward the page colour only makes it grey.
 */
type Orbiter = {
    piece: ShowcasePiece;
    /** percentage of the section, so the ring holds its shape as the viewport changes */
    top: number;
    side: "left" | "right";
    inset: number;
    rotate: number;
    scale: number;
    soft?: boolean;
};

const ORBIT: Orbiter[] = [
    { piece: showcaseFor("web")[0]!, top: 6, side: "left", inset: 7, rotate: -9, scale: 1 },
    { piece: showcaseFor("doc")[1]!, top: 40, side: "left", inset: 1, rotate: 6, scale: 0.86 },
    { piece: showcaseFor("deck")[2]!, top: 70, side: "left", inset: 9, rotate: -4, scale: 0.94 },
    { piece: showcaseFor("deck")[1]!, top: 4, side: "right", inset: 9, rotate: 8, scale: 0.92 },
    { piece: showcaseFor("web")[2]!, top: 38, side: "right", inset: 1, rotate: -7, scale: 1 },
    { piece: showcaseFor("doc")[3]!, top: 71, side: "right", inset: 8, rotate: 5, scale: 0.88 },
    // Out of focus and set well inside the sharp ring, close enough to the copy to fill the gap
    // between the two. Pushed out to the edges they stopped doing anything; this is the depth the
    // arrangement was missing, and being unreadable is the point of them.
    {
        piece: showcaseFor("doc")[0]!,
        top: 22,
        side: "left",
        inset: 20,
        rotate: 4,
        scale: 1.15,
        soft: true,
    },
    {
        piece: showcaseFor("web")[1]!,
        top: 56,
        side: "right",
        inset: 19,
        rotate: -6,
        scale: 1.2,
        soft: true,
    },
];

/**
 * A ring needs a margin either side of the centred column to live in, and on a phone the copy is
 * the full width, so the arrangement cannot simply shrink: it is replaced by a fan below the copy.
 * A fan only needs the width of its widest card, which is the one thing a narrow screen has.
 *
 * The breakpoint is a signal rather than a CSS `display` toggle because a hidden FitPlate measures
 * a zero-width box and paints nothing, so a CSS-only switch would mount eight empty plates on a
 * phone and wait for a resize to fill them. One arrangement exists at a time.
 */
const RING_MIN = 1180;
const ringQuery = window.matchMedia(`(min-width: ${RING_MIN}px)`);
const [wide, setWide] = createSignal(ringQuery.matches);
ringQuery.addEventListener("change", (e) => setWide(e.matches));

type Fanned = {
    piece: ShowcasePiece;
    /** offset from centre, as a percentage of the card's own width, so it scales with the card */
    shift: number;
    /** px below the top of the fan, which is what gives the arc its rise and fall */
    top: number;
    rotate: number;
    scale: number;
    z: number;
};

// One per format, so the fan carries the same "three views" claim the headline makes, with the
// document in front because it is the format that survives being shown small. No blurred card
// behind these: the ring uses one to fill the gap between itself and the copy, but a fan overlaps
// its own cards, and behind the front one all a soft card shows is a fringe that reads as a smudge.
const FAN: Fanned[] = [
    { piece: showcaseFor("deck")[2]!, shift: -52, top: 30, rotate: -12, scale: 0.9, z: 1 },
    { piece: showcaseFor("web")[0]!, shift: 52, top: 25, rotate: 11, scale: 0.9, z: 1 },
    { piece: showcaseFor("doc")[1]!, shift: 0, top: 10, rotate: -2, scale: 1, z: 2 },
];

const PlateFan: Component<{ theme: string }> = (props) => (
    <div class="fan" aria-hidden="true">
        <For each={FAN}>
            {(f) => (
                <div
                    class="fan__card"
                    style={{
                        top: `${f.top}px`,
                        "z-index": f.z,
                        transform: `translateX(calc(-50% + ${f.shift}%)) rotate(${f.rotate}deg) scale(${f.scale})`,
                    }}
                >
                    <FitPlate
                        content={{ ...f.piece.content, theme: props.theme }}
                        theme={props.theme}
                        padTop={8}
                    />
                </div>
            )}
        </For>
    </div>
);

const PlateOrbit: Component<{ theme: string }> = (props) => (
    <div class="orbit" aria-hidden="true">
        <For each={ORBIT}>
            {(o) => (
                <div
                    class={`orbit__card${o.soft ? " orbit__card--soft" : ""}`}
                    // Static keys: Solid resolves a style object's keys at compile time, so a
                    // computed one (`[o.side]`) is dropped without an error and every card ends up
                    // stacked at the left edge.
                    style={{
                        top: `${o.top}%`,
                        left: o.side === "left" ? `${o.inset}%` : undefined,
                        right: o.side === "right" ? `${o.inset}%` : undefined,
                        transform: `rotate(${o.rotate}deg) scale(${o.scale})`,
                    }}
                >
                    <FitPlate
                        content={{ ...o.piece.content, theme: props.theme }}
                        theme={props.theme}
                        padTop={10}
                    />
                </div>
            )}
        </For>
    </div>
);

/**
 * A strip of real artifacts, painted rather than photographed.
 *
 * Every cell is an ArtifactPlate, the same component the library cards and the onboarding previews
 * use, so what scrolls past is the product's own rendering. Three things follow from that and none
 * of them are true of a wall of PNGs: it costs tens of kilobytes instead of megabytes, the layout is
 * solved at the reader's own device pixel ratio, and the pieces re-theme with the page, because the
 * active app theme is handed to the plate instead of being baked into an image months ago.
 */
const LiveStrip: Component<{
    pieces: ShowcasePiece[];
    theme: string;
    /** drawn cell size; the plate scales its own layout width down to this */
    w: number;
    h: number;
    /**
     * Drawn pixels per second, not a duration.
     *
     * A marquee's duration is the time to travel one group's width, and the three groups are
     * different widths, so equal-looking durations were never equal speeds: 72s/86s/78s worked out
     * as 24.4, 14.9 and 20.5 px/s, and the doc strip crawled at forty per cent of the deck's pace.
     * Stating the pace and deriving the duration keeps them in step, and stays right if a piece is
     * added or a cell is resized.
     */
    pace: number;
    reverse?: boolean;
}> = (props) => {
    const GAP = 20; // matches grpStyle's 1.25rem gap

    // Marquee repeats the items itself until a group covers the viewport, so the pace is stated
    // against one pass of the real pieces and stays right however many times it repeats them.
    const seconds = (): string =>
        `${((props.pieces.length * (props.w + GAP)) / props.pace).toFixed(1)}s`;
    const cell = (p: ShowcasePiece): JSX.Element => (
        <figure
            class="feat shrink-0 overflow-hidden"
            style={{
                width: `${props.w}px`,
                height: `${props.h}px`,
                // A cell is a crop of something longer, and the pieces are different lengths, so
                // some end inside the box and leave the backdrop showing under a hard horizontal
                // edge that reads as a rendering fault. The library cards fade their foot for the
                // same reason; this is that device.
                "mask-image": "linear-gradient(180deg,#000 82%,transparent 100%)",
                "-webkit-mask-image": "linear-gradient(180deg,#000 82%,transparent 100%)",
            }}
        >
            <FitPlate
                content={{ ...p.content, theme: props.theme }}
                theme={props.theme}
                padTop={STRIP_PAD_TOP}
            />
        </figure>
    );
    return (
        <Marquee
            items={props.pieces}
            speed={seconds()}
            rev={props.reverse}
            pauseable
            fade
            mqClass="mq--lift"
            grpStyle={{ gap: "1.25rem", "padding-right": "1.25rem" }}
        >
            {cell}
        </Marquee>
    );
};

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

    /**
     * The row holds two groups and slides by exactly one group's width, so a group narrower than
     * the viewport leaves an empty tail at the end of every cycle. Every marquee here was short on
     * a wide display: the theme rows by 500px at 2560, the footer wordmark by 840, the document
     * strip by 1280.
     *
     * Repeating the items until a group covers the viewport fixes all of them. The width has to be
     * measured rather than derived, because an item's width is whatever the caller renders, and a
     * word is not a card.
     */
    let group: HTMLSpanElement | undefined;
    const [reps, setReps] = createSignal(1);
    onMount(() => {
        const fit = (): void => {
            const width = group?.getBoundingClientRect().width ?? 0;
            const pass = width / reps();
            // exactly enough: the row travels one group, so a group equal to the viewport already
            // covers it. The `+ 1` this used to carry bought a whole extra pass of plates for
            // nothing, and the edge fade hides any sub-pixel shortfall.
            if (pass > 0) setReps(Math.max(1, Math.ceil(window.innerWidth / pass)));
        };
        fit();
        window.addEventListener("resize", fit, { passive: true });
        onCleanup(() => window.removeEventListener("resize", fit));
    });
    const shown = (): readonly T[] =>
        reps() <= 1 ? props.items : Array.from({ length: reps() }, () => props.items).flat();

    /**
     * `speed` is the time to cross one pass of the caller's items, which is what it meant when a
     * group held exactly one pass. Repeating widens the group, and the animation always travels a
     * whole group, so the duration has to grow with it or every marquee runs `reps` times faster
     * than it was asked to.
     */
    const duration = (): string => `${(parseFloat(props.speed) || 40) * reps()}s`;
    return (
        <div class={mqClasses} style={props.mqStyle}>
            <div class={rowClasses} style={{ "--mqd": duration() }}>
                <For each={[0, 1] as const}>
                    {(dup) => (
                        <span
                            ref={(el) => {
                                if (dup === 0) group = el;
                            }}
                            class="mq__grp"
                            aria-hidden={dup === 1 ? "true" : undefined}
                            style={props.grpStyle}
                        >
                            <For each={shown()}>{props.children}</For>
                        </span>
                    )}
                </For>
            </div>
        </div>
    );
}

// `href` so the legal pages, which have no #top of their own, can point it back at the landing
export const Wordmark: Component<{ href?: string }> = (props) => (
    <a href={props.href ?? "#top"} class="flex items-center gap-2.5">
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

/**
 * Whether this visitor is signed in. The session cookie is httpOnly, so it has to be asked for, and
 * `null` means still asking, which reads as signed out until it resolves.
 *
 * Module level and fetched once: the nav and the hero both need the answer, and two components each
 * running their own check would ask /api/me twice on every page load and could disagree for a frame.
 */
const [authed, setAuthed] = createSignal<boolean | null>(null);
let asked = false;
function askAuth(): void {
    if (asked) return;
    asked = true;
    void (async () => {
        try {
            const res = await fetch("/api/me", { credentials: "same-origin" });
            setAuthed(res.ok);
        } catch {
            setAuthed(false);
        }
    })();
}

export const AuthCta: Component = () => {
    onMount(askAuth);
    return (
        <div class="flex items-center gap-3">
            <Show
                when={authed()}
                fallback={
                    <>
                        <a
                            href="/login"
                            class="hidden sm:inline lab hover:text-accent transition-colors"
                        >
                            Sign in
                        </a>
                        <a
                            href="/signup"
                            class="btn btn-primary text-sm"
                            onClick={ctaClicked("nav")}
                            style={{ padding: "0.6rem 1.1rem" }}
                        >
                            Start free
                        </a>
                    </>
                }
            >
                <a href="/" class="btn btn-primary text-sm" style={{ padding: "0.6rem 1.1rem" }}>
                    Go to app →
                </a>
            </Show>
        </div>
    );
};

// The active app theme, read once by main.tsx. The chrome already recolours through the CSS vars
// it sets on the root; the live artifacts need the id itself, because a plate resolves tokens
// rather than reading vars.
export const WebsitePage: Component<{ theme: string }> = (props) => (
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
            {/* Centred, with the work orbiting it.
                Left-aligned, the headline took the full measure and the cards had to live in
                whatever corner was left, which is why they kept fighting the type however they were
                nudged. A centred column leaves a real margin on both sides, and the pieces sit in
                it instead of under the words. */}
            <Show when={wide()}>
                <PlateOrbit theme={props.theme} />
            </Show>
            <div class="max-w-[1280px] mx-auto px-5 md:px-8 pt-20 md:pt-28 pb-20 md:pb-28 relative z-raised">
                <div class="mx-auto max-w-[54rem] text-center">
                    <span class="hero-chip rise" style={{ "animation-delay": "0.05s" }}>
                        <span class="lab text-accent">✺ AI content engine</span>
                    </span>

                    <h1 class="display mt-7 text-[clamp(2.6rem,6.4vw,5.2rem)]">
                        <span class="block rise" style={{ "animation-delay": "0.12s" }}>
                            One source.
                        </span>
                        <span class="block rise" style={{ "animation-delay": "0.24s" }}>
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
                            </span>{" "}
                            <span class="hollow-ink">views.</span>
                        </span>
                    </h1>

                    <p
                        class="mt-7 mx-auto max-w-[46rem] text-soft text-lg leading-relaxed rise"
                        style={{ "animation-delay": "0.4s" }}
                    >
                        Describe what you need and Galleo writes one canonical artifact that renders
                        three ways: a <strong style={{ color: "var(--color-ink)" }}>deck</strong>, a{" "}
                        <strong style={{ color: "var(--color-ink)" }}>document</strong>, and a live{" "}
                        <strong style={{ color: "var(--color-ink)" }}>website</strong>. Edit once;
                        every format stays in sync.
                    </p>

                    <div
                        class="mt-9 flex flex-wrap justify-center gap-3 rise"
                        style={{ "animation-delay": "0.52s" }}
                    >
                        {/* Someone already signed in does not need to be sold a free trial; send
                            them to their work, the way the nav does. */}
                        <Show
                            when={authed()}
                            fallback={
                                <a
                                    href="/signup"
                                    onClick={ctaClicked("hero")}
                                    class="btn btn-primary text-base"
                                >
                                    Start creating free →
                                </a>
                            }
                        >
                            <a href="/" class="btn btn-primary text-base">
                                Open your library →
                            </a>
                        </Show>
                    </div>
                    <p class="mt-5 lab text-muted rise" style={{ "animation-delay": "0.6s" }}>
                        <Show when={authed()} fallback="Free to start · no card">
                            You are signed in
                        </Show>
                    </p>

                    {/* Below the call to action, never above it: the hero already fills a phone
                        screen, and the pieces are the reward for scrolling rather than the thing
                        standing between the reader and the button. */}
                    <Show when={!wide()}>
                        <PlateFan theme={props.theme} />
                    </Show>
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
                    Every block, from text and image to chart, table, stat, quote, diagram and
                    callout, is a first-class element that re-typesets per format. Switch deck ⇄ doc
                    ⇄ site instantly. No copy-paste, no drift.
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
                        “Make a launch brief for Project Northwind: vision, traction, the ask.”
                    </div>
                    <div class="mt-6 space-y-2.5">
                        <For each={sourceBlocks}>
                            {(b) => (
                                <div
                                    class="flex items-center gap-3 lab"
                                    style={{ color: "var(--color-canvas)", opacity: "0.85" }}
                                >
                                    <span style={{ color: "var(--color-canvas)" }}>■</span> {b}
                                </div>
                            )}
                        </For>
                    </div>
                    <div class="mt-auto pt-6 lab" style={{ color: "var(--color-canvas)" }}>
                        ↓ renders as ↓
                    </div>
                </div>

                {/* the same artifact painted in all three formats, live. It was three greyscale
                    stock photographs from a third-party CDN, which is a strange thing for a design
                    tool to show instead of its own output. */}
                <div class="lg:col-span-8 grid sm:grid-cols-3 gap-6">
                    <For each={VIEWS}>
                        {(v) => (
                            <article class="feat p-3 flex flex-col">
                                <div
                                    class="overflow-hidden"
                                    style={{
                                        border: "calc(var(--border-width) * 2) solid var(--color-ink)",
                                        "border-radius": "calc(var(--radius) * 0.6)",
                                        height: "220px",
                                        // same crop treatment as the strips: a card shows the top
                                        // of a whole piece, so it fades out rather than stopping
                                        "mask-image":
                                            "linear-gradient(180deg,#000 84%,transparent 100%)",
                                        "-webkit-mask-image":
                                            "linear-gradient(180deg,#000 84%,transparent 100%)",
                                    }}
                                >
                                    <FitPlate
                                        content={{
                                            ...VIEW_PIECE.content,
                                            format: v.format,
                                            theme: props.theme,
                                        }}
                                        theme={props.theme}
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
                <div class="lab mb-7">✺ Why we built it</div>
                <p class="font-display font-semibold text-[clamp(1.8rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight">
                    AI made a first draft free, and the average deck{" "}
                    <span class="mark-accent">worse</span>. The bottleneck moved from{" "}
                    <span class="hollow-bg">making</span> to{" "}
                    <span style={{ "border-bottom": "6px solid var(--color-canvas)" }}>
                        judging
                    </span>
                    . Galleo is the editor for the judging.
                </p>
                <div class="mt-9 flex flex-wrap items-center gap-4">
                    <a
                        href="/signup"
                        onClick={ctaClicked("midpage")}
                        class="btn btn-on-ink text-base"
                    >
                        Try the editor →
                    </a>
                    <span class="lab" style={{ color: "var(--color-canvas)", opacity: "0.7" }}>
                        No credit card required
                    </span>
                </div>
            </div>
        </section>

        {/* Three strips of real pieces, one per format, painted live.
            This replaced a marquee of nine invented company names presented as customers and a
            testimonial from nobody. We have no customers to name yet, and the work is the only
            proof we actually have. */}
        <section class="py-16 md:py-24 overflow-hidden">
            <div class="max-w-[1280px] mx-auto px-5 md:px-8 mb-10">
                <div class="lab text-accent mb-4">✺ Made with Galleo</div>
                <h2 class="sec-title text-3xl md:text-5xl max-w-[18ch]">
                    Every one of these is
                    <br />
                    rendering as you scroll.
                </h2>
                <p class="text-muted mt-5 max-w-[56ch] leading-relaxed">
                    Not screenshots. The strips below are painted in your browser by the same engine
                    the editor runs, so they wear whatever theme you last picked rather than the one
                    they were made in.
                </p>
            </div>

            <div class="lab text-muted max-w-[1280px] mx-auto px-5 md:px-8 mb-3">As a deck</div>
            <LiveStrip pieces={showcaseFor("deck")} theme={props.theme} w={420} h={264} pace={26} />

            <div class="lab text-muted max-w-[1280px] mx-auto px-5 md:px-8 mt-10 mb-3">
                As a document
            </div>
            <LiveStrip
                pieces={showcaseFor("doc")}
                theme={props.theme}
                w={300}
                h={380}
                pace={24}
                reverse
            />

            <div class="lab text-muted max-w-[1280px] mx-auto px-5 md:px-8 mt-10 mb-3">
                As a site
            </div>
            <LiveStrip pieces={showcaseFor("web")} theme={props.theme} w={380} h={300} pace={25} />
        </section>

        <section id="themes" class="py-20 md:py-28 overflow-hidden">
            <div class="max-w-[1280px] mx-auto px-5 md:px-8 mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                <div>
                    <div class="lab text-accent mb-4">✺ {THEME_COUNT} designer themes</div>
                    <h2 class="display text-[clamp(2.2rem,5.5vw,4rem)] max-w-xl">
                        One click,
                        <br />a whole new look.
                    </h2>
                </div>
                <p class="text-soft text-base md:text-lg max-w-sm leading-relaxed">
                    Fonts, color, radius, borders, shadow: every theme is a full system. This page
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

        <section id="pricing" class="band-ink py-20 md:py-28">
            <div class="max-w-[1280px] mx-auto px-5 md:px-8">
                <div class="text-center mb-14">
                    <div class="lab mb-4">✺ Pricing</div>
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
                                        <a
                                            href={plan.href}
                                            class="btn btn-ghost mt-8 justify-center"
                                        >
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
                                        href={plan.href}
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
                        href="/signup"
                        class="btn btn-primary text-lg"
                        onClick={ctaClicked("footer")}
                        style={{ padding: "1.1rem 2rem" }}
                    >
                        Start creating, free →
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
                <span>© 2026 Galleo · Decks, docs and sites from one source.</span>
                <span>Made for people who care how it looks ✺</span>
            </div>
        </footer>
    </div>
);
