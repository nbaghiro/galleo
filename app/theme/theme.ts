// App theme state: the active app-chrome theme + drawer open/close state, favicon sync, editor-overlay token vars, and the sample artifact used in theme previews.

import { createSignal } from "solid-js";
import { resolveTheme } from "@themes/library";
import { themeCssVars } from "@themes/theme";
import type { JSX } from "solid-js";
import type { Tokens } from "@themes/theme";
import { useLocation } from "@solidjs/router";
import { editorTokens } from "@studio/editor";
import type { ElementInstance, Section } from "@model/artifact";

// The app-chrome theme (auth, library, settings…) — distinct from a deck's artifact theme. Persisted
// to localStorage so the choice survives logout/login on this browser, and so the sign-in page already
// wears it before the user authenticates. Defaults to Concrete.
const KEY = "galleo:app-theme";
const DEFAULT = "brut";

// localStorage can throw when the browser blocks site storage — never let it break app boot.
let stored: string | null = null;
try {
    stored = localStorage.getItem(KEY);
} catch {
    /* storage unavailable — fall back to the default */
}

export const [appTheme, setAppThemeSignal] = createSignal(stored || DEFAULT);

export function setAppTheme(id: string): void {
    setAppThemeSignal(id);
    try {
        localStorage.setItem(KEY, id);
    } catch {
        /* storage unavailable — the choice lives in memory for this session */
    }
}

// CSS variables for the active app theme — set on the app root so every child (sign-in included)
// recolors via the shared Tailwind tokens.
export function appThemeVars(): JSX.CSSProperties {
    return themeCssVars(resolveTheme(appTheme()).tokens) as JSX.CSSProperties;
}

// Global open-state for the singular theme drawer — any app-level trigger (sidebar button, editor
// pill) flips it; the drawer itself is mounted once at the app root.
const [themeDrawerOpen, setThemeDrawerOpen] = createSignal(false);

export { themeDrawerOpen };

export function openThemeDrawer(): void {
    setThemeDrawerOpen(true);
}

export function closeThemeDrawer(): void {
    setThemeDrawerOpen(false);
}

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

// App-level overlays (theme drawer, modals) mount at the app root, so they inherit the app-chrome theme.
// Floated over the editor that clashes with the editor-themed studio underneath — so they adopt the
// artifact/editor theme there instead, matching the surrounding surface (the same idea as the themed
// Dropdown). Off the editor they keep the app theme.

// The active editor/artifact theme as inline CSS vars, to apply on an overlay root.
export const editorThemeCssVars = (): JSX.CSSProperties =>
    themeCssVars(editorTokens()) as JSX.CSSProperties;

// Snapshot for a mount-on-open overlay (modal): the editor theme when over the editor, else undefined
// (keep the app theme). Call once in the component body — it reads location + theme untracked there, so
// the overlay is stamped at open and won't restyle while the theme is previewed/changed underneath.
export function overlayThemeVars(): JSX.CSSProperties | undefined {
    return useLocation().pathname.includes("/edit/") ? editorThemeCssVars() : undefined;
}

// One small cover section used to preview a theme (in drawer cards + the builder) — enough content to
// read a theme's surfaces, ink, accent, fonts, and heading weight at a glance.
const tx = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});
const button = (label: string): ElementInstance => ({ type: "button", data: { label } });
const group = (...children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});

export const THEME_SAMPLE: Section = {
    id: "theme-sample",
    grid: "full",
    cells: {
        a: {
            element: group(
                tx("Galleo · design system", "label"),
                tx("A theme you can feel", "h1"),
                tx(
                    "One token set themes every surface — decks, docs, and sites alike.",
                    "subtitle",
                ),
                button("Get started"),
            ),
        },
    },
};
