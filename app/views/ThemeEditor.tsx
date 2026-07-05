import type { Tokens } from "@themes/theme";
import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { useNavigate, useParams } from "@solidjs/router";
import { luminance } from "@themes/theme";
import { resolveTheme } from "@themes/library";
import { resolveProfile } from "@engine/profile";
import { paintSectionStack } from "@canvas/render/backends";
import { ColorPopover, Dropdown, type ColorSwatch } from "@editor/inspect/widgets";
import { ChevronLeftIcon } from "../components/icons";
import {
    appTheme,
    setAppTheme,
    saveCustomTheme,
    updateCustomTheme,
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

// The full-screen theme editor — the whole customizable token set on the left, a real multi-section
// demo artifact on the right that re-lays-out on every change (via the same engine the editor paints
// with). `/theme/new` seeds from the active theme; `/theme/:id` edits a saved custom theme.
export const ThemeEditor: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const id = (): string => params.id ?? "new";
    const isNew = (): boolean => id() === "new";
    const seed = resolveTheme(isNew() ? appTheme() : id());

    const [tk, setTk] = createStore<Tokens>({
        ...seed.tokens,
        border: seed.tokens.border ?? 1,
        scrim: seed.tokens.scrim ?? 0.45,
    });
    const [name, setName] = createSignal(isNew() ? "Custom theme" : seed.name);
    const [format, setFormat] = createSignal("web");
    const [shadowPreset, setShadowPreset] = createSignal(inferShadow(seed.tokens.shadow));
    const [tag, setTag] = createSignal(isNew() ? "custom" : seed.tag);
    const [busy, setBusy] = createSignal(false);
    const [width, setWidth] = createSignal(900);

    // keep the shadow token in sync with the chosen preset + the current accent
    createEffect(() => setTk("shadow", shadowCss(shadowPreset(), tk.accent)));

    let scroll!: HTMLDivElement;
    let host!: HTMLDivElement;

    // Re-lay-out + repaint the demo artifact on any token / format / width change. Spreading the store
    // reads every field, so the effect tracks all of them; the demo is a function of the tokens, so the
    // scrim + accent recolor their sections live.
    const draw = (): void => {
        if (!host) return;
        const snap = { ...tk };
        const profile = resolveProfile(format());
        const fullW = Math.max(360, width());
        host.replaceChildren();
        const { height } = paintSectionStack(host, themeDemo(snap), profile, snap, { fullW });
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
        onCleanup(() => {
            ro.disconnect();
            document.fonts.removeEventListener("loadingdone", onFonts);
        });
    });

    const save = async (): Promise<void> => {
        setBusy(true);
        const draft: ThemeDraft = {
            name: name().trim() || "Custom theme",
            tokens: { ...tk },
            tag: tag().trim() || "custom",
            dark: luminance(tk.bg) < 0.5,
        };
        const saved = isNew() ? await saveCustomTheme(draft) : await updateCustomTheme(id(), draft);
        setBusy(false);
        if (saved) {
            setAppTheme(saved.id);
            navigate("/");
        }
    };

    // ── control fields ──
    // The other seven tokens as quick swatches, so a color can reuse another role on-palette.
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
        <label class="flex items-center gap-2.5 py-1">
            <span class="w-[84px] flex-none text-[12.5px] text-soft">{label}</span>
            <input
                type="range"
                class="min-w-0 flex-1"
                style={{ "accent-color": "var(--color-accent)" }}
                min={min}
                max={max}
                step={step}
                value={(tk[key] as number) ?? min}
                onInput={(e) => setTk(key, Number(e.currentTarget.value))}
            />
            <span class="w-10 flex-none text-right font-mono text-[10px] text-muted">
                {(tk[key] as number) ?? min}
                {unit}
            </span>
        </label>
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
        <div class="mb-1 mt-4 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            {label}
        </div>
    );

    return (
        <div class="fixed inset-0 z-30 flex bg-canvas text-ink">
            {/* ── controls ── */}
            <aside class="flex w-[360px] flex-none flex-col border-r border-line bg-panel">
                <header class="flex flex-none items-center gap-2 border-b border-line px-3 py-3">
                    <button
                        class="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                        title="Back"
                        onClick={() => navigate("/")}
                    >
                        <ChevronLeftIcon size={17} />
                    </button>
                    <input
                        class="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-accent"
                        value={name()}
                        placeholder="Theme name"
                        onInput={(e) => setName(e.currentTarget.value)}
                    />
                    <button
                        class="flex-none rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-onaccent disabled:opacity-50"
                        disabled={busy()}
                        onClick={save}
                    >
                        {isNew() ? "Save" : "Update"}
                    </button>
                </header>

                <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                    <div class="mx-auto w-full max-w-[300px]">
                        {heading("Details")}
                        <div class="flex items-center justify-between gap-2.5 py-1">
                            <span class="text-[12.5px] text-soft">Style tag</span>
                            <input
                                class="w-[150px] rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                                value={tag()}
                                placeholder="editorial, cyber…"
                                onInput={(e) => setTag(e.currentTarget.value)}
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
                            <span class="w-[84px] flex-none text-[12.5px] text-soft">Shadow</span>
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
                        <label class="flex items-center gap-2.5 py-1">
                            <span class="w-[84px] flex-none text-[12.5px] text-soft">
                                Image scrim
                            </span>
                            <input
                                type="range"
                                class="min-w-0 flex-1"
                                style={{ "accent-color": "var(--color-accent)" }}
                                min={0}
                                max={90}
                                step={5}
                                value={Math.round((tk.scrim ?? 0.45) * 100)}
                                onInput={(e) => setTk("scrim", Number(e.currentTarget.value) / 100)}
                            />
                            <span class="w-10 flex-none text-right font-mono text-[10px] text-muted">
                                {Math.round((tk.scrim ?? 0.45) * 100)}%
                            </span>
                        </label>
                    </div>
                </div>
            </aside>

            {/* ── live demo artifact ── */}
            <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex flex-none items-center justify-between border-b border-line bg-panel px-4 py-2">
                    <span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                        Live preview · this theme
                    </span>
                    <div class="flex items-center gap-1 rounded-lg border border-line p-0.5">
                        {FORMATS.map(([id, label]) => (
                            <button
                                class={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                                    format() === id
                                        ? "bg-accent text-onaccent"
                                        : "text-soft hover:text-ink"
                                }`}
                                onClick={() => setFormat(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div
                    ref={scroll}
                    class="min-h-0 flex-1 overflow-auto"
                    style={{ background: tk.bg }}
                >
                    <div ref={host} />
                </div>
            </div>
        </div>
    );
};
