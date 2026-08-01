// Shared font utilities for the export backends: parse CSS `font` shorthands, bucket weight/italic into
// slots, and fetch+transcode a Google font to TTF (the sfnt both pptx font-embedding and pdf-lib need).

export const BOLD_MIN = 600; // weights ≥ this render bold (PowerPoint/PDF have bold/regular only)

export type FontSlot = "regular" | "bold" | "italic" | "boldItalic";

// four slots per typeface; weights collapse to bold (≥ BOLD_MIN) × italic
export function slotFor(weight: number, italic: boolean): FontSlot {
    const bold = weight >= BOLD_MIN;
    return bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
}

// family name from a CSS stack or `font` shorthand; must match the embedded font
export function familyFromFont(font: string): string {
    let s = font;
    const px = s.indexOf("px ");
    if (px >= 0) s = s.slice(px + 3); // drop the "<weight> <size>px " head of a shorthand
    const first = s.split(",")[0]!.trim();
    return first.replace(/^['"]|['"]$/g, "") || "Arial";
}

// numeric weight from a `font` shorthand; 400 when absent
export function weightFromFont(font: string): number {
    const m = font.match(/(?:^|\s)(\d{3})\s+\d/);
    return m ? parseInt(m[1]!, 10) : 400;
}

export const italicFromFont = (font: string): boolean => font.trimStart().startsWith("italic");

// Google Fonts CSS URL; a browser UA gets woff2 back. display=swap is harmless
export function googleCssUrl(family: string, weight: number, italic: boolean): string {
    const fam = family.trim().replace(/\s+/g, "+");
    return `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
}

// font URL from a Google Fonts CSS response, preferring the latin subset; Google serves woff2 (modern UA) or
// ttf/otf (legacy) — flag whether a woff2→TTF transcode is needed
export interface FontSrc {
    url: string;
    woff2: boolean;
}

export function parseFontUrl(css: string): FontSrc | null {
    const pick = (block: string): FontSrc | null => {
        const m = block.match(/url\((https:[^)]+\.(?:woff2|ttf|otf))\)/);
        return m ? { url: m[1]!, woff2: m[1]!.endsWith(".woff2") } : null;
    };
    for (const block of css.split("/*"))
        if (/^\s*latin\s*\*\//.test(block)) {
            const hit = pick(block);
            if (hit) return hit;
        }
    return pick(css);
}

const FONT_FETCH_TIMEOUT_MS = 10_000;

// resolves null past the deadline — a stalled fetch or wasm init must not wedge an export
function withDeadline<T>(p: Promise<T | null>, ms = FONT_FETCH_TIMEOUT_MS): Promise<T | null> {
    return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function fetchTtfOnce(
    family: string,
    weight: number,
    italic: boolean,
): Promise<Uint8Array | null> {
    const res = await fetch(googleCssUrl(family, weight, italic));
    if (!res.ok) return null; // css2 rejects weights the family lacks (e.g. Space Mono 600)
    const src = parseFontUrl(await res.text());
    if (!src) return null;
    const bytes = new Uint8Array(await (await fetch(src.url)).arrayBuffer());
    if (!src.woff2) return bytes; // already a usable sfnt (ttf/otf)
    const { decompress } = await import("wawoff2");
    return await decompress(bytes);
}

// fetch + transcode woff2→TTF; null on any failure (slot skipped / caller falls back).
// Static families 400 on off-menu weights, so a miss retries at the slot's canonical weight —
// keeps e.g. Space Mono 600 rendering as real Space Mono bold instead of a standard-font fallback.
export async function fetchFontTtf(
    family: string,
    weight: number,
    italic: boolean,
): Promise<Uint8Array | null> {
    try {
        const exact = await withDeadline(fetchTtfOnce(family, weight, italic));
        if (exact) return exact;
        const snapped = weight >= BOLD_MIN ? 700 : 400;
        if (snapped === weight) return null;
        return await withDeadline(fetchTtfOnce(family, snapped, italic));
    } catch {
        return null;
    }
}
