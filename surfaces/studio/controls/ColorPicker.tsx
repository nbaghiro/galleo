import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import type { Tokens } from "@themes/theme";
import { luminance, mix, mixWhite } from "@themes/color";

// The one color-selection UI, shared by the inline text-format popovers (mark color + highlight) and the
// inspector's `color` fields. It renders a row of caller-supplied swatches, a native color well + hex
// readout for anything custom, and an optional remove/reset affordance. Callers pass the palette (so text
// color and highlight can each supply a different on-theme set) and receive `onChange(hex | undefined)`
// — `undefined` meaning "cleared". `keepFocus` guards mid-edit use inside a contenteditable toolbar:
// swatch/remove mousedown is prevented so the selection stays put, while the native well is left
// focusable so its OS picker can open (the popover lives inside `data-galleo-toolbar`, so editing
// survives that focus move; the caller reapplies against a range captured before it).

export interface ColorSwatch {
    label?: string;
    color: string;
}

const isHex = (v?: string): boolean => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

export const ColorPicker: Component<{
    value?: string;
    swatches: ColorSwatch[];
    onChange: (value: string | undefined) => void;
    // Discrete pick (a swatch or the remove affordance) — lets a transient popover dismiss itself. The
    // continuous native well fires only `onChange`, so it can keep the popover open for live picking.
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

// ── on-theme palettes ────────────────────────────────────────────────────────

// Text-color swatches: the theme's own readable ink/accent/soft/muted/surface tokens plus a deepened and
// a lightened accent, so overrides stay on-palette.
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

// A small set of on-brand highlight hues — the theme accent plus amber/green/blue/pink/violet.
const HL_HUES = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6"];

// Highlight swatches: each hue tinted toward the theme's surface so it harmonizes and stays legible
// under the ink text. On light themes this yields soft pastels; on dark themes, muted low-key tints
// (light ink still reads on top) — replacing the old fixed pastel set that only worked on light themes.
export function highlightSwatches(t: Tokens): ColorSwatch[] {
    const toward = luminance(t.surface) < 0.5 ? 0.52 : 0.66;
    return [t.accent, ...HL_HUES].map((hue) => ({ color: mix(hue, t.surface, toward) }));
}
