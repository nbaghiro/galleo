import { createSignal } from "solid-js";
import type { Tokens } from "@themes/theme";

// A theme-reactive favicon — the brand "G" badge recolored to the active theme (accent fill, accent-ink
// glyph) with a corner radius that tracks the theme's own radius. Driven by app/App.tsx.

// Optional override: the editor route sets this to the artifact's theme while editing; cleared on exit,
// so the favicon falls back to the app-chrome theme everywhere else.
const [faviconOverride, setFaviconOverride] = createSignal<string | null>(null);
export { faviconOverride, setFaviconOverride };

export function setFavicon(tokens: Tokens): void {
    const rx = Math.max(1.5, Math.min(9, tokens.radius * 0.42)).toFixed(2);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        `<rect width="32" height="32" rx="${rx}" fill="${tokens.accent}"/>` +
        `<text x="16.5" y="23.3" font-family="Georgia,'Times New Roman',serif" font-size="23" ` +
        `font-weight="700" fill="${tokens.onAccent}" text-anchor="middle">G</text>` +
        `</svg>`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
