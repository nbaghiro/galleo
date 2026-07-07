import type { Tokens } from "@themes/theme";
import { hexToRgb, hexA, luminance } from "@themes/theme";
import type { PaletteMode } from "./types";

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h =
        mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h / 6) * 360, s, l];
}

function hsl2hex(h: number, s: number, l: number): string {
    const hh = ((((h % 360) + 360) % 360) / 360) * 12;
    const chan = (n: number): string => {
        const k = (n + hh) % 12;
        const a = s * Math.min(l, 1 - l);
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${chan(0)}${chan(8)}${chan(4)}`;
}

// N series colors from the single theme accent. "ramp" steps the accent's opacity — monochrome and
// always on-brand (the same trick the old pie chart used per slice). "categorical" rotates the accent's
// hue for distinct-but-related colors, falling back to a lightness ramp when the accent is near-neutral
// (a mono theme should yield a mono chart, faithfully).
export function seriesColors(theme: Tokens, n: number, mode: PaletteMode): string[] {
    const count = Math.max(1, n);
    if (mode === "ramp") {
        const steps = [1, 0.7, 0.48, 0.32, 0.22];
        return Array.from({ length: count }, (_, i) =>
            hexA(theme.accent, steps[i] ?? Math.max(0.16, 1 - i * 0.15)),
        );
    }
    const [h, s, l] = rgb2hsl(...hexToRgb(theme.accent));
    const dark = luminance(theme.bg) < 0.5;
    if (s < 0.14) {
        const base = dark ? 0.62 : 0.42;
        return Array.from({ length: count }, (_, i) =>
            hsl2hex(h, s, Math.max(0.2, Math.min(0.82, base + (i - 1) * 0.13))),
        );
    }
    const offsets = [0, -46, 40, -92, 84];
    const S = Math.max(0.4, Math.min(0.86, s));
    const L = Math.max(0.34, Math.min(dark ? 0.64 : 0.52, l));
    return Array.from({ length: count }, (_, i) => hsl2hex(h + (offsets[i] ?? i * 54), S, L));
}
