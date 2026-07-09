import type { Component, JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { Section } from "@model/artifact";
import type { Theme } from "@themes";
import { THEME_LIST, resolveTheme, themeCssVars } from "@themes";
import { resolveProfile } from "@engine/profile";
import { Badge, Button, Chip, Eyebrow, IconButton, Spinner } from "./button";
import {
    AlignField,
    FieldRow,
    Group,
    PanelHeader,
    Segmented,
    Slider,
    TextArea,
    TextField,
    Toggle,
} from "./inputs";
import { Dropdown } from "./select";
import { ColorPicker, ColorPopover } from "./color";
import { ConfirmModal, FloatingBar, Modal } from "./overlay";
import { ScaledSectionCanvas, SlideProgress } from "./section";
import { CloseIcon, Icon, ICON_NAMES, UiThemeProvider } from "./icons";

// The @ui showcase (dev route /ui). Every component live over an ambient accent-tinted backdrop, with a
// visual gallery of the full theme list — each card rendered in its OWN theme, click to make it active.
// The whole surface then recolors through themeCssVars(selected) exactly as the app root does, so each
// component reads pixel-for-pixel as it will in the app. Controls are built from the @ui inputs (dogfood).

const PG_CSS = `
.pg-bg { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.pg-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(to right, color-mix(in oklab, var(--color-line) 70%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklab, var(--color-line) 70%, transparent) 1px, transparent 1px);
  background-size: 46px 46px;
  -webkit-mask-image: radial-gradient(ellipse 90% 55% at 50% 0%, #000 25%, transparent 72%);
  mask-image: radial-gradient(ellipse 90% 55% at 50% 0%, #000 25%, transparent 72%);
  opacity: 0.55;
}
.pg-glow { position: absolute; border-radius: 999px; filter: blur(74px); will-change: transform; }
.pg-glow.g1 { width: 46vw; height: 46vw; left: -12vw; top: -10vw;
  background: radial-gradient(circle, color-mix(in oklab, var(--color-accent) 50%, transparent), transparent 64%);
  opacity: .42; animation: pg-d1 24s ease-in-out infinite alternate; }
.pg-glow.g2 { width: 40vw; height: 40vw; right: -8vw; top: 6vh;
  background: radial-gradient(circle, color-mix(in oklab, var(--color-accent) 30%, transparent), transparent 62%);
  opacity: .4; animation: pg-d2 29s ease-in-out infinite alternate; }
.pg-glow.g3 { width: 38vw; height: 38vw; left: 34vw; bottom: -16vw;
  background: radial-gradient(circle, color-mix(in oklab, var(--color-accent) 22%, var(--color-panel)), transparent 60%);
  opacity: .5; animation: pg-d3 34s ease-in-out infinite alternate; }
@keyframes pg-d1 { to { transform: translate(6vw, 5vh) scale(1.12); } }
@keyframes pg-d2 { to { transform: translate(-5vw, 4vh) scale(1.08); } }
@keyframes pg-d3 { to { transform: translate(4vw, -6vh) scale(1.14); } }
.pg-card { background: color-mix(in oklab, var(--color-panel) 60%, transparent);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.pg-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px -18px rgba(0,0,0,.5); }
.pg-theme { transition: transform .16s ease, box-shadow .16s ease; }
.pg-theme:hover { transform: translateY(-3px); }
.pg-accent-text { color: var(--color-accent); }
@media (prefers-reduced-motion: reduce) { .pg-glow { animation: none; } .pg-card, .pg-theme { transition: none; } }
`;

const SAMPLES: Section[] = [
    {
        id: "s1",
        grid: "full",
        cells: {
            a: {
                element: {
                    type: "text",
                    data: { text: "One artifact —\ndeck · doc · site", style: "title" },
                },
            },
        },
    },
    {
        id: "s2",
        grid: "full",
        cells: {
            a: {
                element: {
                    type: "text",
                    data: { text: "Themed by CSS variables", style: "title" },
                },
            },
        },
    },
    {
        id: "s3",
        grid: "full",
        cells: {
            a: {
                element: {
                    type: "text",
                    data: { text: "Render once,\nscale anywhere", style: "title" },
                },
            },
        },
    },
];

const swatches = (id: string): { label: string; color: string }[] => {
    const t = resolveTheme(id).tokens;
    return [
        { label: "Accent", color: t.accent },
        { label: "Ink", color: t.ink },
        { label: "Soft", color: t.soft },
        { label: "Muted", color: t.muted },
        { label: "Surface", color: t.surface },
        { label: "Line", color: t.line },
    ];
};

const FONTS = [
    { label: "Fraunces", value: "fraunces", font: "Fraunces" },
    { label: "Space Grotesk", value: "grotesk", font: "Space Grotesk" },
    { label: "Hanken Grotesk", value: "hanken", font: "Hanken Grotesk" },
    { label: "DM Mono", value: "mono", font: "DM Mono" },
];

const Section: Component<{ n: string; title: string; desc: string; children: JSX.Element }> = (
    props,
) => (
    <section class="py-12">
        <div class="flex items-baseline gap-4">
            <span class="font-mono text-[12px] font-semibold text-accent">{props.n}</span>
            <div>
                <h2 class="font-display text-[26px] font-semibold leading-none">{props.title}</h2>
                <p class="mt-1.5 text-[13px] text-muted">{props.desc}</p>
            </div>
        </div>
        <div class="mt-7 border-t border-line pt-7">{props.children}</div>
    </section>
);

const Panel: Component<{ label?: string; class?: string; children: JSX.Element }> = (props) => (
    <div class={`pg-card rounded-2xl border border-line p-6 backdrop-blur-md ${props.class ?? ""}`}>
        <Show when={props.label}>
            <Eyebrow class="mb-4 block">{props.label}</Eyebrow>
        </Show>
        {props.children}
    </div>
);

const Row: Component<{ children: JSX.Element }> = (props) => (
    <div class="flex flex-wrap items-center gap-3">{props.children}</div>
);

export const UiPlayground: Component = () => {
    const [themeId, setThemeId] = createSignal(THEME_LIST[0]?.id ?? "studio");
    const tokens = (): ReturnType<typeof resolveTheme>["tokens"] => resolveTheme(themeId()).tokens;
    const activeName = (): string => resolveTheme(themeId()).name;
    const idx = (): number => THEME_LIST.findIndex((t) => t.id === themeId());
    const cycle = (d: number): void => {
        const n = THEME_LIST.length;
        setThemeId(THEME_LIST[(idx() + d + n) % n]?.id ?? themeId());
    };
    const shuffle = (): void => {
        setThemeId(THEME_LIST[Math.floor(Math.random() * THEME_LIST.length)]?.id ?? themeId());
    };

    // dogfooded Button controls
    const [btnVariant, setBtnVariant] = createSignal("primary");
    const [btnSize, setBtnSize] = createSignal("md");
    const [btnLoading, setBtnLoading] = createSignal(false);

    // input demo state
    const [text, setText] = createSignal("Refrakt");
    const [area, setArea] = createSignal("One engine, three views —\ndeck, document, website.");
    const [toggle, setToggle] = createSignal(true);
    const [zebra, setZebra] = createSignal(false);
    const [slider, setSlider] = createSignal(12);
    const [pad, setPad] = createSignal(20);
    const [seg, setSeg] = createSignal("deck");
    const [segIcon, setSegIcon] = createSignal("stack");
    const [align, setAlign] = createSignal("start");
    const [font, setFont] = createSignal("fraunces");
    const [color, setColor] = createSignal<string | undefined>(undefined);
    const [pop, setPop] = createSignal<string | undefined>("#9a4f24");
    const [inspectColor, setInspectColor] = createSignal<string | undefined>(undefined);
    const [selCanvas, setSelCanvas] = createSignal(0);

    // overlays
    const [modal, setModal] = createSignal(false);
    const [confirm, setConfirm] = createSignal(false);

    const themeCard = (t: Theme): JSX.Element => {
        const tk = resolveTheme(t.id).tokens;
        const active = (): boolean => themeId() === t.id;
        return (
            <button
                onClick={() => setThemeId(t.id)}
                title={t.name}
                class="pg-theme flex-none overflow-hidden rounded-xl border p-3 text-left"
                style={{
                    width: "138px",
                    background: tk.surface,
                    "border-color": active() ? tk.accent : tk.line,
                    "box-shadow": active() ? `0 0 0 2px ${tk.accent}` : "none",
                }}
            >
                <div class="mb-2.5 flex gap-1">
                    <For each={[tk.bg, tk.accent, tk.ink, tk.soft]}>
                        {(c) => (
                            <span
                                class="h-4 flex-1 rounded"
                                style={{
                                    background: c,
                                    "box-shadow": "inset 0 0 0 1px rgba(0,0,0,.08)",
                                }}
                            />
                        )}
                    </For>
                </div>
                <div class="truncate text-[12.5px] font-semibold" style={{ color: tk.ink }}>
                    {t.name}
                </div>
                <div class="truncate text-[10px]" style={{ color: tk.muted }}>
                    {t.tag || (resolveTheme(t.id).dark ? "dark" : "light")}
                </div>
            </button>
        );
    };

    return (
        <UiThemeProvider tokens={tokens}>
            <div
                class="fixed inset-0 overflow-y-auto bg-canvas font-body text-ink"
                style={themeCssVars(tokens())}
            >
                <style>{PG_CSS}</style>

                <div class="pg-bg" aria-hidden="true">
                    <span class="pg-glow g1" />
                    <span class="pg-glow g2" />
                    <span class="pg-glow g3" />
                    <div class="pg-grid" />
                </div>

                {/* sticky glass header with prev / shuffle / next theme controls */}
                <header class="sticky top-0 z-20 border-b border-line bg-panel/70 backdrop-blur-xl">
                    <div class="mx-auto flex max-w-[1140px] items-center justify-between gap-4 px-6 py-3.5 md:px-10">
                        <div class="flex items-center gap-2.5">
                            <span class="grid h-7 w-7 place-items-center rounded-lg bg-accent text-onaccent">
                                <Icon name="sparkle" size={16} />
                            </span>
                            <span class="font-display text-[17px] font-semibold">@ui</span>
                            <Badge tone="muted">playground</Badge>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="hidden items-center gap-1.5 sm:flex">
                                <span
                                    class="h-3 w-3 rounded-full"
                                    style={{ background: "var(--color-accent)" }}
                                />
                                <span class="text-[12.5px] font-medium">{activeName()}</span>
                            </span>
                            <div class="mx-1 flex items-center gap-0.5 rounded-lg border border-line p-0.5">
                                <IconButton
                                    size="sm"
                                    rounded="md"
                                    title="Previous theme"
                                    onClick={() => cycle(-1)}
                                >
                                    <Icon name="chevronLeft" size={15} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    rounded="md"
                                    title="Shuffle theme"
                                    onClick={shuffle}
                                >
                                    <Icon name="refresh" size={14} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    rounded="md"
                                    title="Next theme"
                                    onClick={() => cycle(1)}
                                >
                                    <Icon name="chevronRight" size={15} />
                                </IconButton>
                            </div>
                        </div>
                    </div>
                </header>

                <main class="relative z-10 mx-auto max-w-[1140px] px-6 pb-40 md:px-10">
                    {/* hero */}
                    <div class="pt-16 pb-4">
                        <Eyebrow tracking="widest" class="mb-4 block text-accent">
                            Galleo design system
                        </Eyebrow>
                        <h1 class="max-w-[18ch] font-display text-[54px] font-semibold leading-[1.02] tracking-tight">
                            Every component. <span class="pg-accent-text">Every theme.</span>
                        </h1>
                        <p class="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-soft">
                            One shared Solid library, themed entirely through CSS variables. Pick a
                            theme below — the whole page recolors exactly as it will in the app.
                        </p>
                        <div class="mt-6 flex flex-wrap items-center gap-2">
                            <Chip variant="solid" selected>
                                {THEME_LIST.length} themes
                            </Chip>
                            <Chip>{ICON_NAMES.length} icons</Chip>
                            <Chip>now: {activeName()}</Chip>
                        </div>
                    </div>

                    {/* the full theme gallery — each card in its own theme */}
                    <div class="py-6">
                        <Eyebrow class="mb-3 block">pick a theme</Eyebrow>
                        <div class="flex flex-wrap gap-3">
                            <For each={THEME_LIST}>{(t) => themeCard(t)}</For>
                        </div>
                    </div>

                    <Section
                        n="01"
                        title="Actions"
                        desc="Buttons, icon buttons, chips, badges, and labels."
                    >
                        <div class="grid gap-5 lg:grid-cols-[300px_1fr]">
                            <Panel label="Try it — controls are @ui inputs">
                                <FieldRow label="Variant">
                                    <Segmented
                                        value={btnVariant()}
                                        onChange={setBtnVariant}
                                        options={[
                                            { label: "Primary", value: "primary" },
                                            { label: "Outline", value: "outline" },
                                            { label: "Tool", value: "tool" },
                                            { label: "Danger", value: "danger" },
                                        ]}
                                    />
                                </FieldRow>
                                <FieldRow label="Size">
                                    <Segmented
                                        value={btnSize()}
                                        onChange={setBtnSize}
                                        options={[
                                            { label: "sm", value: "sm" },
                                            { label: "md", value: "md" },
                                            { label: "lg", value: "lg" },
                                        ]}
                                    />
                                </FieldRow>
                                <div class="mt-1 flex items-center gap-2">
                                    <Toggle value={btnLoading()} onChange={setBtnLoading} />
                                    <span class="text-[12px] text-soft">loading</span>
                                </div>
                            </Panel>
                            <Panel class="grid place-items-center">
                                <Button
                                    variant={
                                        btnVariant() as
                                            | "primary"
                                            | "outline"
                                            | "tool"
                                            | "ghost"
                                            | "danger"
                                    }
                                    size={btnSize() as "sm" | "md" | "lg"}
                                    loading={btnLoading()}
                                >
                                    Publish
                                </Button>
                            </Panel>
                        </div>
                        <div class="mt-5 grid gap-5 md:grid-cols-2">
                            <Panel label="Every variant">
                                <div class="flex flex-col gap-3">
                                    <Row>
                                        <Button variant="primary">Primary</Button>
                                        <Button variant="outline">Outline</Button>
                                        <Button variant="tool">Tool</Button>
                                    </Row>
                                    <Row>
                                        <Button variant="ghost">Ghost</Button>
                                        <Button variant="danger">Delete</Button>
                                        <Button variant="primary" rounded="full">
                                            Pill
                                        </Button>
                                        <Button variant="primary" loading>
                                            Saving
                                        </Button>
                                    </Row>
                                    <Row>
                                        <Button variant="outline" size="sm">
                                            sm
                                        </Button>
                                        <Button variant="outline" size="md">
                                            md
                                        </Button>
                                        <Button variant="outline" size="lg">
                                            lg
                                        </Button>
                                    </Row>
                                </div>
                            </Panel>
                            <Panel label="Icon buttons — sizes & tones">
                                <div class="flex flex-col gap-3">
                                    <Row>
                                        <IconButton size="xs" title="close">
                                            <CloseIcon size={12} />
                                        </IconButton>
                                        <IconButton size="sm">
                                            <Icon name="plus" size={14} />
                                        </IconButton>
                                        <IconButton size="md">
                                            <Icon name="trash" size={16} />
                                        </IconButton>
                                        <IconButton size="lg" active>
                                            <Icon name="grid" size={18} />
                                        </IconButton>
                                        <IconButton size="xl" bordered>
                                            <Icon name="duplicate" size={18} />
                                        </IconButton>
                                    </Row>
                                    <div class="flex items-center gap-1 rounded-lg bg-[#0a0a0c] p-1.5">
                                        <IconButton size="md" tone="onDark">
                                            <Icon name="undo" size={16} />
                                        </IconButton>
                                        <IconButton size="md" tone="onDark">
                                            <Icon name="redo" size={16} />
                                        </IconButton>
                                        <IconButton size="md" tone="onDark" active>
                                            <Icon name="present" size={16} />
                                        </IconButton>
                                    </div>
                                </div>
                            </Panel>
                        </div>
                        <div class="mt-5">
                            <Panel label="Chips · badges · feedback">
                                <Row>
                                    <Chip>Outline</Chip>
                                    <Chip variant="outline" selected>
                                        Selected
                                    </Chip>
                                    <Chip variant="solid" selected>
                                        Solid
                                    </Chip>
                                    <Badge>Pro</Badge>
                                    <Badge tone="accentSolid">New</Badge>
                                    <Badge tone="muted">3</Badge>
                                    <Spinner tone="accent" />
                                    <Spinner tone="line" />
                                    <span class="mx-1 h-4 w-px bg-line" />
                                    <Eyebrow tracking="wide">wide</Eyebrow>
                                    <Eyebrow tracking="wider">wider</Eyebrow>
                                    <Eyebrow tracking="widest">widest</Eyebrow>
                                </Row>
                            </Panel>
                        </div>
                    </Section>

                    <Section
                        n="02"
                        title="Inputs"
                        desc="Form primitives, and the scaffolding composed into a real inspector."
                    >
                        <div class="grid gap-5 lg:grid-cols-3">
                            <Panel label="Fields">
                                <div class="grid gap-3">
                                    <FieldRow label="Text field">
                                        <TextField value={text()} onChange={setText} />
                                    </FieldRow>
                                    <FieldRow label="Text area">
                                        <TextArea value={area()} onChange={setArea} />
                                    </FieldRow>
                                    <FieldRow label="Dropdown (font preview)">
                                        <Dropdown
                                            value={font()}
                                            options={FONTS}
                                            onChange={setFont}
                                        />
                                    </FieldRow>
                                </div>
                            </Panel>
                            <Panel label="Controls">
                                <div class="grid gap-3">
                                    <FieldRow label="Segmented — text">
                                        <Segmented
                                            value={seg()}
                                            onChange={setSeg}
                                            options={[
                                                { label: "Deck", value: "deck" },
                                                { label: "Doc", value: "doc" },
                                                { label: "Site", value: "web" },
                                            ]}
                                        />
                                    </FieldRow>
                                    <FieldRow label="Segmented — icons">
                                        <Segmented
                                            value={segIcon()}
                                            onChange={setSegIcon}
                                            options={[
                                                { label: "Stack", value: "stack", icon: "stack" },
                                                { label: "Row", value: "row", icon: "row" },
                                                { label: "Grid", value: "grid", icon: "columns" },
                                            ]}
                                        />
                                    </FieldRow>
                                    <FieldRow label="Alignment">
                                        <AlignField value={align()} onChange={setAlign} />
                                    </FieldRow>
                                    <FieldRow label={`Slider · ${slider()}px`}>
                                        <Slider
                                            value={slider()}
                                            min={0}
                                            max={28}
                                            unit="px"
                                            onChange={setSlider}
                                        />
                                    </FieldRow>
                                </div>
                            </Panel>
                            {/* composed: a real inspector built from the scaffolding + primitives */}
                            <div class="pg-card rounded-2xl border border-line p-5 backdrop-blur-md">
                                <PanelHeader
                                    title="Table"
                                    action={
                                        <IconButton size="sm">
                                            <Icon name="duplicate" size={14} />
                                        </IconButton>
                                    }
                                />
                                <Group label="Rows" divider>
                                    <FieldRow label="Header row">
                                        <Toggle value={toggle()} onChange={setToggle} />
                                    </FieldRow>
                                    <FieldRow label="Zebra striping">
                                        <Toggle value={zebra()} onChange={setZebra} />
                                    </FieldRow>
                                </Group>
                                <Group label="Style" divider>
                                    <FieldRow label={`Padding · ${pad()}px`}>
                                        <Slider
                                            value={pad()}
                                            min={4}
                                            max={32}
                                            unit="px"
                                            onChange={setPad}
                                        />
                                    </FieldRow>
                                    <FieldRow label="Border color">
                                        <ColorPopover
                                            value={inspectColor()}
                                            swatches={swatches(themeId())}
                                            onChange={setInspectColor}
                                            clearLabel="Reset"
                                        />
                                    </FieldRow>
                                </Group>
                            </div>
                        </div>
                    </Section>

                    <Section
                        n="03"
                        title="Color"
                        desc="The one color surface — inline picker and a popover."
                    >
                        <div class="grid gap-5 md:grid-cols-2">
                            <Panel label="ColorPicker (inline)">
                                <ColorPicker
                                    value={color()}
                                    swatches={swatches(themeId())}
                                    onChange={setColor}
                                    clearLabel="Reset"
                                />
                            </Panel>
                            <Panel label="ColorPopover (trigger)">
                                <div class="flex items-center gap-3">
                                    <ColorPopover
                                        value={pop()}
                                        swatches={swatches(themeId())}
                                        onChange={setPop}
                                        clearLabel="Remove"
                                    />
                                    <span class="text-[12px] text-muted">
                                        click to open the popover
                                    </span>
                                </div>
                            </Panel>
                        </div>
                    </Section>

                    <Section
                        n="04"
                        title="Overlays"
                        desc="Two base primitives — Popover and Modal — plus their composites."
                    >
                        <div class="grid gap-5 md:grid-cols-2">
                            <Panel label="Dialogs">
                                <Row>
                                    <Button variant="outline" onClick={() => setModal(true)}>
                                        Open Modal
                                    </Button>
                                    <Button variant="danger" onClick={() => setConfirm(true)}>
                                        Delete…
                                    </Button>
                                </Row>
                                <p class="mt-3 text-[12px] text-muted">
                                    The Dropdown + ColorPopover above are Popovers (portaled,
                                    theme-snapshotted).
                                </p>
                            </Panel>
                            <Panel label="FloatingBar — dark & panel">
                                <div class="flex flex-col gap-3">
                                    <div class="relative h-16 overflow-hidden rounded-xl bg-[#0a0a0c]">
                                        <SlideProgress index={2} total={6} />
                                        <FloatingBar tone="dark">
                                            <IconButton size="md" tone="onDark">
                                                <Icon name="chevronLeft" size={16} />
                                            </IconButton>
                                            <span class="px-1.5 font-mono text-[12px] tabular-nums">
                                                3 / 6
                                            </span>
                                            <IconButton size="md" tone="onDark">
                                                <Icon name="chevronRight" size={16} />
                                            </IconButton>
                                        </FloatingBar>
                                    </div>
                                    <div class="relative grid h-16 place-items-center">
                                        <FloatingBar tone="panel" anchor="free" rounded="full">
                                            <IconButton size="sm">
                                                <Icon name="bold" size={15} />
                                            </IconButton>
                                            <IconButton size="sm">
                                                <Icon name="italic" size={15} />
                                            </IconButton>
                                            <IconButton size="sm" active>
                                                <Icon name="link" size={15} />
                                            </IconButton>
                                        </FloatingBar>
                                    </div>
                                </div>
                            </Panel>
                        </div>
                    </Section>

                    <Section
                        n="05"
                        title="Canvas"
                        desc="Real engine renders of sections, scaled — a filmstrip and a natural frame."
                    >
                        <Panel>
                            <div class="flex flex-wrap items-start gap-8">
                                <div>
                                    <Eyebrow class="mb-2 block">
                                        filmstrip · click to select
                                    </Eyebrow>
                                    <div class="flex gap-3">
                                        <For each={SAMPLES}>
                                            {(s, i) => (
                                                <ScaledSectionCanvas
                                                    section={s}
                                                    theme={tokens()}
                                                    profile={resolveProfile("deck")}
                                                    width={170}
                                                    frame="slide"
                                                    as="button"
                                                    selected={selCanvas() === i()}
                                                    onOpen={() => setSelCanvas(i())}
                                                />
                                            )}
                                        </For>
                                    </div>
                                </div>
                                <div>
                                    <Eyebrow class="mb-2 block">frame = natural</Eyebrow>
                                    <ScaledSectionCanvas
                                        section={SAMPLES[selCanvas()] ?? SAMPLES[0]!}
                                        theme={tokens()}
                                        profile={resolveProfile("doc")}
                                        width={240}
                                        frame="natural"
                                        index={selCanvas()}
                                    />
                                </div>
                            </div>
                        </Panel>
                    </Section>

                    <Section
                        n="06"
                        title="Icons"
                        desc={`The unified ${ICON_NAMES.length}-glyph registry.`}
                    >
                        <Panel>
                            <div class="flex flex-wrap gap-1.5">
                                <For each={ICON_NAMES}>
                                    {(name) => (
                                        <div
                                            class="grid h-9 w-9 place-items-center rounded-md border border-line text-ink transition-colors hover:border-accent hover:text-accent"
                                            title={name}
                                        >
                                            <Icon name={name} size={18} />
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Panel>
                    </Section>
                </main>

                <Show when={modal()}>
                    <Modal onClose={() => setModal(false)} size="md" class="p-6">
                        <div class="mb-4 flex items-center justify-between">
                            <h2 class="font-display text-[20px] font-semibold">Modal shell</h2>
                            <IconButton onClick={() => setModal(false)}>
                                <CloseIcon size={15} />
                            </IconButton>
                        </div>
                        <p class="text-[13.5px] leading-relaxed text-soft">
                            One base shell — scrim, centering, esc-to-close, and the open animation
                            — themed by its ancestor. Composites like ConfirmModal build on it.
                        </p>
                    </Modal>
                </Show>

                <Show when={confirm()}>
                    <ConfirmModal
                        title="Delete artifact?"
                        body="This moves it to trash. You can restore it later."
                        confirmLabel="Delete"
                        danger
                        onConfirm={() => setConfirm(false)}
                        onCancel={() => setConfirm(false)}
                    />
                </Show>
            </div>
        </UiThemeProvider>
    );
};
