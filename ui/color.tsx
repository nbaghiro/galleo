import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { Tokens } from "@themes";
import { luminance, mix, mixWhite, resolveTheme } from "@themes";
import { Popover } from "./overlay";

// A theme's accent swatch — a small filled chip that resolves + previews a theme by id (used beside theme
// names in the library / theme picker). Recolors to the theme's accent, not the active app theme.
export const ThemeSwatch: Component<{
    themeId: string;
    size?: number; // px (default 12 = h-3 w-3)
    rounded?: string; // tailwind rounding class (default rounded-[3px])
    class?: string;
}> = (props) => (
    <span
        class={`flex-none ${props.rounded ?? "rounded-[3px]"} ${props.class ?? ""}`}
        style={{
            width: `${props.size ?? 12}px`,
            height: `${props.size ?? 12}px`,
            background: resolveTheme(props.themeId).tokens.accent,
        }}
    />
);

// The one color-selection UI: an inline `ColorPicker` (swatch row + native well + hex + optional clear),
// shared by inline mark pickers, and `ColorPopover` (a compact trigger opening the picker in a Popover).
// Both style through theme utilities; the popover panel is theme-snapshotted by Popover.

export interface ColorSwatch {
    label?: string;
    color: string;
}

export const isHex = (v?: string): boolean => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

export const ColorPicker: Component<{
    value?: string;
    swatches: ColorSwatch[];
    onChange: (value: string | undefined) => void;
    // Discrete pick (a swatch or the remove affordance) — lets a transient popover dismiss itself.
    onPick?: () => void;
    // Label for the remove/reset affordance; omit to hide it.
    clearLabel?: string;
    // Keep the remove/reset affordance visible with no value set (popover "Remove" vs inspector "Reset").
    clearWhenEmpty?: boolean;
    // Prevent mousedown-blur on swatches/remove so an external contenteditable keeps focus + selection.
    keepFocus?: boolean;
}> = (props) => {
    const noBlur = (e: MouseEvent): void => {
        if (props.keepFocus) e.preventDefault();
    };
    const showClear = (): boolean =>
        !!props.clearLabel && (props.clearWhenEmpty === true || !!props.value);
    const pick = (value: string | undefined): void => {
        props.onChange(value);
        props.onPick?.();
    };
    return (
        <div class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-1.5">
                <For each={props.swatches}>
                    {(s) => (
                        <button
                            type="button"
                            title={s.label ?? s.color}
                            onMouseDown={noBlur}
                            onClick={() => pick(s.color)}
                            class={`h-6 w-6 rounded-full border transition ${
                                props.value === s.color
                                    ? "border-accent ring-2 ring-accent/40"
                                    : "border-line hover:scale-110"
                            }`}
                            style={{ background: s.color }}
                        />
                    )}
                </For>
            </div>
            <div class="flex items-center gap-2">
                <label class="relative h-7 w-9 flex-none cursor-pointer overflow-hidden rounded border border-line">
                    <span
                        class="block h-full w-full"
                        style={{ background: props.value ?? "#000" }}
                    />
                    <input
                        type="color"
                        class="absolute inset-0 cursor-pointer opacity-0"
                        value={isHex(props.value) ? props.value : "#000000"}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                </label>
                <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">
                    {props.value ?? "—"}
                </span>
                <Show when={showClear()}>
                    <button
                        type="button"
                        title={props.clearLabel}
                        onMouseDown={noBlur}
                        onClick={() => pick(undefined)}
                        class="flex-none text-[11px] font-semibold text-muted hover:text-ink"
                    >
                        {props.clearLabel}
                    </button>
                </Show>
            </div>
        </div>
    );
};

// ── on-theme palettes ──
export function textColorSwatches(t: Tokens): ColorSwatch[] {
    return [
        { label: "Ink", color: t.ink },
        { label: "Accent", color: t.accent },
        { label: "Deep accent", color: mix(t.accent, t.ink, 0.45) },
        { label: "Light accent", color: mixWhite(t.accent, 0.35) },
        { label: "Soft", color: t.soft },
        { label: "Muted", color: t.muted },
        { label: "Surface", color: t.surface },
    ];
}

const HL_HUES = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6"];

export function highlightSwatches(t: Tokens): ColorSwatch[] {
    const toward = luminance(t.surface) < 0.5 ? 0.52 : 0.66;
    return [t.accent, ...HL_HUES].map((hue) => ({ color: mix(hue, t.surface, toward) }));
}

// ── ColorPopover (compact swatch trigger → Popover with swatches + well + editable hex) ──
export const ColorPopover: Component<{
    value?: string;
    swatches?: ColorSwatch[];
    onChange: (value: string | undefined) => void;
    clearLabel?: string;
    toolbar?: boolean;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    let trigger!: HTMLButtonElement;
    const pick = (v: string | undefined): void => {
        props.onChange(v);
        setOpen(false);
    };
    return (
        <>
            <button
                ref={trigger}
                type="button"
                class="flex items-center gap-2 rounded-md border border-line bg-canvas px-1.5 py-1 transition-colors hover:border-accent"
                onClick={() => setOpen((o) => !o)}
            >
                <span
                    class="h-4 w-4 flex-none rounded"
                    style={{
                        background: props.value ?? "transparent",
                        "box-shadow": "inset 0 0 0 1px rgba(0,0,0,.15)",
                    }}
                />
                <span class="font-mono text-[10px] text-muted">
                    {props.value?.toUpperCase() ?? "—"}
                </span>
            </button>
            <Popover
                anchor={() => trigger}
                open={open()}
                onClose={() => setOpen(false)}
                estHeight={190}
                fixedWidth={228}
                toolbar={props.toolbar}
                panelClass="p-2.5"
            >
                <Show when={props.swatches?.length}>
                    <div class="mb-2.5 flex flex-wrap gap-1.5">
                        <For each={props.swatches}>
                            {(s) => (
                                <button
                                    type="button"
                                    title={s.label ?? s.color}
                                    onClick={() => pick(s.color)}
                                    class={`h-6 w-6 rounded-full border transition ${
                                        props.value === s.color
                                            ? "border-accent ring-2 ring-accent/40"
                                            : "border-line hover:scale-110"
                                    }`}
                                    style={{ background: s.color }}
                                />
                            )}
                        </For>
                    </div>
                </Show>
                <div class="flex items-center gap-2">
                    <label class="relative h-8 w-10 flex-none cursor-pointer overflow-hidden rounded border border-line">
                        <span
                            class="block h-full w-full"
                            style={{ background: props.value ?? "#000" }}
                        />
                        <input
                            type="color"
                            class="absolute inset-0 cursor-pointer opacity-0"
                            value={isHex(props.value) ? props.value : "#000000"}
                            onInput={(e) => props.onChange(e.currentTarget.value)}
                        />
                    </label>
                    <input
                        type="text"
                        class="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
                        value={props.value ?? ""}
                        placeholder="#rrggbb"
                        spellcheck={false}
                        onInput={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (isHex(v)) props.onChange(v);
                        }}
                    />
                </div>
                <Show when={props.clearLabel}>
                    <button
                        type="button"
                        class="mt-2 w-full rounded-md py-1 text-[11px] font-semibold text-muted hover:text-ink"
                        onClick={() => pick(undefined)}
                    >
                        {props.clearLabel}
                    </button>
                </Show>
            </Popover>
        </>
    );
};
