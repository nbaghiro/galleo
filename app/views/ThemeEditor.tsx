import type { Theme, Tokens } from "@themes";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useLocation } from "@solidjs/router";
import { luminance, themeCssVars, resolveTheme, THEME_LIST } from "@themes";
import { resolveProfile } from "@engine/profile";
import { paintSectionStack } from "@canvas/render/backends";
import { setArtifactTheme } from "@elements/ops";
import { commit, editor, endThemePreview } from "@editor/editor";
import { ColorPopover, ThemeSwatch, type ColorSwatch } from "@ui/color";
import { Dropdown } from "@ui/select";
import { Button, IconButton, Eyebrow } from "@ui/button";
import { Slider, Segmented, TextField, TextArea } from "@ui/inputs";
import { Modal } from "@ui/overlay";
import { ChevronLeftIcon, CloseIcon, EditIcon, RefreshIcon } from "@ui/icons";
import { SectionThumb } from "../components/previews";
import { api } from "../api";
import {
    appTheme,
    setAppTheme,
    setAppThemePreview,
    saveCustomTheme,
    updateCustomTheme,
    customThemes,
    removeCustomTheme,
    themeEditorOpen,
    closeThemeEditor,
    THEME_SAMPLE,
    type ThemeDraft,
} from "../theme";
import { themeDemo } from "./theme-demo";

const DISPLAY_FONTS = [
    "Fraunces",
    "Playfair Display",
    "Cormorant Garamond",
    "Bodoni Moda",
    "Newsreader",
    "Spectral",
    "Marcellus",
    "Cinzel",
    "Prata",
    "Yeseva One",
    "Anton",
    "Oswald",
    "Space Grotesk",
    "Bricolage Grotesque",
    "Sora",
    "Archivo",
    "Quicksand",
];
const BODY_FONTS = [
    "Hanken Grotesk",
    "Manrope",
    "Mulish",
    "Jost",
    "Figtree",
    "Outfit",
    "Nunito",
    "Albert Sans",
    "Plus Jakarta Sans",
    "Barlow",
    "Inter Tight",
    "Lora",
];
const MONO_FONTS = [
    "DM Mono",
    "IBM Plex Mono",
    "Geist Mono",
    "Space Mono",
    "JetBrains Mono",
    "Fragment Mono",
    "Overpass Mono",
];

const SHADOW_PRESETS: [string, string][] = [
    ["none", "None"],
    ["soft", "Soft lift"],
    ["hard", "Hard offset"],
    ["glow", "Accent glow"],
];
const shadowCss = (preset: string, accent: string): string =>
    preset === "soft"
        ? "0 14px 32px -16px rgba(0,0,0,.5)"
        : preset === "hard"
          ? `6px 6px 0 ${accent}`
          : preset === "glow"
            ? `0 0 26px -4px ${accent}`
            : "none";
const inferShadow = (s: string | undefined): string => {
    if (!s || s === "none") return "none";
    if (s.includes("6px 6px")) return "hard";
    if (s.startsWith("0 0 ")) return "glow";
    return "soft";
};

const FORMATS: [string, string][] = [
    ["deck", "Deck"],
    ["doc", "Doc"],
    ["web", "Site"],
];

const CARD_W = 150; // two theme cards per row inside the 360px rail

// A broad, real-life catalog of theme briefs — the "shuffle" cycles through these instead of an LLM call.
// Each is a designer-style brief: a brand/context + a color direction + a type direction, spanning
// industries (tech · finance · health · legal · creative · retail · food · travel · education · …) and
// moods (minimal · editorial · luxe · brutalist · playful · retro · organic · corporate · dark).
const THEME_PROMPTS = [
    // tech / SaaS / startup
    "Developer tools startup — near-black UI, electric-lime accent, monospaced headings",
    "AI research lab — clean white, cobalt accent, precise geometric sans",
    "Fintech dashboard — deep navy, restrained mint accent, crisp grotesque",
    "Cybersecurity platform — charcoal, alert-red accent, condensed grotesque",
    "Crypto exchange — obsidian black, gold accent, tight modern sans",
    "Cloud infrastructure — cool graphite, teal accent, technical mono labels",
    "Electric-vehicle startup — clean white, electric blue, sleek minimal sans",
    // corporate / professional
    "Management consultancy — ivory and navy, understated, classic serif",
    "Corporate law firm — deep forest green, cream, traditional high serif",
    "Investment bank — charcoal and gold, austere, transitional serif",
    "Insurance brand — trustworthy blue, warm gray, friendly rounded sans",
    "Modern real-estate agency — crisp white, deep navy, confident sans",
    // health / wellness
    "Calm wellness app — sage green, warm sand, airy light serif",
    "Meditation brand — dusty lavender, soft cream, humanist sans",
    "Biotech company — clinical white, deep teal, precise modern sans",
    "Boutique fitness studio — bold black, energetic orange, condensed bold sans",
    "Dental clinic — clean mint, white, approachable rounded sans",
    // creative / agency
    "Design studio portfolio — stark white, single red accent, editorial serif",
    "Photography portfolio — full black, minimal, thin elegant sans",
    "Architecture firm — concrete gray, warm white, refined grotesque",
    "Branding agency — bold cream and ink, oversized display serif",
    "Film production house — cinematic black, amber accent, dramatic serif",
    // consumer / lifestyle / retail
    "Specialty coffee roaster — warm espresso brown, cream, rustic slab serif",
    "Craft brewery — muted olive, kraft tan, vintage condensed caps",
    "Skincare brand — blush pink, soft beige, delicate light serif",
    "Luxury fashion house — black and gold, elegant high-contrast serif",
    "Streetwear label — stark black and white, bold condensed caps",
    "Home-goods store — warm terracotta, oat, organic humanist serif",
    "Independent plant shop — fresh green, cream, friendly rounded sans",
    "Artisan bakery — buttery cream, cocoa brown, cozy handmade serif",
    // food / hospitality
    "Fine-dining restaurant — deep burgundy, gold, refined serif",
    "Farm-to-table cafe — sage and cream, natural, warm serif",
    "Boutique hotel — warm taupe, brass accent, elegant modern serif",
    "Art-deco cocktail bar — moody plum, brass, geometric deco display",
    // education / nonprofit / civic
    "Kids' learning app — bright cheerful pastels, rounded friendly type",
    "University program — traditional navy, gold, scholarly serif",
    "Environmental nonprofit — forest green, recycled-paper cream, honest sans",
    "Climate research report — cool slate, data-red accent, clean neutral sans",
    // travel / outdoor / auto
    "Luxury travel brand — warm sand, ocean teal, elegant serif",
    "Adventure outdoor gear — rugged charcoal, safety orange, bold condensed",
    // music / media / gaming
    "Indie music label — moody dark, neon-magenta accent, bold display",
    "Podcast network — warm dark brown, cream, friendly editorial serif",
    "Retro arcade game — dark space navy, neon pixel colors, blocky display",
    "News magazine — newsprint cream, ink black, classic newspaper serif",
    // distinctive moods
    "Brutalist portfolio — raw concrete gray, stark black, oversized grotesque",
    "Warm mid-century brand — mustard and teal, cream, geometric sans",
    "Minimal art gallery — pure white, single black, refined minimal serif",
];

// Fisher–Yates: a fresh random order of the idea catalog, computed once each time the modal opens.
function shuffledPrompts(): string[] {
    const a = [...THEME_PROMPTS];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]!;
        a[i] = a[j]!;
        a[j] = t;
    }
    return a;
}

const GEN_STEPS = [
    "Choosing a palette",
    "Pairing the type",
    "Balancing contrast",
    "Finishing touches",
];

// The theme editor — a single large modal that is the whole theme surface. The left rail swaps between
// a predefined-theme picker ("Themes") and the custom token editor ("Customize"); the right is a live
// preview of the real artifact (in its own format) over the editor, else a generic demo artifact. The
// current theme is selected on open; picking one applies it live; Customize forks/edits it further.
// A thin wrapper mounts the stateful panel fresh on each open so it re-seeds from the current context.
export const ThemeEditor: Component = () => (
    <Show when={themeEditorOpen()}>
        <ThemeEditorPanel />
    </Show>
);

const ThemeEditorPanel: Component = () => {
    const location = useLocation();
    // Snapshot the context at open — the modal never outlives a navigation, so this holds for its life.
    const editing = location.pathname.includes("/edit/");
    const currentId = editing ? editor.artifact.theme : appTheme();

    const [mode, setMode] = createSignal<"list" | "custom" | "generate">("list");
    const [selectedId, setSelectedId] = createSignal(currentId);
    const [editTargetId, setEditTargetId] = createSignal<string | null>(null); // set → updating a custom theme

    const baseTokens = resolveTheme(currentId).tokens;
    const [tk, setTk] = createStore<Tokens>({
        ...baseTokens,
        border: baseTokens.border ?? 1,
        scrim: baseTokens.scrim ?? 0.45,
    });
    const [name, setName] = createSignal("Custom theme");
    const [tag, setTag] = createSignal("custom");
    const [format, setFormat] = createSignal("web");
    const [shadowPreset, setShadowPreset] = createSignal(inferShadow(baseTokens.shadow));
    const [busy, setBusy] = createSignal(false);
    const [width, setWidth] = createSignal(900);

    // AI theme generation (the "Generate" panel).
    const [genPrompt, setGenPrompt] = createSignal("");
    const [genMode, setGenMode] = createSignal<"auto" | "light" | "dark">("auto");
    const [genBusy, setGenBusy] = createSignal(false);
    const [genError, setGenError] = createSignal("");
    const [genStep, setGenStep] = createSignal(0);
    const [genDone, setGenDone] = createSignal(false); // generation finished → reveal the shared editor
    // The token editor is shown both in Customize and after a generation (the Generate tab stays selected).
    const editorActive = (): boolean => mode() === "custom" || (mode() === "generate" && genDone());

    // The idea catalog, shown a page at a time — the shuffle icon advances the window (no LLM call).
    const EX_PER_PAGE = 5;
    const [exPage, setExPage] = createSignal(0);
    const deck = shuffledPrompts(); // a fresh random order per open; the shuffle icon windows through it
    const examples = (): string[] =>
        Array.from({ length: EX_PER_PAGE }, (_, i) => {
            const start = (exPage() * EX_PER_PAGE) % deck.length;
            return deck[(start + i) % deck.length]!;
        });

    const isCustom = (id: string): boolean => customThemes().some((t) => t.id === id);
    const formatLabel = (): string =>
        FORMATS.find(([fid]) => fid === editor.artifact.format)?.[1] ?? editor.artifact.format;
    // The format the preview renders in — the artifact's own over the editor, else the demo toggle.
    const previewFormat = (): string => (editing ? editor.artifact.format : format());

    // The switcher wears the live theme it's showing — the working draft while editing (Customize or a
    // generated result), else the selected theme in the picker — so the modal chrome, the preview, and the
    // app behind it all move together on every edit. (A mid-edit illegible color is on the user for now.)
    const panelVars = createMemo(
        (): JSX.CSSProperties =>
            themeCssVars(
                editorActive() ? { ...tk } : resolveTheme(selectedId()).tokens,
            ) as JSX.CSSProperties,
    );

    // Load a theme's tokens into the working store (drives the preview) + sync the shadow preset.
    const loadTokens = (id: string): void => {
        const t = resolveTheme(id).tokens;
        setTk({ ...t, border: t.border ?? 1, scrim: t.scrim ?? 0.45 });
        setShadowPreset(inferShadow(t.shadow));
    };

    // Leaving a generated result (a tab switch, or "back to prompt") abandons it: revert the draft, the
    // chrome snapshot, and the app preview to the pre-generation theme so nothing carries the unsaved theme.
    const discardGenerated = (): void => {
        if (!genDone()) return;
        setGenDone(false);
        loadTokens(selectedId());
    };

    // Pick a predefined/custom theme in list mode: apply it live (context-aware) and mirror it into the
    // working store so the preview shows it. In the editor this commits an undoable theme change.
    const pick = (id: string): void => {
        setSelectedId(id);
        setGenDone(false); // a picked theme supersedes any generated draft
        loadTokens(id);
        if (editing) {
            endThemePreview();
            commit(setArtifactTheme(editor.artifact, id));
        } else {
            setAppTheme(id);
        }
    };

    // Drop into the token editor over the selected theme's values — updating it if it's already a custom
    // theme, else forking it into a new one. The working store already holds the selected tokens.
    const enterCustom = (): void => {
        if (mode() === "custom") return;
        discardGenerated(); // switching to Customize abandons any unsaved generated theme
        const sel = selectedId();
        const editable = isCustom(sel);
        setEditTargetId(editable ? sel : null);
        setName(editable ? resolveTheme(sel).name : "Custom theme");
        setTag(resolveTheme(sel).tag || "custom");
        setMode("custom");
    };

    // The pencil on a custom card: edit that theme directly (Save updates it in place).
    const editCustom = (t: Theme): void => {
        setSelectedId(t.id);
        loadTokens(t.id);
        setEditTargetId(t.id);
        setName(t.name);
        setTag(t.tag || "custom");
        setMode("custom");
    };

    // Generate a theme from a text prompt (Gemini Flash, a few seconds), load it into the working store,
    // and reveal the shared editor in place — the Generate tab stays selected — to fine-tune and save.
    const runGenerate = async (): Promise<void> => {
        const p = genPrompt().trim();
        if (!p || genBusy()) return;
        setGenBusy(true);
        setGenError("");
        try {
            const isDark = genMode() === "auto" ? undefined : genMode() === "dark";
            const { theme } = await api.generateTheme(p, isDark);
            const t = theme.tokens;
            setTk({ ...t, border: t.border ?? 1, scrim: t.scrim ?? 0.45 });
            setShadowPreset(inferShadow(t.shadow));
            setName(theme.name);
            setTag(theme.mood ?? "custom");
            setEditTargetId(null); // Save creates a new custom theme
            setGenDone(true); // stay on Generate; the shared editor takes over from the loader
        } catch (e) {
            setGenError(e instanceof Error ? e.message : "Generation failed.");
        } finally {
            setGenBusy(false);
        }
    };

    // In the token editor the shadow token follows the chosen preset + the live accent; in list mode the
    // loaded theme keeps its own shadow untouched.
    createEffect(() => {
        if (editorActive()) setTk("shadow", shadowCss(shadowPreset(), tk.accent));
    });

    // Live app-chrome preview: while editing tokens (Customize or a generated result) the draft recolors
    // the app behind the modal; picking in list mode applies the real theme instead. Cleared on close.
    createEffect(() => {
        if (editorActive()) setAppThemePreview({ ...tk });
        else setAppThemePreview(null);
    });
    onCleanup(() => setAppThemePreview(null));

    // Rotate the loader's status line while a theme is generating.
    createEffect(() => {
        if (!genBusy()) return;
        setGenStep(0);
        const id = window.setInterval(() => setGenStep((s) => (s + 1) % GEN_STEPS.length), 1400);
        onCleanup(() => window.clearInterval(id));
    });

    let scroll!: HTMLDivElement;
    let host!: HTMLDivElement;

    // Re-lay-out + repaint on any token / format / width change. Spreading the store reads every field,
    // so the effect tracks all of them. The preview renders the real artifact (in its own format) when
    // opened over the editor, and the generic demo artifact everywhere else — always with the live tokens.
    const draw = (): void => {
        if (!host) return;
        const snap = { ...tk };
        const sections = editing ? editor.artifact.sections : themeDemo(snap);
        const profile = resolveProfile(editing ? editor.artifact.format : format());
        const fullW = Math.max(360, width());
        host.replaceChildren();
        const { height } = paintSectionStack(host, sections, profile, snap, { fullW });
        host.style.cssText = `position:relative;width:${fullW}px;height:${height}px`;
    };
    createEffect(draw);

    onMount(() => {
        const ro = new ResizeObserver(() => setWidth(scroll.clientWidth));
        ro.observe(scroll);
        setWidth(scroll.clientWidth);
        // web fonts arrive after first paint — re-measure once they finish so the type reflows correctly
        const onFonts = (): void => draw();
        document.fonts.ready.then(onFonts);
        document.fonts.addEventListener("loadingdone", onFonts);

        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") closeThemeEditor();
            if (
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter" &&
                mode() === "generate" &&
                !genDone()
            )
                void runGenerate();
        };
        window.addEventListener("keydown", onKey);

        onCleanup(() => {
            ro.disconnect();
            document.fonts.removeEventListener("loadingdone", onFonts);
            window.removeEventListener("keydown", onKey);
        });
    });

    // Save the custom theme, then apply to the surface the modal was opened over — the artifact while
    // editing, else the app-chrome theme. Updates an existing custom theme, or creates a new one.
    const save = async (): Promise<void> => {
        setBusy(true);
        const draft: ThemeDraft = {
            name: name().trim() || "Custom theme",
            tokens: { ...tk },
            tag: tag().trim() || "custom",
            dark: luminance(tk.bg) < 0.5,
        };
        const et = editTargetId();
        const saved = et ? await updateCustomTheme(et, draft) : await saveCustomTheme(draft);
        setBusy(false);
        if (!saved) return;
        setAppThemePreview(null);
        if (editing) {
            endThemePreview();
            commit(setArtifactTheme(editor.artifact, saved.id));
        } else {
            setAppTheme(saved.id);
        }
        closeThemeEditor();
    };

    // ── theme picker card ──
    const card = (t: Theme, custom: boolean): JSX.Element => (
        <div class="group" style={{ width: `${CARD_W}px` }}>
            <SectionThumb
                section={THEME_SAMPLE}
                themeId={t.id}
                formatId="deck"
                width={CARD_W}
                selected={selectedId() === t.id}
                onOpen={() => pick(t.id)}
            />
            <div class="mt-1.5 flex items-center gap-1.5">
                <ThemeSwatch themeId={t.id} rounded="rounded" />
                <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                    {t.name}
                </span>
                <Show when={custom}>
                    <span class="hidden items-center gap-0.5 group-hover:flex">
                        <IconButton
                            size="xs"
                            rounded="md"
                            title="Customize theme"
                            onClick={() => editCustom(t)}
                        >
                            <EditIcon size={13} />
                        </IconButton>
                        <IconButton
                            size="xs"
                            rounded="md"
                            title="Delete theme"
                            onClick={() => removeCustomTheme(t.id)}
                        >
                            <CloseIcon size={13} />
                        </IconButton>
                    </span>
                </Show>
            </div>
        </div>
    );

    // ── custom-mode control fields ──
    const paletteSwatches = (): ColorSwatch[] => [
        { label: "Canvas", color: tk.bg },
        { label: "Surface", color: tk.surface },
        { label: "Ink", color: tk.ink },
        { label: "Soft", color: tk.soft },
        { label: "Muted", color: tk.muted },
        { label: "Accent", color: tk.accent },
        { label: "On accent", color: tk.onAccent },
        { label: "Line", color: tk.line },
    ];
    const colorField = (key: keyof Tokens, label: string): JSX.Element => (
        <div class="flex items-center justify-between gap-2.5 py-1">
            <span class="text-[12.5px] text-soft">{label}</span>
            <ColorPopover
                value={String(tk[key])}
                swatches={paletteSwatches()}
                onChange={(v) => v && setTk(key, v)}
            />
        </div>
    );

    const rangeField = (
        key: "radius" | "border" | "headingWeight",
        label: string,
        min: number,
        max: number,
        step: number,
        unit: string,
    ): JSX.Element => (
        <div class="flex items-center gap-2.5 py-1">
            <span class="w-[84px] flex-none text-[12.5px] text-soft">{label}</span>
            <div class="min-w-0 flex-1">
                <Slider
                    value={(tk[key] as number) ?? min}
                    min={min}
                    max={max}
                    step={step}
                    unit={unit}
                    onChange={(n) => setTk(key, n)}
                />
            </div>
        </div>
    );

    const fontField = (
        key: "fontDisplay" | "fontBody" | "fontMono",
        label: string,
        list: string[],
    ): JSX.Element => (
        <div class="flex items-center gap-2.5 py-1">
            <span class="w-[84px] flex-none text-[12.5px] text-soft">{label}</span>
            <div class="min-w-0 flex-1">
                <Dropdown
                    value={tk[key]}
                    options={list.map((f) => ({ label: f, value: f, font: f }))}
                    onChange={(v) => setTk(key, v)}
                />
            </div>
        </div>
    );

    const heading = (label: string): JSX.Element => (
        <Eyebrow as="div" weight="normal" tracking="wider" size={9.5} class="mb-1 mt-4">
            {label}
        </Eyebrow>
    );

    return (
        <Modal
            size="full"
            scrim="light"
            z={60}
            vars={panelVars()}
            class="flex h-[90vh] max-h-[1000px] overflow-hidden"
            onClose={() => closeThemeEditor()}
        >
            {/* ── left rail: Themes ⇄ Customize ── */}
            <aside class="flex w-[360px] flex-none flex-col border-r border-line bg-panel">
                <header class="flex flex-none items-center gap-2 border-b border-line px-3 py-3">
                    <div class="flex-1">
                        <Segmented
                            variant="accent"
                            value={mode()}
                            options={[
                                { value: "list", label: "Themes" },
                                { value: "custom", label: "Customize" },
                                { value: "generate", label: "Generate" },
                            ]}
                            onChange={(v) => {
                                if (v === "list") {
                                    discardGenerated();
                                    setMode("list");
                                } else if (v === "custom") enterCustom();
                                else setMode("generate");
                            }}
                        />
                    </div>
                    <IconButton
                        size="lg"
                        tone="muted"
                        class="flex-none"
                        title="Close"
                        onClick={() => closeThemeEditor()}
                    >
                        <CloseIcon size={15} />
                    </IconButton>
                </header>

                <div class="min-h-0 flex-1 overflow-y-auto">
                    {/* ── themes picker ── */}
                    <Show when={mode() === "list"}>
                        <div class="px-4 py-3">
                            <Show when={customThemes().length}>
                                <div class="mb-2 flex items-center justify-between">
                                    <Eyebrow weight="normal">My themes</Eyebrow>
                                    <span class="font-mono text-[9px] text-accent">synced</span>
                                </div>
                                <div class="mb-5 flex flex-wrap gap-3">
                                    <For each={customThemes()}>{(t) => card(t, true)}</For>
                                </div>
                            </Show>
                            <Eyebrow as="div" weight="normal" class="mb-2">
                                Built-in
                            </Eyebrow>
                            <div class="flex flex-wrap gap-3">
                                <For each={THEME_LIST}>{(t) => card(t, false)}</For>
                            </div>
                            <p class="mt-4 text-[11px] leading-relaxed text-muted">
                                Pick one to apply it, or hit{" "}
                                <span class="text-soft">Customize</span> to tweak it into your own.
                            </p>
                        </div>
                    </Show>

                    {/* ── AI theme generation ── */}
                    <Show when={mode() === "generate"}>
                        <Show when={!genDone()}>
                            <Show
                                when={!genBusy()}
                                fallback={
                                    <div class="flex flex-col items-center gap-6 px-4 py-16 text-center">
                                        <div class="flex gap-2">
                                            <For each={[0, 1, 2, 3, 4, 5, 6]}>
                                                {(i) => (
                                                    <span
                                                        class="theme-gen-swatch h-7 w-7 rounded-lg"
                                                        style={{
                                                            "animation-delay": `${i * 130}ms`,
                                                        }}
                                                    />
                                                )}
                                            </For>
                                        </div>
                                        <div>
                                            <div
                                                class="text-[16px] text-ink"
                                                style={{ "font-family": "var(--font-display)" }}
                                            >
                                                Designing your theme
                                            </div>
                                            <div class="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                                                {GEN_STEPS[genStep()]}…
                                            </div>
                                        </div>
                                    </div>
                                }
                            >
                                <div class="px-4 py-4">
                                    <Eyebrow
                                        as="div"
                                        weight="normal"
                                        tracking="widest"
                                        class="mb-2"
                                    >
                                        Describe
                                    </Eyebrow>
                                    <h2
                                        class="mb-1 text-[22px] leading-tight text-ink"
                                        style={{ "font-family": "var(--font-display)" }}
                                    >
                                        Generate a theme
                                    </h2>
                                    <p class="mb-4 text-[12.5px] leading-relaxed text-muted">
                                        Describe a mood, brand, or vibe — the AI designs a full
                                        color-and-type system (palette, fonts, shape) you can
                                        preview, tweak, and save.
                                    </p>
                                    <TextArea
                                        rounded="xl"
                                        class="min-h-[120px] placeholder:text-muted"
                                        placeholder="e.g. warm mid-century — terracotta and cream, editorial serif, soft corners"
                                        value={genPrompt()}
                                        onChange={(v) => setGenPrompt(v)}
                                    />

                                    <Eyebrow
                                        as="div"
                                        weight="normal"
                                        tracking="widest"
                                        class="mb-1.5 mt-4"
                                    >
                                        Mode
                                    </Eyebrow>
                                    <Segmented
                                        variant="accent"
                                        value={genMode()}
                                        options={[
                                            { value: "auto", label: "Auto" },
                                            { value: "light", label: "Light" },
                                            { value: "dark", label: "Dark" },
                                        ]}
                                        onChange={(v) => setGenMode(v as "auto" | "light" | "dark")}
                                    />

                                    <div class="mb-2 mt-5 flex items-center justify-between">
                                        <Eyebrow weight="normal" tracking="widest">
                                            Or start from an idea
                                        </Eyebrow>
                                        <IconButton
                                            size="sm"
                                            rounded="md"
                                            title="Shuffle ideas"
                                            onClick={() => setExPage((p) => p + 1)}
                                        >
                                            <RefreshIcon size={13} />
                                        </IconButton>
                                    </div>
                                    <div class="flex flex-col gap-1.5">
                                        <For each={examples()}>
                                            {(ex) => (
                                                <button
                                                    class="rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-soft transition-colors hover:border-accent hover:text-ink"
                                                    onClick={() => setGenPrompt(ex)}
                                                >
                                                    {ex}
                                                </button>
                                            )}
                                        </For>
                                    </div>

                                    <Button
                                        variant="primary"
                                        size="lg"
                                        rounded="xl"
                                        class="mt-5 w-full"
                                        disabled={genBusy() || !genPrompt().trim()}
                                        onClick={runGenerate}
                                    >
                                        {genBusy() ? "Designing…" : "✨ Generate theme"}
                                    </Button>
                                    <Show when={genError()}>
                                        <p class="mt-2 text-[11.5px]" style={{ color: "#C0392B" }}>
                                            {genError()}
                                        </p>
                                    </Show>
                                    <p class="mt-3 text-[11px] leading-relaxed text-muted">
                                        Generates in a few seconds — the result opens in Customize,
                                        ready to fine-tune and save.
                                    </p>
                                </div>
                            </Show>
                        </Show>
                    </Show>

                    {/* ── token editor: shared by Customize + a generated result ── */}
                    <Show when={editorActive()}>
                        <div class="px-4 pb-6">
                            <div class="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
                                <Show when={mode() === "generate"}>
                                    <IconButton
                                        size="lg"
                                        tone="muted"
                                        class="flex-none"
                                        title="Back to prompt"
                                        onClick={() => discardGenerated()}
                                    >
                                        <ChevronLeftIcon size={17} />
                                    </IconButton>
                                </Show>
                                <TextField
                                    value={name()}
                                    placeholder="Theme name"
                                    class="min-w-0 flex-1 font-semibold"
                                    onChange={(v) => setName(v)}
                                />
                                <Button
                                    variant="primary"
                                    size="sm"
                                    class="flex-none"
                                    disabled={busy()}
                                    onClick={save}
                                >
                                    {editTargetId() ? "Update" : "Save"}
                                </Button>
                            </div>

                            <div class="mx-auto w-full max-w-[300px]">
                                {heading("Details")}
                                <div class="flex items-center justify-between gap-2.5 py-1">
                                    <span class="text-[12.5px] text-soft">Style tag</span>
                                    <TextField
                                        compact
                                        value={tag()}
                                        placeholder="editorial, cyber…"
                                        class="w-[150px]"
                                        onChange={(v) => setTag(v)}
                                    />
                                </div>

                                {heading("Color")}
                                {colorField("bg", "Canvas")}
                                {colorField("surface", "Surface")}
                                {colorField("ink", "Ink")}
                                {colorField("soft", "Soft text")}
                                {colorField("muted", "Muted")}
                                {colorField("accent", "Accent")}
                                {colorField("onAccent", "On accent")}
                                {colorField("line", "Line")}

                                {heading("Type")}
                                {fontField("fontDisplay", "Display", DISPLAY_FONTS)}
                                {fontField("fontBody", "Body", BODY_FONTS)}
                                {fontField("fontMono", "Mono", MONO_FONTS)}
                                {rangeField("headingWeight", "Weight", 300, 900, 100, "")}

                                {heading("Shape")}
                                {rangeField("radius", "Radius", 0, 28, 1, "px")}
                                {rangeField("border", "Border", 0, 4, 1, "px")}
                                <div class="flex items-center gap-2.5 py-1">
                                    <span class="w-[84px] flex-none text-[12.5px] text-soft">
                                        Shadow
                                    </span>
                                    <div class="min-w-0 flex-1">
                                        <Dropdown
                                            value={shadowPreset()}
                                            options={SHADOW_PRESETS.map((o) => ({
                                                value: o[0],
                                                label: o[1],
                                            }))}
                                            onChange={setShadowPreset}
                                        />
                                    </div>
                                </div>
                                <div class="flex items-center gap-2.5 py-1">
                                    <span class="w-[84px] flex-none text-[12.5px] text-soft">
                                        Image scrim
                                    </span>
                                    <div class="min-w-0 flex-1">
                                        <Slider
                                            value={Math.round((tk.scrim ?? 0.45) * 100)}
                                            min={0}
                                            max={90}
                                            step={5}
                                            unit="%"
                                            onChange={(n) => setTk("scrim", n / 100)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Show>
                </div>
            </aside>

            {/* ── live preview ── */}
            <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex flex-none items-center justify-between border-b border-line bg-panel px-4 py-2">
                    <Eyebrow weight="normal">
                        {editing ? "Live preview · this artifact" : "Live preview · demo"}
                    </Eyebrow>
                    <Show
                        when={!editing}
                        fallback={
                            <span
                                class="rounded-md border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
                                title="Preview keeps this artifact's format"
                            >
                                {formatLabel()}
                            </span>
                        }
                    >
                        <Segmented
                            variant="accent"
                            value={format()}
                            options={FORMATS.map(([value, label]) => ({ value, label }))}
                            onChange={(v) => setFormat(v)}
                        />
                    </Show>
                </div>
                {/* full-bleed sites hug the header; decks/docs get a gap below it */}
                <div
                    ref={scroll}
                    class={`min-h-0 flex-1 overflow-auto${previewFormat() === "web" ? "" : " pt-4"}`}
                    style={{ background: tk.bg }}
                >
                    <div ref={host} />
                </div>
            </div>
        </Modal>
    );
};
