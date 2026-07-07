// Themes are data: a semantic token set applied across every block of an artifact. Elements read
// colors by role (ink/muted/accent/...) and fonts by role (display/ui/mono) from the active theme,
// so swapping a theme recolors AND re-typesets all of them. This file is the whole theme contract —
// the token/Theme types + resolvers + color math, then the curated library of built-in themes.

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

// --- the curated theme library ---
// Each theme is a coherent system: a font trio (display/body/mono), a heading weight, a corner radius,
// an optional border width + shadow, and a palette. `surface` = `cv`, `soft` = `ik`, `muted` = `mu`,
// `line` = `bd`, `onAccent` = `ai` (or white). `bw`/`sh` override the default 1px border / soft shadow.

interface Pal {
    bg: string;
    cv: string;
    ink: string;
    ik: string;
    mu: string;
    ac: string;
    ai?: string;
    bd: string;
    bw?: number; // border width (default 1)
    sh?: string; // box-shadow (default soft lift)
    sc?: number; // scrim 0..1 over background images (default 0.45)
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
            border: p.bw,
            shadow: p.sh,
            scrim: p.sc,
            fontDisplay: d,
            fontBody: u,
            fontMono: m,
            headingWeight: hw,
        },
    };
}

// The pickable set (52 — incl. 4 OKLCH-derived + an upgraded graphite). Defaults (studio, brut) kept.
export const THEME_LIST: Theme[] = [
    mk("studio", "Studio", "editorial", false, "Fraunces", "Hanken Grotesk", "DM Mono", 560, 18, {
        bg: "#F4F0E8",
        cv: "#FFFDF8",
        ink: "#211C16",
        ik: "#4D453A",
        mu: "#8C8273",
        ac: "#A8572C",
        bd: "#E6DECF",
    }),
    mk("press", "Press", "newsprint", false, "Newsreader", "Archivo", "IBM Plex Mono", 600, 4, {
        bg: "#ECEAE1",
        cv: "#FBFAF4",
        ink: "#16140F",
        ik: "#3A372E",
        mu: "#7A746A",
        ac: "#C2301A",
        bd: "#D6D0C0",
    }),
    mk("brut", "Concrete", "brutalist", false, "Archivo", "Space Mono", "Space Mono", 800, 0, {
        bg: "#E5E3DC",
        cv: "#F2F1EC",
        ink: "#101010",
        ik: "#33322E",
        mu: "#6E6C64",
        ac: "#111111",
        ai: "#F5E000",
        bd: "#111111",
    }),
    mk("candy", "Candy", "pastel", false, "Quicksand", "Nunito", "DM Mono", 700, 26, {
        bg: "#FFF4FA",
        cv: "#FFFFFF",
        ink: "#3A2536",
        ik: "#5E4358",
        mu: "#9B7E94",
        ac: "#FF6FB5",
        bd: "#F4DCEC",
    }),
    mk("couture", "Couture", "luxe", true, "Cormorant Garamond", "Jost", "Geist Mono", 600, 6, {
        bg: "#0C0C0C",
        cv: "#141414",
        ink: "#F2EFEA",
        ik: "#B5B0A6",
        mu: "#76726A",
        ac: "#C0A875",
        ai: "#0C0C0C",
        bd: "#262626",
    }),
    mk(
        "manuscript",
        "Manuscript",
        "classic",
        false,
        "Newsreader",
        "Mulish",
        "IBM Plex Mono",
        500,
        6,
        {
            bg: "#F4EFE3",
            cv: "#FBF8F0",
            ink: "#211C12",
            ik: "#463F30",
            mu: "#7C7460",
            ac: "#7A5A2E",
            bd: "#E0D8C4",
        },
    ),
    mk("carbon", "Carbon", "monochrome", true, "Geist Mono", "Geist Mono", "Geist Mono", 500, 4, {
        bg: "#0A0A0A",
        cv: "#121212",
        ink: "#EDEDED",
        ik: "#ABABAB",
        mu: "#6E6E6E",
        ac: "#FAFAFA",
        ai: "#0A0A0A",
        bd: "#232323",
    }),
    mk("clay", "Clay", "organic", false, "Lora", "Mulish", "DM Mono", 600, 16, {
        bg: "#EFE6D9",
        cv: "#F8F1E6",
        ink: "#2C241B",
        ik: "#564A3B",
        mu: "#94866F",
        ac: "#BC6A47",
        bd: "#E3D7C5",
        bw: 0,
        sh: "0 6px 20px rgba(60,40,20,0.10)",
    }),
    mk("emerald", "Emerald", "jewel", true, "Marcellus", "Jost", "Geist Mono", 400, 8, {
        bg: "#0C1F18",
        cv: "#112720",
        ink: "#ECE6D6",
        ik: "#B7B198",
        mu: "#7C8273",
        ac: "#C9A24B",
        ai: "#0C1F18",
        bd: "#23463A",
        sh: "0 2px 14px rgba(0,0,0,0.45)",
    }),
    mk("xerox", "Xerox", "zine", false, "Anton", "Space Mono", "Space Mono", 400, 0, {
        bg: "#F4F1EA",
        cv: "#FFFFFF",
        ink: "#15151A",
        ik: "#37373F",
        mu: "#74747E",
        ac: "#FF2E7E",
        bd: "#15151A",
        bw: 2,
        sh: "none",
    }),
    mk(
        "bunker",
        "Bunker",
        "brutalist",
        false,
        "Space Grotesk",
        "Space Grotesk",
        "Space Mono",
        600,
        0,
        {
            bg: "#DEDCD2",
            cv: "#E9E7DD",
            ink: "#23241F",
            ik: "#44463D",
            mu: "#73746A",
            ac: "#6E7A5C",
            bd: "#23241F",
            bw: 3,
            sh: "4px 4px 0 rgba(35,36,31,1)",
        },
    ),
    mk(
        "gazette",
        "Gazette",
        "newsprint",
        false,
        "Frank Ruhl Libre",
        "Newsreader",
        "IBM Plex Mono",
        700,
        2,
        {
            bg: "#ECEAE3",
            cv: "#F6F4ED",
            ink: "#16140F",
            ik: "#3C382E",
            mu: "#7A7568",
            ac: "#BF2026",
            bd: "#D7D3C7",
            sh: "none",
        },
    ),
    mk("atomic", "Atomic", "mid-century", false, "Fraunces", "Mulish", "DM Mono", 600, 14, {
        bg: "#EFE7D6",
        cv: "#FBF6EA",
        ink: "#2E2A22",
        ik: "#5C5446",
        mu: "#8A8068",
        ac: "#1E7A6F",
        bd: "#D8CDB4",
        sh: "0 6px 20px rgba(46,42,34,0.10)",
    }),
    mk("orchard", "Orchard", "cottagecore", false, "Lora", "Nunito", "DM Mono", 600, 12, {
        bg: "#F3EEDF",
        cv: "#FBF8EF",
        ink: "#3A352A",
        ik: "#6B6253",
        mu: "#94896F",
        ac: "#9C3D54",
        ai: "#FBF8EF",
        bd: "#DED3B8",
        sh: "0 4px 14px rgba(58,53,42,0.08)",
    }),
    mk("crypt", "Crypt", "gothic", true, "Pirata One", "Spectral", "Space Mono", 400, 2, {
        bg: "#14110F",
        cv: "#1E1916",
        ink: "#E8E0D6",
        ik: "#B0A498",
        mu: "#7E7064",
        ac: "#8A2B36",
        ai: "#F0E6D6",
        bd: "#332B26",
        sh: "0 10px 30px rgba(0,0,0,0.5)",
    }),
    mk("arcade", "Arcade", "8-bit", true, "Press Start 2P", "Chakra Petch", "VT323", 400, 0, {
        bg: "#0B0F14",
        cv: "#121821",
        ink: "#E6F0E6",
        ik: "#9FB4A8",
        mu: "#5F7468",
        ac: "#39FF6A",
        ai: "#07120A",
        bd: "#243240",
        bw: 2,
        sh: "0 0 18px rgba(57,255,106,0.25)",
    }),
    mk("vogue", "Vogue", "fashion", false, "Bodoni Moda", "Jost", "DM Mono", 500, 0, {
        bg: "#FFFFFF",
        cv: "#FFFFFF",
        ink: "#0A0A0A",
        ik: "#444444",
        mu: "#8A8A8A",
        ac: "#0A0A0A",
        bd: "#111111",
        bw: 0,
        sh: "none",
    }),
    mk("cement", "Cement", "industrial", false, "Anton", "Space Grotesk", "Space Mono", 400, 0, {
        bg: "#D8D6D1",
        cv: "#E6E4DF",
        ink: "#1C1C1A",
        ik: "#4A4A46",
        mu: "#76746E",
        ac: "#3A3A37",
        ai: "#E6E4DF",
        bd: "#1C1C1A",
        bw: 3,
        sh: "6px 6px 0 rgba(28,28,26,1)",
    }),
    mk(
        "atlas",
        "Atlas",
        "cartographic",
        false,
        "Marcellus",
        "Hanken Grotesk",
        "IBM Plex Mono",
        500,
        6,
        {
            bg: "#EDE6D6",
            cv: "#F5EFE1",
            ink: "#2A2A24",
            ik: "#5A584A",
            mu: "#8B8770",
            ac: "#2B5C7A",
            ai: "#F5EFE1",
            bd: "#D2C9AE",
            sh: "0 4px 16px rgba(42,42,36,0.08)",
        },
    ),
    mk("obsidian", "Obsidian", "brutalist", true, "Archivo", "Inter Tight", "Geist Mono", 800, 0, {
        bg: "#0A0A0C",
        cv: "#141417",
        ink: "#F2F4F8",
        ik: "#A6AAB2",
        mu: "#5E626A",
        ac: "#E6ECF3",
        ai: "#0A0A0C",
        bd: "#3A3D44",
        bw: 3,
        sh: "3px 3px 0 rgba(242,244,248,0.15)",
    }),
    mk("marigold", "Marigold", "brutalist", false, "Yeseva One", "Mulish", "Space Mono", 400, 0, {
        bg: "#fdf6e3",
        cv: "#fffdf6",
        ink: "#2a2310",
        ik: "#6b5d36",
        mu: "#9a8a5a",
        ac: "#e8a200",
        ai: "#2a1c00",
        bd: "#2a2310",
        bw: 2,
        sh: "6px 6px 0 #2a2310",
    }),
    mk("linen", "Linen", "natural", false, "EB Garamond", "Albert Sans", "IBM Plex Mono", 600, 4, {
        bg: "#f3ede2",
        cv: "#faf6ee",
        ink: "#2b2418",
        ik: "#6a5f4c",
        mu: "#968a73",
        ac: "#8a6d3b",
        ai: "#fff8ec",
        bd: "#2b2418",
        sh: "0 1px 0 #e3dccc",
    }),
    mk(
        "chalk",
        "Chalk",
        "mono",
        false,
        "Zilla Slab",
        "Schibsted Grotesk",
        "Sometype Mono",
        600,
        0,
        {
            bg: "#ecebe8",
            cv: "#f7f6f3",
            ink: "#1c1c1a",
            ik: "#585853",
            mu: "#8a8a82",
            ac: "#3a3a36",
            ai: "#f7f6f3",
            bd: "#1c1c1a",
            sh: "none",
        },
    ),
    mk("ultra", "Ultra", "brutal", true, "Syncopate", "Sora", "Geist Mono", 700, 0, {
        bg: "#000000",
        cv: "#0b0b0b",
        ink: "#ffffff",
        ik: "#b0b0b0",
        mu: "#6e6e6e",
        ac: "#ffffff",
        ai: "#000000",
        bd: "#ffffff",
        bw: 4,
        sh: "none",
    }),
    mk("basalt", "Basalt", "stone", true, "Khand", "Commissioner", "Overpass Mono", 600, 0, {
        bg: "#121417",
        cv: "#1b1e22",
        ink: "#e6eaee",
        ik: "#a3acb4",
        mu: "#6c757d",
        ac: "#5b8f9c",
        ai: "#06100f",
        bd: "#2a2f35",
        bw: 2,
        sh: "6px 6px 0 #05070a",
    }),
    mk("citrus", "Citrus", "punch", false, "Bricolage Grotesque", "Outfit", "Space Mono", 700, 0, {
        bg: "#f4fbe8",
        cv: "#ffffff",
        ink: "#1b2a0c",
        ik: "#4f6630",
        mu: "#82985f",
        ac: "#6cbf21",
        ai: "#0e1c00",
        bd: "#1b2a0c",
        bw: 2,
        sh: "5px 5px 0 #6cbf21",
    }),
    mk("inkwell", "Inkwell", "classic", true, "Cardo", "Lora", "IBM Plex Mono", 700, 5, {
        bg: "#0e1116",
        cv: "#161b22",
        ink: "#e8e4d8",
        ik: "#aaa593",
        mu: "#726e60",
        ac: "#c9a24a",
        ai: "#1a1408",
        bd: "#2c333d",
        sh: "0 18px 40px -20px rgba(0,0,0,.7)",
    }),
    mk("forge", "Forge", "foundry", true, "Saira Stencil One", "Barlow", "Martian Mono", 400, 0, {
        bg: "#17120f",
        cv: "#211a15",
        ink: "#f0e8df",
        ik: "#b7a999",
        mu: "#847565",
        ac: "#e8761f",
        ai: "#1a0c02",
        bd: "#e8761f",
        bw: 3,
        sh: "4px 4px 0 #0c0907",
    }),
    mk("bauhaus", "Bauhaus", "constructivist", false, "Syncopate", "Jost", "Space Mono", 700, 0, {
        bg: "#F4F0E6",
        cv: "#FCFAF3",
        ink: "#1A1A1A",
        ik: "#4A4A45",
        mu: "#8A8A80",
        ac: "#0F4FD1",
        bd: "#1A1A1A",
        bw: 2,
        sh: "4px 4px 0 #1A1A1A",
    }),
    mk(
        "grimoire",
        "Grimoire",
        "blackletter",
        true,
        "Pirata One",
        "Cardo",
        "Fragment Mono",
        400,
        2,
        {
            bg: "#1A1012",
            cv: "#241719",
            ink: "#E8DCC0",
            ik: "#B7A584",
            mu: "#8A7A5F",
            ac: "#B01E24",
            ai: "#F4EAD2",
            bd: "#3A2A2A",
            sh: "0 8px 24px rgba(0,0,0,0.5)",
        },
    ),
    mk("frontier", "Frontier", "western", false, "Rye", "Bitter", "Sometype Mono", 400, 2, {
        bg: "#EDE2CC",
        cv: "#F5ECD8",
        ink: "#3A2A18",
        ik: "#6B5638",
        mu: "#9A8460",
        ac: "#A23A1E",
        ai: "#F7EFDC",
        bd: "#C9B68F",
        bw: 2,
        sh: "none",
    }),
    mk("atelier", "Atelier", "fashion", false, "Bodoni Moda", "Tenor Sans", "DM Mono", 500, 0, {
        bg: "#FCFCFC",
        cv: "#FFFFFF",
        ink: "#0C0C0C",
        ik: "#5A5A5A",
        mu: "#9C9C9C",
        ac: "#0C0C0C",
        bd: "#E2E2E2",
        sh: "none",
    }),
    mk(
        "peacock",
        "Peacock",
        "jewel luxe",
        true,
        "Cinzel",
        "Cormorant Garamond",
        "Overpass Mono",
        600,
        4,
        {
            bg: "#0A1F22",
            cv: "#0F2C30",
            ink: "#F1E9D2",
            ik: "#C2B894",
            mu: "#7E8C82",
            ac: "#CB9A3A",
            ai: "#0A1F22",
            bd: "#2A4F50",
            sh: "0 10px 30px rgba(0,0,0,0.55)",
        },
    ),
    mk(
        "adobe",
        "Adobe",
        "southwest",
        false,
        "Fraunces",
        "Hanken Grotesk",
        "IBM Plex Mono",
        600,
        6,
        {
            bg: "#F4EBE0",
            cv: "#FCF7EF",
            ink: "#3A2A20",
            ik: "#6B5444",
            mu: "#9A8474",
            ac: "#C25B33",
            ai: "#FFF6EF",
            bd: "#D9C8B6",
            sh: "none",
        },
    ),
    mk("sequoia", "Sequoia", "wood", true, "Spectral", "Mulish", "JetBrains Mono", 600, 16, {
        bg: "#2A1C16",
        cv: "#36251D",
        ink: "#EFE0D2",
        ik: "#C2A795",
        mu: "#8C7361",
        ac: "#CC7A45",
        ai: "#2A1810",
        bd: "#453126",
        bw: 0,
        sh: "0 8px 26px -10px rgba(0,0,0,.55)",
    }),
    mk("mesa", "Mesa", "desert poster", false, "Oswald", "Archivo", "DM Mono", 600, 0, {
        bg: "#EFE2CC",
        cv: "#F7EEDD",
        ink: "#3E2E1C",
        ik: "#715A40",
        mu: "#A08A6E",
        ac: "#B5481F",
        ai: "#FBEFE2",
        bd: "#3E2E1C",
        bw: 2,
        sh: "4px 4px 0 #B5481F",
    }),
    mk("henna", "Henna", "editorial", false, "Prata", "Jost", "DM Mono", 400, 8, {
        bg: "#F3E3D7",
        cv: "#FBEFE6",
        ink: "#45241A",
        ik: "#7A4838",
        mu: "#A8786A",
        ac: "#A8412C",
        ai: "#FBEDE6",
        bd: "#D49A82",
        sh: "none",
    }),
    mk("pueblo", "Pueblo", "western", false, "Rye", "Barlow", "Geist Mono", 400, 0, {
        bg: "#F1E3D0",
        cv: "#F9EFE0",
        ink: "#3B241A",
        ik: "#79503C",
        mu: "#A67E66",
        ac: "#C0512B",
        ai: "#FBEEE3",
        bd: "#3B241A",
        bw: 2,
        sh: "6px 6px 0 #C0512B",
    }),
    mk("voltcore", "Voltcore", "tech", true, "Michroma", "Inter Tight", "Martian Mono", 700, 2, {
        bg: "#0B0F14",
        cv: "#141A22",
        ink: "#E2E9EF",
        ik: "#97A6B3",
        mu: "#5D6E7C",
        ac: "#2BB8FF",
        ai: "#04121C",
        bd: "#283642",
        bw: 3,
        sh: "none",
    }),
    mk("regalia", "Regalia", "jewel", true, "Cinzel", "Jost", "IBM Plex Mono", 600, 4, {
        bg: "#07140F",
        cv: "#0C1E16",
        ink: "#EAF3EC",
        ik: "#AEC8B8",
        mu: "#6F8C7D",
        ac: "#CBA135",
        ai: "#142016",
        bd: "#234034",
        bw: 2,
        sh: "inset 0 0 0 1px #C9A23555",
    }),
    mk("carat", "Carat", "jewel", true, "Bodoni Moda", "Manrope", "Geist Mono", 500, 2, {
        bg: "#08101F",
        cv: "#0E1830",
        ink: "#E9EEF7",
        ik: "#A9B6D0",
        mu: "#6B7A9A",
        ac: "#BFC7D2",
        ai: "#131A2A",
        bd: "#1C2A47",
        sh: "0 1px 2px #00000066",
    }),
    mk(
        "newsstand",
        "Newsstand",
        "newsprint",
        false,
        "Newsreader",
        "Public Sans",
        "Fragment Mono",
        600,
        0,
        {
            bg: "#F3EFE6",
            cv: "#FAF7EF",
            ink: "#191613",
            ik: "#4F4940",
            mu: "#8A8275",
            ac: "#191613",
            ai: "#F3EFE6",
            bd: "#D9D2C4",
            sh: "none",
        },
    ),
    mk("graphite", "Graphite", "mono", true, "Archivo", "Space Mono", "Space Mono", 700, 2, {
        bg: "#0d0e10",
        cv: "#19191a",
        ink: "#e6e8ea",
        ik: "#a4a6a8",
        mu: "#747577",
        ac: "#dcdee0",
        ai: "#111212",
        bd: "#353638",
    }),
    mk("stencil", "Stencil", "brutalist", false, "Anton", "Archivo", "Space Mono", 400, 0, {
        bg: "#FFFFFF",
        cv: "#FFFFFF",
        ink: "#000000",
        ik: "#2E2E2E",
        mu: "#6B6B6B",
        ac: "#000000",
        ai: "#FFFFFF",
        bd: "#000000",
        bw: 4,
        sh: "none",
    }),
    mk(
        "bistre",
        "Bistre",
        "sepia",
        false,
        "Bodoni Moda",
        "Source Serif 4",
        "IBM Plex Mono",
        600,
        2,
        {
            bg: "#ECE2CF",
            cv: "#F4ECDB",
            ink: "#352A1D",
            ik: "#6B5C45",
            mu: "#9A8A6F",
            ac: "#352A1D",
            ai: "#ECE2CF",
            bd: "#CDBFA3",
            sh: "inset 0 0 0 3px #f4ecdb,inset 0 0 0 4px #d8ccb0",
        },
    ),
    mk("cinder", "Cinder", "mono", true, "Antonio", "Inter Tight", "JetBrains Mono", 700, 0, {
        bg: "#1A1816",
        cv: "#232019",
        ink: "#ECE7DF",
        ik: "#A8A298",
        mu: "#6F6A60",
        ac: "#ECE7DF",
        ai: "#1A1816",
        bd: "#34302A",
        sh: "0 0 0 1px #34302a,0 0 0 5px #1a1816,0 0 0 6px #34302a",
    }),
    mk(
        "cyanotype",
        "Cyanotype",
        "duotone",
        true,
        "Syncopate",
        "Commissioner",
        "Space Mono",
        700,
        0,
        {
            bg: "#0A1622",
            cv: "#102234",
            ink: "#DCE9F2",
            ik: "#8FA7BB",
            mu: "#5A7187",
            ac: "#D8702F",
            ai: "#160A02",
            bd: "#1C344A",
            sh: "inset 0 0 0 3px #102234",
        },
    ),
    mk(
        "telegraph",
        "Telegraph",
        "wire mono",
        true,
        "Oswald",
        "Overpass Mono",
        "Share Tech Mono",
        600,
        0,
        {
            bg: "#101113",
            cv: "#17191C",
            ink: "#E4E6E9",
            ik: "#9A9EA4",
            mu: "#62666C",
            ac: "#E4E6E9",
            ai: "#101113",
            bd: "#26292E",
            sh: "none",
        },
    ),
    // OKLCH-derived (palette lab) — harmonious tokens + guaranteed bg→surface lift.
    mk("stark", "Stark", "mono", false, "Archivo", "Space Mono", "Space Mono", 700, 2, {
        bg: "#f5f3f3",
        cv: "#fefcfc",
        ink: "#1f1c1d",
        ik: "#575555",
        mu: "#868384",
        ac: "#262324",
        ai: "#fafafa",
        bd: "#d6d3d4",
    }),
    mk("mint", "Mint", "crisp", false, "Space Grotesk", "Inter Tight", "Geist Mono", 600, 12, {
        bg: "#f1f4f2",
        cv: "#fafdfc",
        ink: "#1a1e1c",
        ik: "#535654",
        mu: "#818583",
        ac: "#099768",
        ai: "#f0fef6",
        bd: "#d1d5d3",
    }),
    mk("wine", "Wine", "luxe", true, "Cinzel", "Jost", "Geist Mono", 500, 4, {
        bg: "#130c0d",
        cv: "#1d1818",
        ink: "#f1e4e5",
        ik: "#aea2a3",
        mu: "#7d7273",
        ac: "#d78096",
        ai: "#190e11",
        bd: "#3c3435",
    }),
    mk("royal", "Royal", "luxe", true, "Cinzel", "Jost", "Geist Mono", 500, 4, {
        bg: "#0d0e13",
        cv: "#18191e",
        ink: "#e4e8f2",
        ik: "#a2a5ae",
        mu: "#72757d",
        ac: "#bf9846",
        ai: "#161107",
        bd: "#34363c",
    }),
];

export const DEFAULT_THEME = THEME_LIST[0]!;
export const THEMES: Record<string, Theme> = Object.fromEntries(THEME_LIST.map((t) => [t.id, t]));

// User-created themes, loaded from the backend by the app and registered here so resolveTheme can
// surface them by id exactly like a built-in — without the model doing any IO. The app replaces the
// whole set whenever its custom-theme store changes.
let CUSTOM: Record<string, Theme> = {};
export function registerThemes(themes: Theme[]): void {
    CUSTOM = Object.fromEntries(themes.map((t) => [t.id, t]));
}

export function resolveTheme(id: string): Theme {
    return THEMES[id] ?? CUSTOM[id] ?? DEFAULT_THEME;
}
