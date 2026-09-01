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

export const SLIDE_TRANSITIONS = ["cut", "fade", "push"] as const;
export type SlideTransition = (typeof SLIDE_TRANSITIONS)[number];

export const BUILD_RHYTHMS = ["none", "settle", "rise"] as const;
export type BuildRhythm = (typeof BUILD_RHYTHMS)[number];

// Playback only: motion never reaches layout, so every static render is unaffected by it.
export interface MotionTokens {
    transition: SlideTransition;
    build: BuildRhythm;
    duration: number; // ms for one slide change; the build stagger derives from it
    easing: string;
}

export const DEFAULT_MOTION: MotionTokens = {
    transition: "fade",
    build: "settle",
    duration: 260,
    easing: "cubic-bezier(.2,.7,.2,1)",
};

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
    motion?: Partial<MotionTokens>; // absent, or partial, falls back to DEFAULT_MOTION
}

export interface Theme {
    id: string;
    name: string;
    tag: string; // short descriptor (e.g. "editorial")
    dark: boolean;
    tokens: Tokens;
}

export const motionFor = (t: Tokens): MotionTokens => ({ ...DEFAULT_MOTION, ...t.motion });

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

const HEX6 = /^#[0-9a-fA-F]{6}$/;

// rgb (0..255) → hsl (h degrees, s/l 0..1)
export function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
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

export function hsl2hex(h: number, s: number, l: number): string {
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

// Where a receding mark recedes to: white on a light page (the shipped tint look), the page itself
// on a dark one — tinting dark-theme marks toward white collapses every step into the same pale
// card (a near-white accent like carbon's disappears entirely). The bg can be a translucent wash
// (the dark-section token swap); a light ink then means a dark page.
function pageTarget(t: Tokens): string {
    const darkPage = HEX6.test(t.bg) ? luminance(t.bg) < 0.5 : luminance(t.ink) >= 0.5;
    return darkPage ? (HEX6.test(t.bg) ? t.bg : "#101010") : "#ffffff";
}

// mix a mark color toward the page by f; the page-aware form of mixWhite
export function pageMix(color: string, t: Tokens, f: number): string {
    return mix(color, pageTarget(t), f);
}

// The accent → mark-color ramp, page-aware and always opaque: index 0 is the accent itself, later
// steps recede toward the page.
const RAMP_STEPS = [0, 0.3, 0.52, 0.68, 0.78];
export function accentRamp(t: Tokens, n: number): string[] {
    return Array.from({ length: Math.max(1, n) }, (_, i) =>
        pageMix(t.accent, t, RAMP_STEPS[i] ?? Math.min(0.84, 0.78 + (i - 4) * 0.02)),
    );
}

// Label ink for an arbitrary mark fill, by measured contrast: the theme's own inks where one
// clears AA, else whichever candidate reads best. Never assumes `ink` is dark — on a dark theme
// it is not.
export function inkOn(fill: string, t: Tokens): string {
    let best = t.ink;
    let bestRatio = 0;
    for (const c of [t.ink, t.onAccent, "#111111", "#ffffff"]) {
        const r = contrastRatio(c, fill);
        if (r >= 4.5) return c;
        if (r > bestRatio) {
            bestRatio = r;
            best = c;
        }
    }
    return best;
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

export function reachContrast(
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
    mo?: Partial<MotionTokens>; // playback motion (default DEFAULT_MOTION)
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
            ...(p.mo ? { motion: p.mo } : {}),
        },
    };
}

// the pickable set; studio + brut are the defaults
// The families a custom theme may choose from, beside the ones the built-in themes use. Here rather
// than in the editor that renders them because the vendoring script and its guard read the same
// list: a family offered in the picker but not vendored would silently render as a fallback face.
export const DISPLAY_FONTS = [
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
    "Fredoka",
    "Orbitron",
    "VT323",
    "Tektur",
    "Silkscreen",
    "Handjet",
    "Major Mono Display",
];
export const BODY_FONTS = [
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
    "Rajdhani",
    "Chakra Petch",
];
export const MONO_FONTS = [
    "DM Mono",
    "IBM Plex Mono",
    "Geist Mono",
    "Space Mono",
    "JetBrains Mono",
    "Fragment Mono",
    "Overpass Mono",
];

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
        mo: { transition: "cut", build: "none" },
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
        mo: { build: "rise", duration: 420 },
    }),
    // the true-black end: no radius, no lift, and the lightest scrim in the group so a photograph
    // still reads as a photograph against it
    mk("carbon", "Carbon", "monochrome", true, "Geist Mono", "Geist Mono", "Geist Mono", 500, 0, {
        bg: "#070707",
        cv: "#111111",
        ink: "#EDEDED",
        ik: "#ABABAB",
        mu: "#6E6E6E",
        ac: "#FAFAFA",
        ai: "#0A0A0A",
        bd: "#1F1F1F",
        sh: "none",
        sc: 0.28,
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
        mo: { transition: "push", build: "rise", duration: 180 },
    }),
    // the industrial slab, with the ink contrast it was missing: it sat at 11.8:1 where every
    // theme picked out of the library sits above 14.9:1
    mk("cement", "Cement", "industrial", false, "Anton", "Space Grotesk", "Space Mono", 400, 0, {
        bg: "#E4E2DD",
        cv: "#F1F0EC",
        ink: "#131311",
        ik: "#3E3E3A",
        mu: "#6E6E68",
        ac: "#2E2E2A",
        bd: "#131311",
        bw: 3,
        sh: "6px 6px 0 rgba(19,19,17,0.9)",
        sc: 0.5,
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
        mo: { transition: "cut", build: "none" },
    }),
    // cool paper, a small radius and a hairline: the quietest of the light set
    mk(
        "chalk",
        "Chalk",
        "mono",
        false,
        "Zilla Slab",
        "Schibsted Grotesk",
        "Sometype Mono",
        600,
        6,
        {
            bg: "#EFF0F1",
            cv: "#FAFBFB",
            ink: "#17191A",
            ik: "#43464A",
            mu: "#74787D",
            ac: "#2B2F33",
            bd: "#DCDEE1",
            sh: "none",
            sc: 0.42,
        },
    ),
    mk("atelier", "Atelier", "fashion", false, "Bodoni Moda", "Tenor Sans", "DM Mono", 500, 0, {
        bg: "#FCFCFC",
        cv: "#FFFFFF",
        ink: "#0C0C0C",
        ik: "#5A5A5A",
        // 3.2:1 on bg; #9C9C9C measured 2.7:1, under the 3:1 floor captions are held to
        mu: "#8C8C8C",
        ac: "#0C0C0C",
        bd: "#E2E2E2",
        sh: "none",
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
        mo: { transition: "cut", build: "settle", duration: 160 },
    }),
    // charcoal rather than black, with a 2px rule and a hard offset: the wire-room construction
    mk(
        "telegraph",
        "Telegraph",
        "wire mono",
        true,
        "Oswald",
        "Overpass Mono",
        "Share Tech Mono",
        600,
        2,
        {
            bg: "#1C1E22",
            cv: "#25282D",
            ink: "#F0F2F5",
            ik: "#BCC1C8",
            mu: "#8B929B",
            ac: "#E6E9ED",
            ai: "#1A1C20",
            bd: "#4A4F57",
            bw: 2,
            sh: "5px 5px 0 rgba(0,0,0,0.55)",
            sc: 0.62,
        },
    ),
    // hard-edged mono: square, 2px rule, offset block shadow
    mk("stark", "Stark", "mono", false, "Archivo", "Space Mono", "Space Mono", 700, 0, {
        bg: "#F6F4F4",
        cv: "#FFFDFD",
        ink: "#1B1819",
        ik: "#4A4749",
        mu: "#7A7679",
        ac: "#232021",
        bd: "#1B1819",
        bw: 2,
        sh: "5px 5px 0 rgba(27,24,25,0.14)",
        sc: 0.55,
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
        mo: { build: "rise", duration: 420 },
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
        mo: { build: "rise", duration: 380 },
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
    // Built to the recipe the picked themes share: a near-achromatic ground (chroma <= 0.012),
    // ink at 15:1 or better, one warm accent or none at all, a low radius, a hairline rule and no
    // soft lift. Character comes from the type and the accent, never from colouring the paper.

    // LIGHT
    mk("quire", "Quire", "editorial", false, "Prata", "Manrope", "IBM Plex Mono", 400, 0, {
        bg: "#F5F1E8",
        cv: "#FDFBF5",
        ink: "#17140E",
        ik: "#413C30",
        mu: "#7A7264",
        ac: "#A8341C",
        bd: "#DED7C6",
        sh: "none",
        sc: 0.55,
    }),
    // the poster: 3px rules, nothing rounded, and the heaviest scrim in the library so type
    // always wins over the picture behind it
    mk("placard", "Placard", "poster", false, "Oswald", "Barlow", "Space Mono", 600, 0, {
        bg: "#FBFBFA",
        cv: "#FFFFFF",
        ink: "#0C0C0C",
        ik: "#333333",
        mu: "#5F5F5F",
        ac: "#141414",
        bd: "#111111",
        bw: 3,
        sh: "none",
        sc: 0.68,
    }),
    mk("folio", "Folio", "classic", false, "Marcellus", "Mulish", "DM Mono", 400, 2, {
        bg: "#F6F3EC",
        cv: "#FEFCF8",
        ink: "#1B1710",
        ik: "#463F32",
        mu: "#7D7565",
        ac: "#8A6A22",
        bd: "#E4DCC8",
        sh: "none",
        sc: 0.4,
    }),
    // rounded and borderless, the opposite construction to placard at the same polarity
    mk(
        "signal",
        "Signal",
        "technical",
        false,
        "Space Grotesk",
        "Inter Tight",
        "JetBrains Mono",
        600,
        12,
        {
            bg: "#F3F5F7",
            cv: "#FCFDFE",
            ink: "#101216",
            ik: "#3A3E45",
            mu: "#6C7178",
            ac: "#1F2937",
            bd: "#DEE2E7",
            bw: 0,
            sh: "0 10px 30px rgba(16,18,22,0.10)",
            sc: 0.32,
        },
    ),
    mk("almanac", "Almanac", "field guide", false, "Spectral", "Figtree", "Overpass Mono", 600, 0, {
        bg: "#F2F4F0",
        cv: "#FBFCFA",
        ink: "#111511",
        ik: "#3B423A",
        mu: "#6E756B",
        ac: "#2F5D3A",
        bd: "#D6DBD2",
        sh: "4px 4px 0 rgba(17,21,17,0.10)",
        sc: 0.45,
    }),

    // the soft one: 14px, no rule at all, a wide lift, and a light scrim. The gallery wall.
    mk("onyx", "Onyx", "gallery", true, "Playfair Display", "Jost", "Fragment Mono", 500, 14, {
        bg: "#0C0C0C",
        cv: "#181818",
        ink: "#F4F2EE",
        ik: "#B4B0A9",
        mu: "#7C7871",
        ac: "#F4F2EE",
        ai: "#0C0C0C",
        bd: "#242424",
        bw: 0,
        sh: "0 14px 40px rgba(0,0,0,0.55)",
        sc: 0.38,
    }),
    mk("tide", "Tide", "nocturne", true, "Sora", "Figtree", "Geist Mono", 600, 4, {
        bg: "#0B0E13",
        cv: "#141922",
        ink: "#EAEEF5",
        ik: "#A7B0BE",
        mu: "#6E7784",
        ac: "#C7D6E8",
        ai: "#0B0E13",
        bd: "#242C38",
        sc: 0.35,
    }),
    mk("cellar", "Cellar", "newsprint", true, "Newsreader", "Archivo", "IBM Plex Mono", 600, 2, {
        bg: "#100C0B",
        cv: "#191312",
        ink: "#F2EBE7",
        ik: "#B9AEA8",
        mu: "#847871",
        ac: "#E0684B",
        ai: "#1A0A06",
        bd: "#2C2320",
        sh: "none",
        sc: 0.62,
    }),
    mk("verdigris", "Verdigris", "patina", true, "Cinzel", "Albert Sans", "Overpass Mono", 400, 0, {
        bg: "#0A0E0C",
        cv: "#121815",
        ink: "#E9EFEA",
        ik: "#AAB6AE",
        mu: "#75837B",
        ac: "#77B08C",
        ai: "#08120C",
        bd: "#202924",
        sh: "0 0 28px rgba(119,176,140,0.14)",
        sc: 0.5,
    }),
    // Replacing pueblo / orchard / ember / foundry. The first two were the only themes in the
    // library with coloured paper (chroma 0.030 and 0.021) and the lowest ink contrast in it
    // (11.4:1, 10.5:1); these keep the ground near-achromatic and the ink above 15:1, and take
    // their variety from radius, rule weight, shadow and scrim instead.
    mk(
        "loft",
        "Loft",
        "warm modern",
        false,
        "Bricolage Grotesque",
        "Albert Sans",
        "DM Mono",
        600,
        20,
        {
            bg: "#F4F1EC",
            cv: "#FDFBF8",
            ink: "#17140F",
            ik: "#413B33",
            mu: "#777066",
            ac: "#B4552B",
            bd: "#E3DED5",
            bw: 0,
            sh: "0 12px 34px rgba(23,20,15,0.10)",
            sc: 0.34,
        },
    ),
    mk("drift", "Drift", "cool paper", false, "Sora", "Figtree", "Geist Mono", 600, 4, {
        bg: "#F2F4F6",
        cv: "#FBFCFD",
        ink: "#111417",
        ik: "#3C4045",
        mu: "#6F747A",
        ac: "#243040",
        bd: "#D3D8DD",
        bw: 1,
        sh: "none",
        sc: 0.3,
    }),
    mk("kiln", "Kiln", "foundry", true, "Anton", "Barlow", "Space Mono", 400, 0, {
        bg: "#141210",
        cv: "#1E1B18",
        ink: "#F4EFE8",
        ik: "#BEB5A9",
        mu: "#8A8177",
        ac: "#DE9A3A",
        ai: "#181004",
        bd: "#DE9A3A",
        bw: 3,
        sh: "6px 6px 0 rgba(222,154,58,0.24)",
        sc: 0.5,
    }),
    mk("basalt", "Basalt", "slate", true, "Spectral", "Inter Tight", "Geist Mono", 600, 2, {
        bg: "#212429",
        cv: "#2A2E33",
        ink: "#F1F3F5",
        ik: "#BCC1C6",
        mu: "#8A9096",
        ac: "#E8EAEC",
        ai: "#212427",
        bd: "#464B51",
        sh: "none",
        sc: 0.58,
    }),
    // A second pass on the same recipe, placed to fill gaps rather than crowd: light had no glow
    // at all, radius clustered at 0, scrim clustered at 0.5, and nine display faces were unused.

    // LIGHT
    mk("quill", "Quill", "letterpress", false, "Yeseva One", "Mulish", "DM Mono", 400, 8, {
        bg: "#F7F4ED",
        cv: "#FEFCF7",
        ink: "#171309",
        ik: "#443C2C",
        mu: "#7C7362",
        ac: "#B23A22",
        bd: "#E5DFD1",
        sh: "0 0 26px rgba(178,58,34,0.10)",
        sc: 0.22,
    }),
    mk("ledger", "Ledger", "record", false, "Cormorant Garamond", "Jost", "Sometype Mono", 600, 0, {
        bg: "#F7F8FA",
        cv: "#FDFDFE",
        ink: "#101215",
        ik: "#3B3E44",
        mu: "#6E727A",
        ac: "#1B1E23",
        bd: "#101215",
        bw: 2,
        sh: "none",
        sc: 0.72,
    }),
    mk(
        "meadow",
        "Meadow",
        "open air",
        false,
        "Quicksand",
        "Albert Sans",
        "Overpass Mono",
        600,
        24,
        {
            bg: "#F1F4EF",
            cv: "#FAFCF9",
            ink: "#131612",
            ik: "#3E443B",
            mu: "#717A6D",
            ac: "#3C6B45",
            bd: "#DCE2D9",
            bw: 0,
            sh: "0 12px 32px rgba(19,22,18,0.10)",
            sc: 0.38,
        },
    ),
    mk("column", "Column", "civic", false, "Cinzel", "Barlow", "IBM Plex Mono", 400, 2, {
        bg: "#FDFDFD",
        cv: "#FFFFFF",
        ink: "#0D0D0D",
        ik: "#363636",
        mu: "#626262",
        ac: "#1C1C1C",
        bd: "#0D0D0D",
        bw: 2,
        sh: "5px 5px 0 rgba(13,13,13,0.12)",
        sc: 0.55,
    }),
    mk("rind", "Rind", "preserve", false, "Spectral", "Manrope", "JetBrains Mono", 600, 10, {
        bg: "#F5F2EA",
        cv: "#FDFBF5",
        ink: "#191509",
        ik: "#453E2C",
        mu: "#7B7360",
        ac: "#96682A",
        bd: "#E4DCC7",
        sc: 0.48,
    }),

    // DARK
    mk(
        "vesper",
        "Vesper",
        "evening",
        true,
        "Cormorant Garamond",
        "Jost",
        "Fragment Mono",
        500,
        16,
        {
            bg: "#0D0B0F",
            cv: "#171419",
            ink: "#F2EEF4",
            ik: "#B3ADB8",
            mu: "#7B7580",
            ac: "#E8D8DC",
            ai: "#0D0B0F",
            bd: "#241F27",
            bw: 0,
            sh: "0 16px 44px rgba(0,0,0,0.6)",
            sc: 0.25,
        },
    ),
    mk("ingot", "Ingot", "press room", true, "Anton", "Inter Tight", "Space Mono", 400, 0, {
        bg: "#14120D",
        cv: "#1D1A14",
        ink: "#F3EFE4",
        ik: "#BAB3A2",
        mu: "#86806F",
        ac: "#EFE9DA",
        ai: "#14120D",
        bd: "#3A342A",
        bw: 2,
        sh: "5px 5px 0 rgba(0,0,0,0.6)",
        sc: 0.7,
    }),
    mk("fathom", "Fathom", "deep water", true, "Sora", "Manrope", "JetBrains Mono", 600, 10, {
        bg: "#101418",
        cv: "#191E24",
        ink: "#E9EEF3",
        ik: "#A9B2BC",
        mu: "#737C86",
        ac: "#BFD6E4",
        ai: "#101418",
        bd: "#262D35",
        sh: "none",
        sc: 0.3,
    }),
    mk("tallow", "Tallow", "candlelight", true, "Yeseva One", "Mulish", "DM Mono", 400, 6, {
        bg: "#12100B",
        cv: "#1B1811",
        ink: "#F3EDDD",
        ik: "#BDB49F",
        mu: "#877F6C",
        ac: "#E6D6A8",
        ai: "#12100B",
        bd: "#2E291D",
        sh: "0 0 30px rgba(230,214,168,0.12)",
        sc: 0.5,
    }),
    mk(
        "anvil",
        "Anvil",
        "workshop",
        true,
        "Bricolage Grotesque",
        "Barlow",
        "Overpass Mono",
        700,
        2,
        {
            bg: "#1B1D21",
            cv: "#24272C",
            ink: "#EFF1F4",
            ik: "#B7BCC3",
            mu: "#858B93",
            ac: "#E08A45",
            ai: "#180C03",
            bd: "#E08A45",
            bw: 3,
            sh: "6px 6px 0 rgba(224,138,69,0.22)",
            sc: 0.6,
        },
    ),
];

// Every family the product can render: what the built-in themes use, plus what a custom theme may
// pick. The vendoring script and its guard both read this, so a family can never be offered without
// a face to render it in.
export const themeFontFamilies = (): string[] => {
    const set = new Set<string>([...DISPLAY_FONTS, ...BODY_FONTS, ...MONO_FONTS]);
    for (const t of THEME_LIST) {
        set.add(t.tokens.fontDisplay);
        set.add(t.tokens.fontBody);
        set.add(t.tokens.fontMono);
    }
    return [...set].sort();
};
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
