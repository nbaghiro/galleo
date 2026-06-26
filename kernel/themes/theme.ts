// Themes are data: a semantic token set applied across every block of an artifact. Elements read
// colors by role (ink/muted/accent/...) from the active theme, so swapping a theme recolors all of
// them. (Font + spacing theming is a later hardening; v1 themes colors + corner radius.)

export type ColorToken = "bg" | "surface" | "ink" | "soft" | "muted" | "accent" | "onAccent" | "line";

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
}

export interface Theme {
    id: string;
    name: string;
    tokens: Tokens;
}
