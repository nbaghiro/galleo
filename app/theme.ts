// App theme state: the active app-chrome theme + drawer open/close state, favicon sync, editor-overlay token vars, and the sample artifact used in theme previews.

import { createSignal } from "solid-js";
import { resolveTheme, registerThemes } from "@themes/library";
import { themeCssVars } from "@themes/theme";
import type { JSX } from "solid-js";
import type { Theme, Tokens } from "@themes/theme";
import { api, type ApiTheme } from "./api";
import { useLocation } from "@solidjs/router";
import { editorTokens } from "@editor/editor";
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

// A live, non-persisted override for the app-chrome tokens. The theme editor sets this to its draft
// tokens while open, so the whole app recolors *behind* the modal in real time; cleared on close, which
// restores the resolved `appTheme()`. Distinct from setAppTheme (which persists a saved theme id).
const [appThemeOverride, setAppThemeOverride] = createSignal<Tokens | null>(null);
export { appThemeOverride };
export function setAppThemePreview(tokens: Tokens | null): void {
    setAppThemeOverride(tokens);
}

// CSS variables for the active app theme — set on the app root so every child (sign-in included)
// recolors via the shared Tailwind tokens. The live draft override wins while the theme editor is open.
export function appThemeVars(): JSX.CSSProperties {
    return themeCssVars(appThemeOverride() ?? resolveTheme(appTheme()).tokens) as JSX.CSSProperties;
}

// The theme editor is a single large modal — the whole theme surface (a predefined-theme picker + a
// custom-theme token editor + a live preview in one). Mounted once at the app root; opened from any
// theme trigger (sidebar button, editor pill). It selects the current theme on open and applies
// context-aware (the open artifact while editing, else the app-chrome theme).
const [themeEditorOpen, setThemeEditorOpen] = createSignal(false);

export { themeEditorOpen };

export function openThemeEditor(): void {
    setThemeEditorOpen(true);
}

export function closeThemeEditor(): void {
    setThemeEditorOpen(false);
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

// ── custom (user-created) themes: loaded from the backend + registered into @themes ──
// User-created themes for the workspace — loaded from the backend, registered with the @themes
// registry so they resolve by id like built-ins (in artifacts AND previews), and listed in the theme
// drawer. Mutations are optimistic; the registry is re-synced on every change.
const [customThemes, setCustomThemes] = createSignal<Theme[]>([]);
let loaded = false;

export { customThemes };

function toTheme(a: ApiTheme): Theme {
    return { id: a.id, name: a.name, tag: a.mood ?? "custom", dark: a.isDark, tokens: a.tokens };
}

function sync(list: Theme[]): void {
    setCustomThemes(list);
    registerThemes(list);
}

export async function loadCustomThemes(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        const r = await api.listThemes();
        sync(r.themes.map(toTheme));
    } catch {
        loaded = false;
    }
}

export interface ThemeDraft {
    name: string;
    tokens: Tokens;
    tag: string;
    dark: boolean;
}

export async function saveCustomTheme(d: ThemeDraft): Promise<Theme | null> {
    try {
        const { theme } = await api.createTheme({
            name: d.name,
            tokens: d.tokens,
            mood: d.tag,
            isDark: d.dark,
        });
        const t = toTheme(theme);
        sync([...customThemes(), t]);
        return t;
    } catch {
        return null;
    }
}

export async function updateCustomTheme(id: string, d: ThemeDraft): Promise<Theme | null> {
    try {
        const { theme } = await api.updateTheme(id, {
            name: d.name,
            tokens: d.tokens,
            mood: d.tag,
            isDark: d.dark,
        });
        const t = toTheme(theme);
        sync(customThemes().map((x) => (x.id === id ? t : x)));
        return t;
    } catch {
        return null;
    }
}

export function removeCustomTheme(id: string): void {
    sync(customThemes().filter((t) => t.id !== id));
    api.deleteTheme(id).catch(() => {});
}
