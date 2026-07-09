import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Section, ElementInstance } from "@model/artifact";
import { GRID_TEMPLATES } from "@model/elements";
import { resolveProfile } from "@engine/profile";
import { resolveTheme, themeCssVars, mix } from "@themes";
import { paint } from "@canvas/render/backends";
import { measureText, layoutSection, layoutSectionSkeleton } from "@canvas/render/commands";
import { appTheme } from "../../theme";
import { CloseIcon } from "@ui/icons";
import { MiniCanvas } from "../../components/previews";
import { Button, IconButton, Spinner, Eyebrow } from "@ui/button";
import { Segmented, TextArea } from "@ui/inputs";
import { Modal } from "@ui/overlay";
import { StatusDot } from "@ui/status";
import {
    gen,
    generateOpen,
    closeGenerate,
    startRealSession,
    saveGenerated,
    placedSections,
    type SectionSlot,
    type Surface,
} from "./session";

// The generate modal — the single artifact-generation surface, mounted once in the app shell (like the
// theme editor). It opens on a brief (left rail: prompt + format + length), runs a real generate turn,
// and paints each section with the SAME engine the editor uses (real section skeleton → render) in the
// right preview, one at a time as content streams in. The modal wears the theme the artifact will use.

const reduced = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const PLACEHOLDER =
    "A launch deck for a calm operating system that helps solo studios handle projects, invoices, and cashflow in one place…";
// A comprehensive, real-life idea bank — the "start from an idea" list cycles four at a time through this
// (a hardcoded set, so shuffling costs no LLM call). Balanced across deck / doc / web and many industries.
const EXAMPLE_PROMPTS: { text: string; format: Surface }[] = [
    // the curated first four
    { text: "A launch deck for Meridian, a calm OS for solo studios", format: "deck" },
    { text: "A landing page for a whisper-quiet air purifier", format: "web" },
    { text: "An annual climate report — one year measured in degrees", format: "doc" },
    { text: "A pitch for a maps API that developers actually enjoy", format: "deck" },
    // decks
    { text: "A seed pitch deck for a B2B fintech automating expense reports", format: "deck" },
    { text: "A Series A deck for a climate startup capturing carbon from cement", format: "deck" },
    { text: "A sales deck for an enterprise cybersecurity platform", format: "deck" },
    { text: "A product launch deck for an AI note-taking app", format: "deck" },
    { text: "A Q3 all-hands deck: results, wins, and the Q4 roadmap", format: "deck" },
    { text: "A go-to-market deck for a new developer analytics tool", format: "deck" },
    { text: "An investor update for a direct-to-consumer coffee brand", format: "deck" },
    { text: "A conference talk on designing for trust in AI products", format: "deck" },
    { text: "A brand strategy deck for a sustainable activewear label", format: "deck" },
    { text: "A board deck reviewing this quarter's growth and burn", format: "deck" },
    // documents
    { text: "A one-pager for a $3M seed round in healthtech", format: "doc" },
    { text: "A product requirements doc for a mobile checkout redesign", format: "doc" },
    { text: "An annual impact report for a clean-water nonprofit", format: "doc" },
    { text: "A whitepaper on stablecoin settlement for cross-border payments", format: "doc" },
    { text: "A case study: how we cut churn 40% in two quarters", format: "doc" },
    { text: "A 2026 state-of-AI-in-healthcare research report", format: "doc" },
    { text: "A remote-first company handbook and culture guide", format: "doc" },
    { text: "A grant proposal for an urban reforestation program", format: "doc" },
    { text: "A market analysis of the EV-charging landscape", format: "doc" },
    { text: "A press release announcing our $12M Series A", format: "doc" },
    // websites
    { text: "A landing page for a weeknight meal-kit subscription", format: "web" },
    { text: "A pricing page for a team video-hosting platform", format: "web" },
    { text: "A portfolio site for a freelance brand designer", format: "web" },
    { text: "A waitlist page for an AI pair-programming assistant", format: "web" },
    { text: "A homepage for a boutique architecture studio", format: "web" },
    { text: "A features page for a personal-finance budgeting app", format: "web" },
    { text: "A launch page for a hot-swappable mechanical keyboard", format: "web" },
    { text: "An about page for a third-generation family winery", format: "web" },
    { text: "A landing page for a neighborhood yoga and breathwork studio", format: "web" },
];

const FORMATS: [Surface, string][] = [
    ["deck", "Deck"],
    ["doc", "Document"],
    ["web", "Website"],
];
const LENGTHS = ["Short", "Standard", "In-depth"];

// Real sample sections rendered (scaled) in the empty-state + loader tiles — a taste of what Galleo makes.
// Engine-drawn (text / stat / quote / bullets / chart / cards), so they paint instantly with no external
// images. These feed the shared MiniCanvas, which renders them full-size then scales down.
const st = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});
const img = (seed: string, aspect = 1.5): ElementInstance => ({
    type: "image",
    data: { src: `https://picsum.photos/seed/${seed}/1200/800`, aspect },
});
const cl = (element: ElementInstance): { element: ElementInstance } => ({ element });
const SAMPLE_SECTIONS: Section[] = [
    {
        id: "sa1",
        grid: "full",
        background: {
            kind: "image",
            image: "https://picsum.photos/seed/galleo-hero/1600/900",
            scrim: 0.5,
        },
        cells: {
            a: cl({
                type: "group",
                data: {
                    children: [
                        st("Design at the speed of thought", "h1"),
                        st("A calmer way to build decks, docs, and sites.", "subtitle"),
                    ],
                },
            }),
        },
    },
    {
        id: "sa2",
        grid: "split-6040",
        cells: {
            a: cl({
                type: "group",
                data: {
                    children: [
                        st("The numbers speak for themselves", "h2"),
                        st("Teams ship faster the week they switch.", "body"),
                        {
                            type: "group",
                            data: {
                                columns: 3,
                                children: [
                                    {
                                        type: "stat",
                                        data: {
                                            children: [
                                                st("2.4×", "h1"),
                                                st("faster to draft", "caption"),
                                            ],
                                        },
                                    },
                                    {
                                        type: "stat",
                                        data: {
                                            children: [
                                                st("87%", "h1"),
                                                st("less busywork", "caption"),
                                            ],
                                        },
                                    },
                                    {
                                        type: "stat",
                                        data: {
                                            children: [
                                                st("12k", "h1"),
                                                st("teams onboard", "caption"),
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            }),
            b: cl(img("galleo-metrics", 0.9)),
        },
    },
    {
        id: "sa3",
        grid: "full",
        cells: {
            a: cl({
                type: "quote",
                data: {
                    children: [
                        st("It writes every section, then gets out of the way.", "h2"),
                        st("— A very happy designer", "caption"),
                    ],
                },
            }),
        },
    },
    {
        id: "sa4",
        grid: "split-4060",
        cells: {
            a: cl(img("galleo-studio", 1)),
            b: cl({
                type: "group",
                data: {
                    children: [
                        st("Made for real work", "h2"),
                        st("Photos, charts, and copy — composed, never templated.", "body"),
                        st("Every block sized to fit the point it makes.", "body"),
                    ],
                },
            }),
        },
    },
    {
        id: "sa5",
        grid: "split-4060",
        cells: {
            a: cl({
                type: "group",
                data: {
                    children: [
                        st("Momentum, measured", "h2"),
                        st("Adoption across the first weeks.", "body"),
                    ],
                },
            }),
            b: cl({
                type: "chart",
                data: {
                    type: "area",
                    values: "12, 28, 41, 63, 88",
                    categories: "W1, W2, W3, W4, W5",
                    smooth: true,
                },
            }),
        },
    },
    {
        id: "sa6",
        grid: "three-up",
        cells: {
            a: cl({
                type: "card",
                data: {
                    children: [
                        img("galleo-write"),
                        st("Write", "h3"),
                        st("Real, specific copy.", "body"),
                    ],
                },
            }),
            b: cl({
                type: "card",
                data: {
                    children: [
                        img("galleo-compose"),
                        st("Compose", "h3"),
                        st("Grids that fit the point.", "body"),
                    ],
                },
            }),
            c: cl({
                type: "card",
                data: {
                    children: [
                        img("galleo-ship"),
                        st("Ship", "h3"),
                        st("Export in one click.", "body"),
                    ],
                },
            }),
        },
    },
] as Section[];

// The surface the preview/build board renders in. It IS the brief's format selector before a run, and a
// live view-toggle during/after it — same content, re-laid-out as deck / doc / web (format-as-view). The
// switcher top-right of the board drives it; the submitted surface + the saved artifact follow it too.
const [previewFormat, setPreviewFormat] = createSignal<Surface>("deck");

// The natural render width for the previewed format — matches the editor: the format's maxContentWidth
// clamped to the available board (web bleeds to fill). The frame is sized to exactly this so nothing clips.
const frameWidth = (avail: number): number => {
    const p = resolveProfile(previewFormat());
    return Math.max(
        320,
        p.id === "web" ? avail - 48 : Math.min(avail - 48, p.maxContentWidth ?? 1080),
    );
};

// The grid's cell keys — used to build a placeholder section whose real skeleton (layoutSectionSkeleton)
// stands in until the beat's content lands, so the build view reuses the engine's own ghost.
const gridKeys = (id: string): readonly string[] =>
    GRID_TEMPLATES.find((g) => g.id === id)?.cells ?? ["a"];

// A placeholder element for a planned block kind — a real element the engine can skeletonize, so the live
// skeleton shows the exact block the plan assigned to each cell (a stat cell reads as a stat ghost, a chart
// cell as a chart ghost, …), matching what the section writer is told to produce.
function placeholderBlock(kind: string): ElementInstance {
    const t = (text: string, style: string): ElementInstance => ({
        type: "text",
        data: { text, style },
    });
    switch (kind) {
        case "image":
            return { type: "image", data: { src: "", aspect: 1.4 } };
        case "stat":
            return {
                type: "stat",
                data: { children: [t("92%", "h1"), t("key metric", "caption")] },
            };
        case "chart":
            return {
                type: "chart",
                data: { type: "bar", values: "48, 62, 55, 71", categories: "A, B, C, D" },
            };
        case "diagram":
            return {
                type: "diagram",
                data: { type: "process", items: "Step one, Step two, Step three" },
            };
        case "table":
            return {
                type: "table",
                data: { data: "Plan, Price\nBasic, $9\nPro, $29", header: true },
            };
        case "bullets":
            return {
                type: "bullets",
                data: {
                    children: [
                        t("First supporting point", "body"),
                        t("Second supporting point", "body"),
                        t("Third supporting point", "body"),
                    ],
                },
            };
        case "quote":
            return {
                type: "quote",
                data: {
                    children: [
                        t("A pulled quotation that carries the point.", "h3"),
                        t("— Attribution", "caption"),
                    ],
                },
            };
        case "cards": {
            const card = (): ElementInstance => ({
                type: "card",
                data: { children: [t("Card title", "h3"), t("A short supporting line.", "body")] },
            });
            return { type: "group", data: { columns: 3, children: [card(), card(), card()] } };
        }
        default:
            return {
                type: "group",
                data: {
                    children: [
                        t("Section heading", "h2"),
                        t(
                            "A supporting line of body copy that runs the width of the column.",
                            "body",
                        ),
                        t("Another line of supporting copy.", "body"),
                    ],
                },
            };
    }
}

// A stand-in section for a planned-but-unwritten beat — each cell filled with ITS planned block's placeholder,
// so the skeleton is the exact layout the writer will fill. Falls back to a default when a beat has no blocks
// (older plans / the loader tiles).
function placeholderSection(slot: SectionSlot): Section {
    const keys = gridKeys(slot.grid);
    const cells: Record<string, { element: ElementInstance }> = {};
    keys.forEach((key, i) => {
        const kind =
            slot.blocks[i] ??
            (slot.image && keys.length > 1 && i === keys.length - 1 ? "image" : "text");
        cells[key] = { element: placeholderBlock(kind) };
    });
    return { id: slot.id, grid: slot.grid, cells } as Section;
}

// The macro phase stepper — the backend's fine-grained turn phases collapsed into four user-facing steps.
const STEPS: { label: string; phases: string[] }[] = [
    { label: "Reading", phases: ["intake"] },
    { label: "Planning", phases: ["spine", "outline", "plan"] },
    { label: "Building", phases: ["build", "edit", "research"] },
    { label: "Ready", phases: ["compose", "done"] },
];
const stepIndex = (phase: string | null, done: boolean): number => {
    if (done) return STEPS.length - 1;
    if (!phase) return 0;
    const i = STEPS.findIndex((s) => s.phases.includes(phase));
    return i < 0 ? 0 : i;
};

// Fisher–Yates: a fresh random order of the idea bank, computed once each time the modal opens.
function shuffledPrompts(): { text: string; format: Surface }[] {
    const a = [...EXAMPLE_PROMPTS];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]!;
        a[i] = a[j]!;
        a[j] = t;
    }
    return a;
}

// A thin wrapper so the stateful panel mounts fresh on each open (re-seeds intake, resets refs).
export const GenerateModal: Component = () => (
    <Show when={generateOpen()}>
        <GenerateModalPanel />
    </Show>
);

const GenerateModalPanel: Component = () => {
    const navigate = useNavigate();
    const [prompt, setPrompt] = createSignal("");
    // The format lives in the module-level `previewFormat` — the brief's selector and the board's live
    // switcher are the same control, so switching the preview surface just re-lays-out the same content.
    const fmt = previewFormat;
    const setFmt = setPreviewFormat;
    const [length, setLength] = createSignal("Standard");
    // The idea bank is shuffled once per open (fresh random order); the list shows four at a time and the
    // shuffle icon advances the window through the shuffled deck — all hardcoded, no LLM call.
    const deck = shuffledPrompts();
    const [exOffset, setExOffset] = createSignal(0);
    const examples = (): { text: string; format: Surface }[] =>
        Array.from({ length: 4 }, (_, i) => deck[(exOffset() + i) % deck.length]!);
    const shuffleExamples = (): void => {
        setExOffset((o) => (o + 4) % deck.length);
    };
    const building = (): boolean => gen.phase !== "idle";
    const total = (): number => gen.sections.length;
    const done = (): number => placedSections().length;

    // The modal wears the theme the artifact will be generated in — its own app theme until a run starts,
    // then the run's theme — so the chrome and the live preview share one palette.
    const panelVars = createMemo(
        (): JSX.CSSProperties =>
            themeCssVars(
                resolveTheme(building() ? gen.theme : appTheme()).tokens,
            ) as JSX.CSSProperties,
    );

    const go = (): void => {
        void startRealSession({
            prompt: prompt().trim() || PLACEHOLDER,
            surface: fmt(),
            theme: appTheme(),
            length: length(),
        });
    };
    const openInEditor = async (): Promise<void> => {
        // Save in whatever surface the preview is showing — the switcher is a real choice, so "Open" honors it.
        const id = await saveGenerated(previewFormat());
        if (id) {
            closeGenerate();
            navigate(`/edit/${id}`);
        }
    };

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !building()) go();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    return (
        <Modal
            size="full"
            scrim="light"
            z={60}
            vars={panelVars()}
            class="flex h-[90vh] max-h-[1000px] overflow-hidden"
            onClose={() => closeGenerate()}
        >
            {/* ── left rail: brief (intake) ⇄ progress (building) ── */}
            <aside class="flex w-[360px] flex-none flex-col border-r border-line bg-panel">
                <header class="flex flex-none items-center justify-between border-b border-line px-4 py-3">
                    <div class="flex items-baseline gap-2">
                        <span class="text-[13px] font-semibold tracking-tight">Generate</span>
                        <Eyebrow weight="normal" tracking="widest">
                            {building() ? "building" : "new"}
                        </Eyebrow>
                    </div>
                    <IconButton
                        size="lg"
                        tone="muted"
                        title="Close"
                        onClick={() => closeGenerate()}
                    >
                        <CloseIcon size={15} />
                    </IconButton>
                </header>

                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <Show when={!building()} fallback={<Progress />}>
                        {/* ── intake ── */}
                        <Eyebrow as="div" weight="normal" tracking="widest" class="mb-2">
                            Compose
                        </Eyebrow>
                        <h2
                            class="mb-1 font-serif text-[22px] leading-tight"
                            style={{ "font-family": "var(--font-display)" }}
                        >
                            What are we making?
                        </h2>
                        <p class="mb-4 text-[12.5px] leading-relaxed text-muted">
                            Describe it in a sentence. Galleo shapes the outline, writes every
                            section, and sources the images — watch it build alongside.
                        </p>
                        <TextArea
                            rounded="xl"
                            class="min-h-[120px] placeholder:text-muted"
                            placeholder={PLACEHOLDER}
                            value={prompt()}
                            onChange={(v) => setPrompt(v)}
                        />

                        <Eyebrow as="div" weight="normal" tracking="widest" class="mb-1.5 mt-4">
                            Format
                        </Eyebrow>
                        <Segmented
                            variant="accent"
                            value={fmt()}
                            options={FORMATS.map(([value, label]) => ({ value, label }))}
                            onChange={(v) => setFmt(v as Surface)}
                        />

                        <Eyebrow as="div" weight="normal" tracking="widest" class="mb-1.5 mt-4">
                            Length
                        </Eyebrow>
                        <Segmented
                            variant="accent"
                            value={length()}
                            options={LENGTHS.map((l) => ({ value: l, label: l }))}
                            onChange={(v) => setLength(v)}
                        />

                        <div class="mb-2 mt-5 flex items-center justify-between">
                            <Eyebrow weight="normal" tracking="widest">
                                Or start from an idea
                            </Eyebrow>
                            <IconButton
                                size="sm"
                                rounded="md"
                                class="group"
                                title="Show different ideas"
                                onClick={shuffleExamples}
                            >
                                <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="transition-transform duration-300 group-hover:rotate-90"
                                >
                                    <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                                </svg>
                            </IconButton>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <For each={examples()}>
                                {(ex) => (
                                    <button
                                        class="rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-soft transition-colors hover:border-accent hover:text-ink"
                                        onClick={() => {
                                            setPrompt(ex.text);
                                            setFmt(ex.format);
                                        }}
                                    >
                                        {ex.text}
                                    </button>
                                )}
                            </For>
                        </div>
                    </Show>
                </div>

                {/* ── rail footer: Generate (intake) · steps + CTA (building/done) ── */}
                <footer class="flex-none border-t border-line px-4 py-3">
                    <Show
                        when={building()}
                        fallback={
                            <Button variant="primary" rounded="xl" class="w-full" onClick={go}>
                                Generate →
                            </Button>
                        }
                    >
                        <div class="mb-3 flex items-center justify-between gap-2">
                            <For each={STEPS}>
                                {(s, i) => {
                                    const at = (): number =>
                                        stepIndex(gen.turnPhase, gen.phase === "done");
                                    return (
                                        <div
                                            class="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]"
                                            classList={{
                                                "text-accent": i() === at(),
                                                "text-muted": i() > at(),
                                                "text-soft": i() < at(),
                                            }}
                                        >
                                            <StatusDot
                                                tone={
                                                    i() === at()
                                                        ? "accent"
                                                        : i() < at()
                                                          ? "soft"
                                                          : "line"
                                                }
                                                pulse={i() === at()}
                                            />
                                            {s.label}
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                        <Show
                            when={gen.phase === "done"}
                            fallback={
                                <Show
                                    when={gen.phase === "error"}
                                    fallback={
                                        <div class="flex items-center justify-between text-[12px] text-muted">
                                            <span class="font-mono tabular-nums">
                                                {String(done()).padStart(2, "0")} /{" "}
                                                {String(total()).padStart(2, "0")} sections
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => closeGenerate()}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    }
                                >
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="text-[12px] text-red-400">{gen.error}</span>
                                        <Button variant="outline" size="sm" onClick={go}>
                                            Retry
                                        </Button>
                                    </div>
                                </Show>
                            }
                        >
                            <div class="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={go}>
                                    Regenerate
                                </Button>
                                <Button
                                    variant="primary"
                                    rounded="xl"
                                    class="flex-1"
                                    onClick={openInEditor}
                                >
                                    Open in editor →
                                </Button>
                            </div>
                        </Show>
                    </Show>
                </footer>
            </aside>

            {/* ── right: the live board ── */}
            <div class="flex min-w-0 flex-1 flex-col" style={{ background: "var(--color-canvas)" }}>
                <div class="flex flex-none items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2">
                    <Eyebrow weight="normal" tracking="widest" class="flex-none">
                        {building() ? "Live build" : "Preview"}
                    </Eyebrow>
                    <Show when={building() && gen.brief?.prompt}>
                        <span class="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                            {gen.brief?.prompt}
                        </span>
                    </Show>
                    {/* live preview surface switcher — same content re-laid-out as deck / doc / web */}
                    <Segmented
                        variant="accent"
                        value={previewFormat()}
                        options={FORMATS.map(([value, label]) => ({ value, label }))}
                        onChange={(v) => setPreviewFormat(v as Surface)}
                    />
                </div>
                <div class="min-h-0 flex-1">
                    <Show when={building()} fallback={<Idle />}>
                        <Board />
                    </Show>
                </div>
            </div>
        </Modal>
    );
};

// The empty state before a run — a static still-life of scattered mini section previews (the same themed
// engine skeletons the loader orbits, here fixed in place) behind the prompt, so the pane feels alive
// without motion.
const IDLE_CARDS: {
    sample: number;
    x: number;
    y: number;
    rot: number;
    scale: number;
    op: number;
}[] = [
    { sample: 0, x: -236, y: -118, rot: -8, scale: 0.92, op: 0.6 },
    { sample: 1, x: 232, y: -128, rot: 7, scale: 0.86, op: 0.52 },
    { sample: 3, x: -252, y: 132, rot: 6, scale: 0.88, op: 0.54 },
    { sample: 5, x: 240, y: 140, rot: -7, scale: 0.86, op: 0.52 },
];

const Idle: Component = () => (
    <div class="relative grid h-full place-items-center overflow-hidden p-8">
        <For each={IDLE_CARDS}>
            {(c) => (
                <div
                    class="pointer-events-none absolute left-1/2 top-1/2"
                    style={{
                        transform: `translate(-50%, -50%) translate(${c.x}px, ${c.y}px) rotate(${c.rot}deg) scale(${c.scale})`,
                        opacity: String(c.op),
                    }}
                >
                    <MiniCanvas
                        section={SAMPLE_SECTIONS[c.sample]!}
                        themeId={appTheme()}
                        formatId={previewFormat()}
                        width={240}
                        class="rounded-xl border border-line shadow-lg"
                    />
                </div>
            )}
        </For>
        <div class="relative z-[2] flex max-w-[360px] flex-col items-center gap-4 rounded-2xl border border-line bg-panel/85 px-8 py-7 text-center shadow-xl backdrop-blur-sm">
            <div class="grid h-14 w-14 place-items-center rounded-2xl border border-dashed border-accent/40 text-accent">
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <path d="M12 3v18M3 12h18" stroke-linecap="round" />
                </svg>
            </div>
            <p class="text-[14px] leading-relaxed text-soft">
                Describe what you want to make. Every section is written and rendered right here as
                it streams in — in your current theme, swappable anytime after.
            </p>
        </div>
    </div>
);

// The left-rail progress readout during a build: the brief, the outline beats, and the narration feed.
const Progress: Component = () => {
    return (
        <div class="flex flex-col gap-5">
            <div>
                <Eyebrow as="div" weight="normal" tracking="widest" class="mb-2">
                    The brief
                </Eyebrow>
                <div class="border-l-2 border-line pl-3 text-[12.5px] leading-relaxed text-soft">
                    {gen.brief?.prompt}
                </div>
            </div>
            <div>
                <Eyebrow as="div" weight="normal" tracking="widest" class="mb-2">
                    Outline
                </Eyebrow>
                <Show
                    when={gen.beats.length}
                    fallback={<div class="font-mono text-[11px] text-muted">planning…</div>}
                >
                    <ul class="flex flex-col gap-0.5">
                        <For each={gen.beats}>
                            {(b, i) => (
                                <li
                                    class="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                                    classList={{ "bg-accent/10": b.status === "active" }}
                                >
                                    <span class="w-4 flex-none font-mono text-[10px] text-muted">
                                        {String(i() + 1).padStart(2, "0")}
                                    </span>
                                    <StatusDot
                                        ring
                                        size={10}
                                        tone={b.status === "upcoming" ? "line" : "accent"}
                                        fill={b.status === "done"}
                                        pulse={b.status === "active"}
                                    />
                                    <span
                                        class="min-w-0 flex-1 truncate text-[12.5px]"
                                        classList={{
                                            "text-muted": b.status === "upcoming",
                                            "text-ink": b.status !== "upcoming",
                                        }}
                                    >
                                        {b.label}
                                    </span>
                                    <span class="flex-none font-mono text-[9px] uppercase tracking-wide text-muted">
                                        {b.role}
                                    </span>
                                </li>
                            )}
                        </For>
                    </ul>
                </Show>
            </div>
            <div>
                <Eyebrow as="div" weight="normal" tracking="widest" class="mb-2">
                    Progress
                </Eyebrow>
                <div class="flex flex-col gap-2">
                    <Show
                        when={gen.narration.length}
                        fallback={<div class="font-mono text-[11px] text-muted">…</div>}
                    >
                        <For each={gen.narration.slice(-8)}>
                            {(line) => (
                                <div
                                    class="flex gap-2 text-[12px] leading-snug"
                                    classList={{
                                        "text-muted opacity-70": line.done,
                                        "text-ink": !line.done,
                                    }}
                                >
                                    <StatusDot
                                        class="mt-1.5"
                                        tone={line.done ? "line" : "accent"}
                                        pulse={!line.done}
                                    />
                                    <span class="min-w-0">
                                        {line.text}
                                        <Show when={line.mono}>
                                            <span class="ml-1 font-mono text-[10.5px] text-accent">
                                                {line.mono}
                                            </span>
                                        </Show>
                                        <Show when={line.sub}>
                                            <span class="mt-0.5 block truncate text-[11px] text-muted">
                                                {line.sub}
                                            </span>
                                        </Show>
                                    </span>
                                </div>
                            )}
                        </For>
                    </Show>
                </div>
            </div>
        </div>
    );
};

// The build loader shown while the outline is being written (the first, longest wait). "Skeleton Cascade":
// three section skeletons stack and light in sequence, top to bottom — the piece visibly forming — under a
// caption that tracks the run's narration. Contained + calm (a fraction of the old orbit), and it reuses the
// same skeleton language as the rest of the build. Ghost/lit tones derive from the artifact theme.
const cascadeVars = (): JSX.CSSProperties => {
    const tk = resolveTheme(gen.theme).tokens;
    return {
        width: "460px",
        "--gc-frame": tk.surface,
        "--gc-border": tk.line,
        "--gc-ghost": mix(tk.surface, tk.ink, 0.14),
        "--gc-lit": mix(tk.surface, tk.accent, 0.5),
        "--gc-accent": tk.accent,
    } as JSX.CSSProperties;
};

const ReadingLoader: Component = () => {
    const line = (): string => gen.narration[gen.narration.length - 1]?.text ?? "Reading the brief";
    // one skeleton row (a themed frame of ghost bars) — the `d` delay staggers the three so they light in
    // sequence; children read `--d` so a row's bars light with their frame.
    const bar = (cls: string): JSX.Element => <div class={`gc-bar rounded ${cls}`} />;
    return (
        <div class="flex flex-col items-center gap-6" style={cascadeVars()}>
            <style>{`
              @keyframes gc-frame { 0%{opacity:.34} 7%{opacity:1} 30%{opacity:.5} 100%{opacity:.34} }
              @keyframes gc-glow {
                0%{box-shadow:none;border-color:var(--gc-border)}
                7%{box-shadow:0 0 26px -10px var(--gc-accent);border-color:color-mix(in srgb,var(--gc-accent) 55%,var(--gc-border))}
                30%,100%{box-shadow:none;border-color:var(--gc-border)}
              }
              @keyframes gc-bar { 0%{background:var(--gc-ghost)} 7%{background:var(--gc-lit)} 30%,100%{background:var(--gc-ghost)} }
              .gc-row { animation: gc-frame 3.6s infinite ease-in-out, gc-glow 3.6s infinite ease-in-out; animation-delay: var(--d,0s); }
              .gc-bar { background: var(--gc-ghost); animation: gc-bar 3.6s infinite ease-in-out; animation-delay: var(--d,0s); }
              @media (prefers-reduced-motion: reduce) { .gc-row,.gc-bar { animation: none } .gc-row { opacity:.65 } }
            `}</style>

            <div class="flex w-full flex-col gap-2.5">
                {/* image-left */}
                <div
                    class="gc-row flex items-center gap-3.5 rounded-xl border p-3.5"
                    style={{
                        background: "var(--gc-frame)",
                        "border-color": "var(--gc-border)",
                        "--d": "0s",
                    }}
                >
                    <div class="gc-bar h-10 w-14 flex-none rounded-md" />
                    <div class="flex flex-1 flex-col gap-2">
                        {bar("h-2 w-2/3")}
                        {bar("h-1.5 w-11/12")}
                        {bar("h-1.5 w-4/5")}
                    </div>
                </div>
                {/* image-right */}
                <div
                    class="gc-row flex items-center gap-3.5 rounded-xl border p-3.5"
                    style={{
                        background: "var(--gc-frame)",
                        "border-color": "var(--gc-border)",
                        "--d": "1.2s",
                    }}
                >
                    <div class="flex flex-1 flex-col gap-2">
                        {bar("h-2 w-1/2")}
                        {bar("h-1.5 w-11/12")}
                        {bar("h-1.5 w-3/4")}
                    </div>
                    <div class="gc-bar h-10 w-14 flex-none rounded-md" />
                </div>
                {/* text-only */}
                <div
                    class="gc-row flex flex-col gap-2 rounded-xl border p-3.5"
                    style={{
                        background: "var(--gc-frame)",
                        "border-color": "var(--gc-border)",
                        "--d": "2.4s",
                    }}
                >
                    {bar("h-2 w-1/3")}
                    {bar("h-1.5 w-full")}
                    {bar("h-1.5 w-5/6")}
                </div>
            </div>

            <div class="flex items-center gap-2.5 rounded-full border border-line bg-panel/85 px-4 py-2 backdrop-blur-sm">
                <Spinner size={14} />
                <span class="font-mono text-[11px] uppercase tracking-[0.14em] text-soft">
                    {line()}…
                </span>
            </div>
        </div>
    );
};

const Board: Component = () => {
    let board!: HTMLDivElement;
    const [avail, setAvail] = createSignal(1000);
    onMount(() => {
        const ro = new ResizeObserver(() => setAvail(board.clientWidth));
        ro.observe(board);
        setAvail(board.clientWidth);
        onCleanup(() => ro.disconnect());
    });
    // Center the section currently being generated (its skeleton) in view — keeping the just-finished one
    // partially visible above — instead of jumping to the last skeleton. A short pause after a section goes
    // active lets the previous section's reveal read; that's client-side pacing only and never gates
    // generation. Also recenters as earlier reveals shift the layout below.
    const centerActive = (): void => {
        const id = gen.activeSection;
        const el = id ? board?.querySelector<HTMLElement>(`[data-sid="${id}"]`) : null;
        if (!el) return;
        const er = el.getBoundingClientRect();
        const br = board.getBoundingClientRect();
        const top = board.scrollTop + (er.top - br.top) - (board.clientHeight - er.height) / 2;
        board.scrollTo({ top: Math.max(0, top), behavior: reduced() ? "auto" : "smooth" });
    };
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    createEffect(() => {
        void gen.activeSection;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(centerActive, reduced() ? 0 : 420);
    });
    createEffect(() => {
        void placedSections().length;
        queueMicrotask(centerActive);
    });
    // When the run finishes, activeSection goes null (so centerActive no-ops) — settle at the end instead
    // of freezing wherever the last section was centered, revealing the finished final section.
    createEffect(() => {
        if (gen.phase !== "done") return;
        clearTimeout(scrollTimer);
        queueMicrotask(() =>
            board?.scrollTo({ top: board.scrollHeight, behavior: reduced() ? "auto" : "smooth" }),
        );
    });
    onCleanup(() => clearTimeout(scrollTimer));
    // Spacing between frames reads the surface: web bands butt together (continuous scroll), deck cards get
    // room (slides), a doc's pages sit a touch apart.
    const gap = (): string =>
        previewFormat() === "web" ? "2px" : previewFormat() === "doc" ? "14px" : "22px";
    return (
        <div
            ref={board}
            class="flex h-full flex-col items-center overflow-auto px-7 py-6"
            style={{ gap: gap() }}
        >
            <Show
                when={!gen.beats.length}
                fallback={
                    <For each={gen.sections}>
                        {(slot, i) => <Frame slot={slot} index={i()} avail={avail} />}
                    </For>
                }
            >
                <div class="grid h-full place-items-center">
                    <ReadingLoader />
                </div>
            </Show>
        </div>
    );
};

// One section frame: while the beat is being written it shows the engine's OWN section skeleton
// (layoutSectionSkeleton over a placeholder built from the planned grid — the same ghost the rest of the
// app uses); when its content lands it swaps to the real engine render with a reveal. One paint box, one
// paint path for both states.
const Frame: Component<{ slot: SectionSlot; index: number; avail: () => number }> = (props) => {
    let box!: HTMLDivElement;
    const [dim, setDim] = createSignal({ w: 0, h: 0 });
    const doneReady = (): boolean => props.slot.status === "done" && !!props.slot.section;
    const active = (): boolean => ["active", "writing", "image"].includes(props.slot.status);
    const themeBg = (): string => resolveTheme(gen.theme).tokens.bg;
    const isWeb = (): boolean => previewFormat() === "web";

    createEffect(() => {
        if (!box) return;
        const done = doneReady();
        const sec = done ? (props.slot.section as Section) : placeholderSection(props.slot);
        const tk = resolveTheme(gen.theme).tokens;
        const layoutW = frameWidth(props.avail());
        const profile = resolveProfile(previewFormat());
        const out = done
            ? layoutSection(sec, layoutW, measureText, tk, profile)
            : layoutSectionSkeleton(sec, layoutW, measureText, tk, profile);
        paint(out.commands, box);
        setDim({ w: layoutW, h: out.height });
        if (!done || reduced()) return;
        // reveal the finished render (skeleton → proof)
        box.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "both",
        });
        box.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }], {
            duration: 560,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "both",
        });
        box.querySelectorAll("img").forEach((img) =>
            img.animate(
                [
                    { filter: "blur(14px)", opacity: 0.4 },
                    { filter: "blur(0)", opacity: 1 },
                ],
                { duration: 640, fill: "both" },
            ),
        );
    });

    return (
        <article
            data-sid={props.slot.id}
            class="relative"
            style={{ width: `${frameWidth(props.avail())}px` }}
        >
            <span
                class="absolute left-3 top-2 z-[2] font-mono text-[9px] tracking-[0.14em] text-accent/80 transition-opacity"
                classList={{ "opacity-0": doneReady() }}
            >
                {String(props.index + 1).padStart(2, "0")} · {props.slot.grid.toUpperCase()}
                {props.slot.image ? " · IMG" : ""}
            </span>
            <div
                class="overflow-hidden transition-colors"
                classList={{
                    // deck/doc read as framed cards/pages; web bleeds edge-to-edge as a continuous band
                    "rounded-xl border": !isWeb(),
                    "border-line shadow-[0_30px_60px_-40px_rgba(0,0,0,0.5)]":
                        doneReady() && !isWeb(),
                    "border-dashed border-accent/25": !doneReady() && !isWeb(),
                    "ring-1 ring-accent shadow-[0_0_30px_-6px_var(--color-accent)]": active(),
                }}
                style={{ background: themeBg() }}
            >
                <div
                    ref={box}
                    style={{
                        position: "relative",
                        width: `${dim().w}px`,
                        height: `${dim().h}px`,
                        margin: "0 auto",
                    }}
                />
            </div>
            <Show when={active()}>
                <div class="absolute bottom-3 left-4 z-[2] flex items-center gap-2 rounded-md bg-panel/80 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent backdrop-blur-sm">
                    <StatusDot tone="accent" pulse />
                    {props.slot.status === "image" ? "Sourcing image…" : "Writing…"}
                </div>
            </Show>
        </article>
    );
};
