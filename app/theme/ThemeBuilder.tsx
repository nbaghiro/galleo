// The custom-theme token editor + its live preview (ThemePreview folds in here — its only consumer).

import type { Theme, Tokens } from "@themes/theme";
import type { Component, JSX } from "solid-js";
import { createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { ThemeDraft } from "../theme/custom-themes";
import { luminance } from "@themes/theme";
import { Dropdown } from "@studio/controls/Dropdown";
import { resolveProfile } from "@engine/profile";
import { paint } from "@render/backends";
import { measureText, layoutSlide } from "@render/commands";
import { THEME_SAMPLE } from "../theme/theme";

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

// The theme builder — edits the full token set with a live engine preview. New themes seed from the
// theme you currently see; editing seeds from the saved custom theme.
export const ThemeBuilder: Component<{
    base: Theme;
    edit?: Theme;
    busy?: boolean;
    onSave: (draft: ThemeDraft) => void;
    onCancel: () => void;
}> = (props) => {
    const seed = props.edit ?? props.base;
    const [tk, setTk] = createStore<Tokens>({
        ...seed.tokens,
        border: seed.tokens.border ?? 1,
        scrim: seed.tokens.scrim ?? 0.45,
    });
    const [name, setName] = createSignal(props.edit?.name ?? "Custom theme");
    const [shadowPreset, setShadowPreset] = createSignal(inferShadow(seed.tokens.shadow));

    // keep the shadow token in sync with the chosen preset + the current accent
    createEffect(() => setTk("shadow", shadowCss(shadowPreset(), tk.accent)));

    const save = (): void =>
        props.onSave({
            name: name().trim() || "Custom theme",
            tokens: { ...tk },
            tag: "custom",
            dark: luminance(tk.bg) < 0.5,
        });

    const colorField = (key: keyof Tokens, label: string): JSX.Element => (
        <label class="flex items-center gap-2.5 py-1">
            <input
                type="color"
                class="h-7 w-9 flex-none cursor-pointer rounded-md border border-line bg-transparent p-0"
                value={String(tk[key]).toLowerCase()}
                onInput={(e) => setTk(key, e.currentTarget.value)}
            />
            <span class="flex-1 text-[12.5px] text-soft">{label}</span>
            <span class="font-mono text-[10px] text-muted">{String(tk[key]).toUpperCase()}</span>
        </label>
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
            <span class="w-[88px] flex-none text-[12.5px] text-soft">{label}</span>
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
            <span class="w-[88px] flex-none text-[12.5px] text-soft">{label}</span>
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
        <div class="mb-1.5 mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            {label}
        </div>
    );

    return (
        <div class="flex h-full flex-col">
            <div class="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
                <input
                    class="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-accent"
                    value={name()}
                    placeholder="Theme name"
                    onInput={(e) => setName(e.currentTarget.value)}
                />
                <button
                    class="flex-none rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-soft hover:text-ink"
                    onClick={() => props.onCancel()}
                >
                    Cancel
                </button>
                <button
                    class="flex-none rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-onaccent disabled:opacity-50"
                    disabled={props.busy}
                    onClick={save}
                >
                    {props.edit ? "Update" : "Save"}
                </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div class="mb-3 flex justify-center">
                    <ThemePreview tokens={tk} width={300} />
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

                {heading("Shape")}
                {rangeField("radius", "Radius", 0, 28, 1, "px")}
                {rangeField("border", "Border", 0, 4, 1, "px")}
                <div class="flex items-center gap-2.5 py-1">
                    <span class="w-[88px] flex-none text-[12.5px] text-soft">Shadow</span>
                    <div class="min-w-0 flex-1">
                        <Dropdown
                            value={shadowPreset()}
                            options={SHADOW_PRESETS.map((o) => ({ value: o[0], label: o[1] }))}
                            onChange={setShadowPreset}
                        />
                    </div>
                </div>
                <label class="flex items-center gap-2.5 py-1">
                    <span class="w-[88px] flex-none text-[12.5px] text-soft">Image scrim</span>
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

                {heading("Type")}
                {fontField("fontDisplay", "Display", DISPLAY_FONTS)}
                {fontField("fontBody", "Body", BODY_FONTS)}
                {fontField("fontMono", "Mono", MONO_FONTS)}
                {rangeField("headingWeight", "Weight", 300, 900, 100, "")}
            </div>
        </div>
    );
};

// Live, engine-rendered theme preview — the real layout/paint pipeline (same as SectionThumb), but
// reactive: it re-lays-out whenever the passed token set changes, so the builder reflects edits as
// they happen. Renders the shared sample section into a scaled 16:9 frame.
const LW = 1280; // layout width, scaled down to the card
const SH = 720; // 16:9 slide frame

export const ThemePreview: Component<{ tokens: Tokens; width?: number }> = (props) => {
    let inner!: HTMLDivElement;
    const w = (): number => props.width ?? 320;
    const h = (): number => Math.round((w() * 9) / 16);

    createEffect(() => {
        // read props.tokens fields (via layoutSlide) + width so the effect re-runs on any change
        const tokens = props.tokens;
        const width = w();
        if (!inner) return;
        const format = resolveProfile("deck");
        const { commands, height } = layoutSlide(THEME_SAMPLE, LW, SH, measureText, tokens, format);
        inner.style.cssText = `width:${LW}px;height:${height}px;transform:scale(${width / LW});transform-origin:top left`;
        paint(commands, inner);
    });

    return (
        <div
            class="overflow-hidden rounded-xl border border-line"
            style={{ width: `${w()}px`, height: `${h()}px` }}
        >
            <div ref={inner} />
        </div>
    );
};
