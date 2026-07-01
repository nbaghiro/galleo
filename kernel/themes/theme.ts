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
