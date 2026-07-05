// Themes are data: a semantic token set applied across every block of an artifact. Elements read
// colors by role (ink/muted/accent/...) and fonts by role (display/ui/mono) from the active theme,
// so swapping a theme recolors AND re-typesets all of them.

export type ColorToken =
    | "bg"
    | "surface"
    | "ink"
    | "soft"
    | "muted"
    | "accent"
    | "onAccent"
    | "line";

export type FontRole = "display" | "ui" | "mono";

export interface Tokens {
    bg: string; // page / canvas behind sections
    surface: string; // section + card background
    ink: string; // primary text
    soft: string; // secondary text / leads
    muted: string; // captions, labels
    accent: string; // brand accent (eyebrows, buttons, markers)
    onAccent: string; // text/icons on the accent
    line: string; // borders / dividers
    radius: number; // section corner radius
    fontDisplay: string; // family name for headings (e.g. "Fraunces")
    fontBody: string; // family name for body / UI
    fontMono: string; // family name for labels / mono
    headingWeight: number; // weight applied to display-role text
    border?: number; // border width for cards/sections (heavier = blockier theme)
    shadow?: string; // box-shadow for cards (hard-offset brutalist · soft lift · subtle)
    scrim?: number; // 0..1 default darkening over section background images (higher = safer text); default 0.45
}

export interface Theme {
    id: string;
    name: string;
    tag: string; // short descriptor (e.g. "editorial", "cyber")
    dark: boolean;
    tokens: Tokens;
}

// Resolve a font role to a CSS family stack (the role's generic fallback, matching the explorer).
export function fontStack(role: FontRole, t: Tokens): string {
    if (role === "display") return `'${t.fontDisplay}', serif`;
    if (role === "mono") return `'${t.fontMono}', monospace`;
    return `'${t.fontBody}', sans-serif`;
}

// The Tailwind color variables for a theme — any module sets these on a root element to recolor its
// chrome (the shared theme.css declares the matching `@theme` tokens). Pure: just a string record.
export function themeCssVars(t: Tokens): Record<string, string> {
    return {
        "--color-canvas": t.bg,
        "--color-panel": t.surface,
        "--color-line": t.line,
        "--color-ink": t.ink,
        "--color-soft": t.soft,
        "--color-muted": t.muted,
        "--color-accent": t.accent,
        "--color-onaccent": t.onAccent,
        "--border-width": `${t.border ?? 1}px`,
        "--shadow": t.shadow ?? "0 1px 2px rgba(0,0,0,0.05)",
        "--radius": `${t.radius}px`,
        "--font-display": `'${t.fontDisplay}', serif`,
        "--font-body": `'${t.fontBody}', system-ui, sans-serif`,
        "--font-mono": `'${t.fontMono}', monospace`,
        "--hw": String(t.headingWeight),
    };
}

// --- wire DTOs (theme's HTTP shapes, shared backend ↔ frontend) ---
// `ThemeSummary` is the lightweight theme record sent over the wire (distinct from the full `Theme`
// above, which carries the library metadata); `ThemeInput` is the create/update body for custom themes.

export interface ThemeSummary {
    id: string;
    name: string;
    tokens: Tokens;
    mood: string | null;
    isDark: boolean;
}

export interface ThemeInput {
    name: string;
    tokens: Tokens;
    mood: string | null;
    isDark: boolean;
}

// --- color math ---
// Small color utilities shared by the element library and the canvas render layer. All operate
// on `#rrggbb` (or `#rgb` shorthand) hex strings.

export function hexToRgb(hex: string): [number, number, number] {
    const s = hex.replace("#", "");
    const n = s.length === 3 ? s.replace(/./g, "$&$&") : s;
    return [
        parseInt(n.slice(0, 2), 16) || 0,
        parseInt(n.slice(2, 4), 16) || 0,
        parseInt(n.slice(4, 6), 16) || 0,
    ];
}

// Perceived luminance, 0 (black) → 1 (white). Non-6-digit input → 1 (treated as light).
export function luminance(hex: string): number {
    const h = hex.replace("#", "");
    if (h.length < 6) return 1;
    return (
        (0.299 * parseInt(h.slice(0, 2), 16) +
            0.587 * parseInt(h.slice(2, 4), 16) +
            0.114 * parseInt(h.slice(4, 6), 16)) /
        255
    );
}

// Mix a hex toward white by fraction f (0 = unchanged, 1 = white), preserving hue.
export function mixWhite(hex: string, f: number): string {
    const h = hex.replace("#", "");
    const ch = (i: number): string => {
        const c = parseInt(h.slice(i, i + 2), 16);
        return Math.round(c + (255 - c) * f)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${ch(0)}${ch(2)}${ch(4)}`;
}

// Blend two hex colors (t = 0 → a, 1 → b). Non-hex input → a unchanged.
export function mix(a: string, b: string, t: number): string {
    if (!a.startsWith("#") || !b.startsWith("#")) return a;
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    const c = (x: number, y: number): string =>
        Math.round(x + (y - x) * t)
            .toString(16)
            .padStart(2, "0");
    return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

// A hex as an `rgba()` string with alpha a. Non-6-digit input → returned unchanged.
export function hexA(hex: string, a: number): string {
    const h = hex.replace("#", "");
    if (h.length < 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
