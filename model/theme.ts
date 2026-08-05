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
    fontDisplay: string; // family name for headings
    fontBody: string; // family name for body / UI
    fontMono: string; // family name for labels / mono
    headingWeight: number; // weight for display-role text
    border?: number; // border width for cards/sections
    shadow?: string; // box-shadow for cards
    scrim?: number; // 0..1 darkening over bg images; default 0.45
}

export interface Theme {
    id: string;
    name: string;
    tag: string; // short descriptor (e.g. "editorial")
    dark: boolean;
    tokens: Tokens;
}

export function fontStack(role: FontRole, t: Tokens): string {
    if (role === "display") return `'${t.fontDisplay}', serif`;
    if (role === "mono") return `'${t.fontMono}', monospace`;
    return `'${t.fontBody}', sans-serif`;
}

// set on a root element to recolor the chrome
export function themeCssVars(t: Tokens): Record<string, string> {
    // anchored so radius 16 lands on Tailwind's default radius scale
    const rad = (base: number): string => `${Math.round((base * t.radius) / 16 / 0.25) * 0.25}px`;
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
        "--radius-xs": rad(2),
        "--radius-sm": rad(4),
        "--radius-md": rad(6),
        "--radius-lg": rad(8),
        "--radius-xl": rad(12),
        "--radius-2xl": rad(16),
        "--radius-3xl": rad(24),
        "--font-display": `'${t.fontDisplay}', serif`,
        "--font-body": `'${t.fontBody}', system-ui, sans-serif`,
        "--font-mono": `'${t.fontMono}', monospace`,
        "--hw": String(t.headingWeight),
    };
}

// ThemeSummary = lightweight wire record; ThemeInput = create/update body
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

// color utilities operate on #rrggbb (or #rgb) hex
export function hexToRgb(hex: string): [number, number, number] {
    const s = hex.replace("#", "");
    const n = s.length === 3 ? s.replace(/./g, "$&$&") : s;
    return [
        parseInt(n.slice(0, 2), 16) || 0,
        parseInt(n.slice(2, 4), 16) || 0,
        parseInt(n.slice(4, 6), 16) || 0,
    ];
}

// perceived luminance 0→1; non-6-digit input → 1 (light)
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

// mix a hex toward white by fraction f (0 = unchanged, 1 = white)
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

// blend two hex colors (t: 0 → a, 1 → b); non-hex → a
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

// hex → rgba() with alpha a; non-6-digit → unchanged
export function hexA(hex: string, a: number): string {
    // an rgba input keeps its channels and scales the alpha it already carries
    const rgba = hex.match(/^rgba?\(([^)]+)\)/i);
    if (rgba) {
        const p = rgba[1]!.split(",").map((x) => parseFloat(x.trim()));
        if (p.length < 3 || p.some((n) => Number.isNaN(n))) return hex;
        return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(p[3] ?? 1) * a})`;
    }
    const h = hex.replace("#", "");
    if (h.length < 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// sRGB channel (0..255) → linear-light 0..1.
function toLinear(c: number): number {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
// linear-light 0..1 → sRGB channel 0..255 (clamped).
function fromLinear(c: number): number {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
}
const hx2 = (n: number): string => n.toString(16).padStart(2, "0");

// WCAG relative luminance, 0 (black) → 1 (white).
export function relLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// WCAG contrast ratio between two colors: 1 (identical) → 21 (black vs white). 4.5 = AA body text.
export function contrastRatio(a: string, b: string): number {
    const la = relLuminance(a);
    const lb = relLuminance(b);
    return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

// perceptual OKLCH: L (0..1), C (chroma), H (hue radians)
export interface Oklch {
    L: number;
    C: number;
    H: number;
}

export function hexToOklch(hex: string): Oklch {
    const [r8, g8, b8] = hexToRgb(hex);
    const r = toLinear(r8);
    const g = toLinear(g8);
    const b = toLinear(b8);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) };
}

export function oklchToHex({ L, C, H }: Oklch): string {
    const A = C * Math.cos(H);
    const B = C * Math.sin(H);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return `#${hx2(fromLinear(r))}${hx2(fromLinear(g))}${hx2(fromLinear(b))}`;
}

// post-process an AI-generated theme into a production-safe one

const ACCENT_CHROMA_MAX = 0.155; // OKLCH chroma ceiling; above this reads as neon
const ACCENT_L_MAX_DARK = 0.74; // a too-light accent glows on a dark theme
const ACCENT_L_MAX_LIGHT = 0.82; // a too-light accent washes out on a light theme
const ACCENT_L_MIN = 0.4; // below this an accent turns muddy/near-black
const ACCENT_MIN_VS_BG = 1.8; // accent must read as a distinct mark vs the page
// garish yellow→lime hue band (OKLCH°); starts at 95° so warm golds/ambers stay untouched
const GARISH_HUE: [number, number] = [95, 155];

const toDeg = (h: number): number => ((((h * 180) / Math.PI) % 360) + 360) % 360;

function sanitizeAccent(hex: string, dark: boolean, bg: string): string {
    const o = hexToOklch(hex);
    const deg = toDeg(o.H);
    const garish = deg >= GARISH_HUE[0] && deg <= GARISH_HUE[1];
    const cMax = garish ? 0.125 : ACCENT_CHROMA_MAX;
    const lMax = garish ? 0.76 : dark ? ACCENT_L_MAX_DARK : ACCENT_L_MAX_LIGHT;
    let L = Math.max(ACCENT_L_MIN, Math.min(o.L, lMax));
    const C = Math.min(o.C, cMax);
    let out = oklchToHex({ L, C, H: o.H });

    // on a light page, deepen a pale accent (the invisible-yellow case)
    const bgLight = relLuminance(bg) >= 0.4;
    for (let i = 0; i < 10 && contrastRatio(out, bg) < ACCENT_MIN_VS_BG; i++) {
        L = Math.max(0.34, Math.min(0.86, L + (bgLight ? -0.045 : 0.045)));
        out = oklchToHex({ L, C, H: o.H });
    }
    return out;
}

function reachContrast(
    fg: string,
    bg: string,
    ratio: number,
    toward: "#000000" | "#ffffff",
): string {
    if (contrastRatio(fg, bg) >= ratio) return fg;
    for (let f = 0.12; f < 1; f += 0.12) {
        const out = mix(fg, toward, f);
        if (contrastRatio(out, bg) >= ratio) return out;
    }
    return toward;
}

export function finalizeTheme(t: Tokens): Tokens {
    const dark = relLuminance(t.bg) < 0.4;
    const textToward = dark ? "#ffffff" : "#000000";

    const accent = sanitizeAccent(t.accent, dark, t.bg);

    const onAccent =
        contrastRatio("#0a0a0a", accent) >= contrastRatio("#ffffff", accent)
            ? "#0a0a0a"
            : "#ffffff";

    let surface = t.surface;
    if (dark && contrastRatio(t.bg, surface) < 1.06) {
        const bo = hexToOklch(t.bg);
        surface = oklchToHex({ ...bo, L: bo.L + 0.045 });
    }

    // AA+ on the surface for ink, stepping down for soft/muted
    const ink = reachContrast(t.ink, surface, 5.5, textToward);
    const soft = reachContrast(t.soft, surface, 3.8, textToward);
    const muted = reachContrast(t.muted, surface, 2.6, textToward);

    return { ...t, accent, onAccent, surface, ink, soft, muted };
}

// Pal→Tokens mapping: surface=cv, soft=ik, muted=mu, line=bd, onAccent=ai (or white); bw/sh override defaults.
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

// the pickable set; studio + brut are the defaults
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
    mk("arcade", "Arcade", "8-bit", true, "Press Start 2P", "Chakra Petch", "VT323", 400, 0, {
        bg: "#0B0F14",
        cv: "#121821",
        ink: "#E6F0E6",
        ik: "#9FB4A8",
        mu: "#5F7468",
        ac: "#98DDA9",
        ai: "#07120A",
        bd: "#243240",
        bw: 2,
        sh: "0 0 18px rgba(152,221,169,0.25)",
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
    mk("royal", "Royal", "luxe", true, "Cinzel", "Jost", "Geist Mono", 500, 4, {
        bg: "#0d0e13",
        cv: "#18191e",
        ink: "#e4e8f2",
        ik: "#a2a5ae",
        mu: "#72757d",
        ac: "#f4c357",
        ai: "#161107",
        bd: "#34363c",
    }),
    mk("vellum", "Vellum", "classic", true, "Playfair Display", "Mulish", "Sometype Mono", 500, 6, {
        bg: "#121110",
        cv: "#1B1917",
        ink: "#EFE7D7",
        ik: "#BAB0A0",
        mu: "#857D6E",
        ac: "#E6D8BC",
        ai: "#171204",
        bd: "#343029",
        sh: "0 0 24px rgba(230,216,188,0.14)",
    }),
    mk("noir", "Noir", "fashion", true, "Bodoni Moda", "Tenor Sans", "Fragment Mono", 500, 0, {
        bg: "#0D0D0D",
        cv: "#151515",
        ink: "#F4F1EA",
        ik: "#ADA89E",
        mu: "#726E66",
        ac: "#B54439",
        ai: "#FFF4EF",
        bd: "#272727",
        sh: "none",
    }),
    mk("moss", "Moss", "natural", true, "Marcellus", "Figtree", "Overpass Mono", 400, 8, {
        bg: "#10140F",
        cv: "#181E16",
        ink: "#E9EDE2",
        ik: "#B4BDA9",
        mu: "#7C8571",
        ac: "#98B589",
        ai: "#121A0D",
        bd: "#2C3427",
        sh: "0 6px 22px rgba(0,0,0,0.4)",
    }),
    mk("foundry", "Foundry", "industrial", true, "Anton", "Barlow", "Space Mono", 400, 0, {
        bg: "#131313",
        cv: "#1B1B1B",
        ink: "#EDECE7",
        ik: "#AAA9A2",
        mu: "#74736C",
        ac: "#DD9D35",
        ai: "#191204",
        bd: "#3A3936",
        bw: 2,
        sh: "4px 4px 0 rgba(221,157,53,0.85)",
    }),
];

export const DEFAULT_THEME = THEME_LIST[0]!;
export const THEMES: Record<string, Theme> = Object.fromEntries(THEME_LIST.map((t) => [t.id, t]));

// user-created themes registered by the app so resolveTheme surfaces them by id (no IO)
let CUSTOM: Record<string, Theme> = {};
export function registerThemes(themes: Theme[]): void {
    CUSTOM = Object.fromEntries(themes.map((t) => [t.id, t]));
}

export function resolveTheme(id: string): Theme {
    return THEMES[id] ?? CUSTOM[id] ?? DEFAULT_THEME;
}
