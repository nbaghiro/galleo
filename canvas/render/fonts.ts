export const BOLD_MIN = 600; // weights ≥ this render bold (PowerPoint/PDF have bold/regular only)

export type FontSlot = "regular" | "bold" | "italic" | "boldItalic";

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

// 400 when the shorthand carries no weight
export function weightFromFont(font: string): number {
    const m = font.match(/(?:^|\s)(\d{3})\s+\d/);
    return m ? parseInt(m[1]!, 10) : 400;
}

export const italicFromFont = (font: string): boolean => font.trimStart().startsWith("italic");

// The vendored face, served from our own origin. `pnpm fonts:vendor` writes these and
// `pnpm check:fonts` proves every family a theme can name has one, so an export no longer reaches a
// third party mid-render: it used to fetch each face from Google behind a 10 second deadline.
export const fontSlug = (family: string): string =>
    family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function fontFileUrl(family: string, weight: number, italic: boolean): string {
    return `/fonts/${fontSlug(family)}-${weight}${italic ? "i" : ""}.woff2`;
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
    const res = await fetch(fontFileUrl(family, weight, italic));
    if (!res.ok) return null; // a weight the family does not have was never vendored
    const bytes = new Uint8Array(await res.arrayBuffer());
    // PDF and PPTX embed sfnt, so a woff2 still has to come apart; the network hop is what went away
    const { decompress } = await import("wawoff2");
    return await decompress(bytes);
}

// Static families 400 on off-menu weights, so a miss retries at the slot's canonical weight.
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
