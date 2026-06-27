import type { Theme } from "@themes/theme";

// The 22-theme system from the design exploration (design/editor-explorer.html). Each theme is a
// coherent system: a font trio (display/body/mono), a heading weight, a corner radius, and a palette.
// `surface` = explorer `cv`, `soft` = `ik`, `muted` = `mu`, `line` = `bd`, `onAccent` = `ai` (or white).

interface Pal {
    bg: string;
    cv: string;
    ink: string;
    ik: string;
    mu: string;
    ac: string;
    ai?: string;
    bd: string;
}

function mk(
    id: string,
    name: string,
    tag: string,
    dark: boolean,
    d: string,
    u: string,
    m: string,
    hw: number,
    radius: number,
    p: Pal,
): Theme {
    return {
        id,
        name,
        tag,
        dark,
        tokens: {
            bg: p.bg,
            surface: p.cv,
            ink: p.ink,
            soft: p.ik,
            muted: p.mu,
            accent: p.ac,
            onAccent: p.ai ?? "#ffffff",
            line: p.bd,
            radius,
            fontDisplay: d,
            fontBody: u,
            fontMono: m,
            headingWeight: hw,
        },
    };
}

export const THEME_LIST: Theme[] = [
    mk("studio", "Studio", "editorial", false, "Fraunces", "Hanken Grotesk", "DM Mono", 560, 18, { bg: "#F4F0E8", cv: "#FFFDF8", ink: "#211C16", ik: "#4D453A", mu: "#8C8273", ac: "#A8572C", bd: "#E6DECF" }),
    mk("press", "Press", "newsprint", false, "Newsreader", "Archivo", "IBM Plex Mono", 600, 4, { bg: "#ECEAE1", cv: "#FBFAF4", ink: "#16140F", ik: "#3A372E", mu: "#7A746A", ac: "#C2301A", bd: "#D6D0C0" }),
    mk("noir", "Noir", "cinematic", true, "Sora", "Manrope", "Geist Mono", 700, 18, { bg: "#0C0E13", cv: "#15181F", ink: "#ECEEF2", ik: "#AEB5C0", mu: "#6F7783", ac: "#5B8CFF", ai: "#0B1020", bd: "#252A34" }),
    mk("signal", "Signal", "technical", false, "IBM Plex Sans", "IBM Plex Sans", "IBM Plex Mono", 600, 10, { bg: "#F3F4F6", cv: "#FFFFFF", ink: "#14171C", ik: "#3A404A", mu: "#6E747E", ac: "#2D5BFF", bd: "#E2E4E9" }),
    mk("aura", "Aura", "minimal", false, "Instrument Serif", "Albert Sans", "Geist Mono", 400, 20, { bg: "#F7F8FA", cv: "#FFFFFF", ink: "#1B1E24", ik: "#4A4F58", mu: "#8B9099", ac: "#5B7CB0", bd: "#ECEEF1" }),
    mk("canvas", "Canvas", "playful", false, "Bricolage Grotesque", "Plus Jakarta Sans", "DM Mono", 700, 24, { bg: "#F6F3FB", cv: "#FFFFFF", ink: "#1F1A2C", ik: "#473F58", mu: "#7E7791", ac: "#F4552E", bd: "#EBE5F4" }),
    mk("brut", "Concrete", "brutalist", false, "Archivo", "Space Mono", "Space Mono", 800, 0, { bg: "#E5E3DC", cv: "#F2F1EC", ink: "#101010", ik: "#33322E", mu: "#6E6C64", ac: "#111111", ai: "#F5E000", bd: "#111111" }),
    mk("neon", "Neon", "cyber", true, "Chakra Petch", "Rajdhani", "Geist Mono", 700, 10, { bg: "#08080F", cv: "#0F1018", ink: "#E8ECFF", ik: "#9AA3C4", mu: "#5C6488", ac: "#FF2D9B", ai: "#0A0010", bd: "#23263A" }),
    mk("retro", "Sunset", "retro 70s", false, "Fredoka", "Hanken Grotesk", "DM Mono", 600, 22, { bg: "#F3E7D2", cv: "#FBF3E4", ink: "#3A2A18", ik: "#5E4A30", mu: "#94815F", ac: "#C85A1B", bd: "#E0CBA6" }),
    mk("deco", "Deco Gold", "art deco", true, "Playfair Display", "Jost", "Geist Mono", 600, 8, { bg: "#12110C", cv: "#1A180F", ink: "#F2ECDD", ik: "#B9B199", mu: "#7E775F", ac: "#C9A227", ai: "#12110C", bd: "#332E20" }),
    mk("swiss", "Swiss", "international", false, "Archivo", "Archivo", "IBM Plex Mono", 700, 3, { bg: "#F4F4F2", cv: "#FFFFFF", ink: "#111111", ik: "#3A3A38", mu: "#6E6E6A", ac: "#E2231A", bd: "#E0E0DC" }),
    mk("botanic", "Botanical", "organic", false, "Fraunces", "Mulish", "DM Mono", 560, 18, { bg: "#EEF0E6", cv: "#FAFBF4", ink: "#26301F", ik: "#46503B", mu: "#7B856E", ac: "#5B7A4F", bd: "#D7DDC8" }),
    mk("candy", "Candy", "pastel", false, "Quicksand", "Nunito", "DM Mono", 700, 26, { bg: "#FFF4FA", cv: "#FFFFFF", ink: "#3A2536", ik: "#5E4358", mu: "#9B7E94", ac: "#FF6FB5", bd: "#F4DCEC" }),
    mk("term", "Terminal", "console", true, "Geist Mono", "Geist Mono", "Geist Mono", 500, 6, { bg: "#0A0D0A", cv: "#0F140F", ink: "#CDEBCB", ik: "#7FB07C", mu: "#4E6E4C", ac: "#3CE08D", ai: "#04130B", bd: "#1C2A1C" }),
    mk("vapor", "Vapor", "vaporwave", true, "Outfit", "Outfit", "Geist Mono", 600, 22, { bg: "#15102B", cv: "#1E1640", ink: "#F3E9FF", ik: "#B9A8D8", mu: "#7C6BA0", ac: "#E368E7", ai: "#160826", bd: "#33285C" }),
    mk("memphis", "Memphis", "pop 80s", false, "Bricolage Grotesque", "Plus Jakarta Sans", "Space Mono", 800, 14, { bg: "#FBF5E9", cv: "#FFFFFF", ink: "#161616", ik: "#3A3A3A", mu: "#6E6E6A", ac: "#FF4D4D", bd: "#1A1A1A" }),
    mk("blue", "Blueprint", "technical", true, "Archivo", "Archivo", "IBM Plex Mono", 600, 8, { bg: "#0C2742", cv: "#103254", ink: "#E2EEFB", ik: "#A7C2DD", mu: "#6E89A6", ac: "#7FC0FF", ai: "#06203B", bd: "#28496B" }),
    mk("riso", "Riso Zine", "risograph", false, "Space Mono", "Archivo", "Space Mono", 700, 5, { bg: "#F1EDE1", cv: "#F8F5EC", ink: "#171728", ik: "#3A3A52", mu: "#74748A", ac: "#FF3D7F", bd: "#D9D4C5" }),
    mk("couture", "Couture", "luxe", true, "Cormorant Garamond", "Jost", "Geist Mono", 600, 6, { bg: "#0C0C0C", cv: "#141414", ink: "#F2EFEA", ik: "#B5B0A6", mu: "#76726A", ac: "#C0A875", ai: "#0C0C0C", bd: "#262626" }),
    mk("sunrise", "Sunrise", "warm", false, "Fraunces", "Figtree", "Geist Mono", 560, 18, { bg: "#FFF5EC", cv: "#FFFFFF", ink: "#2B211B", ik: "#544439", mu: "#917C6C", ac: "#F0703A", bd: "#F2E1D0" }),
    mk("sumi", "Ink Wash", "sumi", false, "Newsreader", "Mulish", "Geist Mono", 500, 10, { bg: "#F1EEE6", cv: "#F8F6EF", ink: "#1A1A18", ik: "#3C3C38", mu: "#76746C", ac: "#B43A2E", bd: "#D7D2C3" }),
    mk("mineral", "Mineral", "stone", false, "Hanken Grotesk", "Hanken Grotesk", "Geist Mono", 600, 14, { bg: "#EEF0F1", cv: "#FBFBFC", ink: "#1E2428", ik: "#444C52", mu: "#7A828A", ac: "#4E7A86", bd: "#DCE0E3" }),
];

export const DEFAULT_THEME = THEME_LIST[0]!;
export const THEMES: Record<string, Theme> = Object.fromEntries(THEME_LIST.map((t) => [t.id, t]));

export function resolveTheme(id: string): Theme {
    return THEMES[id] ?? DEFAULT_THEME;
}
